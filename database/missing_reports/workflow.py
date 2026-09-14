"""Transactional review store. Only trusted server code may call ingest()."""
import base64
import hashlib
import hmac
import json
import os
import re
import sqlite3
import time
import uuid
from contextlib import contextmanager

from database.Validation.db021_validator import DB021Validator
from database.pipeline.modules.pre_seeding_validation import validate_record

TRANSITIONS = {
    'PENDING': {'IN_REVIEW', 'DUPLICATE'},
    'IN_REVIEW': {'PENDING', 'ACCEPTED', 'REJECTED', 'DUPLICATE'},
    'ACCEPTED': set(), 'REJECTED': set(), 'DUPLICATE': set(),
}
REASONS = {'REJECTED': {'INSUFFICIENT_INFORMATION', 'INVALID_PRODUCT', 'ABUSE'},
           'DUPLICATE': {'SAME_BARCODE'}}
PRODUCT_FIELDS = {'barcode', 'productName', 'brand'}


class Error(Exception):
    def __init__(self, status, code):
        self.status, self.code = status, code
        super().__init__(code)


def authenticated(actor, reviewer=False):
    if not isinstance(actor, dict) or not isinstance(actor.get('uid'), str) or not actor['uid']:
        raise Error(401, 'UNAUTHENTICATED')
    if reviewer and actor.get('missing_product_reviewer') is not True:
        raise Error(403, 'REVIEWER_REQUIRED')


def barcode(value):
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        raise Error(400, 'INVALID_BARCODE')
    value = str(value).strip()
    if not DB021Validator._is_valid_barcode_format(value):
        raise Error(400, 'INVALID_BARCODE')
    return value


class Store:
    def __init__(self, path, cursor_secret):
        if len(cursor_secret) < 32:
            raise ValueError('Cursor secret must contain at least 32 bytes')
        self.path, self.secret = str(path), cursor_secret
        # New databases must never inherit a permissive process umask.
        try:
            fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except FileExistsError:
            pass
        else:
            os.close(fd)
        with self.connection() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS reports (
                    id TEXT PRIMARY KEY, owner TEXT NOT NULL, barcode TEXT NOT NULL,
                    product TEXT NOT NULL, created INTEGER NOT NULL,
                    status TEXT NOT NULL CHECK(status IN
                      ('PENDING','IN_REVIEW','ACCEPTED','REJECTED','DUPLICATE')),
                    version INTEGER NOT NULL DEFAULT 0,
                    canonical TEXT REFERENCES reports(id),
                    CHECK((status = 'DUPLICATE') = (canonical IS NOT NULL)));
                CREATE INDEX IF NOT EXISTS canonical_barcode
                    ON reports(barcode) WHERE canonical IS NULL;
                CREATE INDEX IF NOT EXISTS report_queue ON reports(status,created,id);
                CREATE INDEX IF NOT EXISTS report_canonical ON reports(canonical);
                CREATE TABLE IF NOT EXISTS audit (
                    seq INTEGER PRIMARY KEY AUTOINCREMENT, report TEXT NOT NULL,
                    old_status TEXT, new_status TEXT NOT NULL, version INTEGER NOT NULL,
                    timestamp INTEGER NOT NULL, actor TEXT NOT NULL, reason TEXT,
                    canonical TEXT, UNIQUE(report,version));
                CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit
                    BEGIN SELECT RAISE(ABORT,'append-only audit'); END;
                CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit
                    BEGIN SELECT RAISE(ABORT,'append-only audit'); END;
                CREATE TABLE IF NOT EXISTS revision (id INTEGER PRIMARY KEY CHECK(id=1), n INTEGER);
                INSERT OR IGNORE INTO revision VALUES(1,0);
                CREATE TABLE IF NOT EXISTS staging (
                    report TEXT PRIMARY KEY, batch TEXT NOT NULL, version INTEGER NOT NULL,
                    product TEXT NOT NULL, timestamp INTEGER NOT NULL, reviewer TEXT NOT NULL,
                    barcode TEXT NOT NULL UNIQUE);
                CREATE TRIGGER IF NOT EXISTS staging_no_update BEFORE UPDATE ON staging
                    BEGIN SELECT RAISE(ABORT,'immutable staging'); END;
                CREATE TRIGGER IF NOT EXISTS staging_no_delete BEFORE DELETE ON staging
                    BEGIN SELECT RAISE(ABORT,'immutable staging'); END;
            ''')

    @contextmanager
    def connection(self, write=False):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        try:
            db.execute('BEGIN IMMEDIATE' if write else 'BEGIN')
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def _audit(self, db, id, old, new, version, actor, reason=None, canonical=None):
        db.execute('INSERT INTO audit(report,old_status,new_status,version,timestamp,actor,reason,canonical) '
                   'VALUES(?,?,?,?,?,?,?,?)',
                   (id, old, new, version, time.time_ns() // 1000, actor, reason, canonical))
        db.execute('UPDATE revision SET n=n+1 WHERE id=1')

    def ingest(self, submission_id, owner_uid, product):
        """BE042 adapter: pass its stable ID and verified UID, never client-supplied ownership.

        Idempotent retries; identical barcodes aggregate under the first report.
        This function is intentionally not exposed over HTTP.
        """
        if (not isinstance(submission_id, str)
                or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', submission_id)
                or not isinstance(owner_uid, str) or not 0 < len(owner_uid) <= 128):
            raise Error(400, 'INVALID_ID')
        if not isinstance(product, dict) or len(json.dumps(product)) > 16384:
            raise Error(400, 'INVALID_PRODUCT')
        code = barcode(product.get('barcode'))
        clean = {k: v for k, v in product.items() if k in PRODUCT_FIELDS}
        if any(clean.get(k) is not None and not isinstance(clean[k], str)
               for k in ('productName', 'brand')):
            raise Error(400, 'INVALID_PRODUCT')
        clean['barcode'] = code
        payload = json.dumps(clean, sort_keys=True)
        with self.connection(True) as db:
            previous = db.execute('SELECT * FROM reports WHERE id=?', (submission_id,)).fetchone()
            if previous:
                if previous['owner'] != owner_uid or previous['product'] != payload:
                    raise Error(409, 'IDEMPOTENCY_CONFLICT')
                return submission_id
            target = db.execute('SELECT id FROM reports WHERE barcode=? AND canonical IS NULL ORDER BY created,id LIMIT 1', (code,)).fetchone()
            canonical = target['id'] if target else None
            status = 'DUPLICATE' if canonical else 'PENDING'
            db.execute('INSERT INTO reports(id,owner,barcode,product,created,status,canonical) VALUES(?,?,?,?,?,?,?)',
                       (submission_id, owner_uid, code, payload, time.time_ns() // 1000, status, canonical))
            self._audit(db, submission_id, None, status, 0, 'system:BE042',
                        'SAME_BARCODE' if canonical else None, canonical)
        return submission_id

    def public_status(self, actor, id):
        authenticated(actor)
        with self.connection() as db:
            row = db.execute('SELECT id,status FROM reports WHERE id=? AND owner=?', (id, actor['uid'])).fetchone()
            if not row:
                raise Error(404, 'NOT_FOUND')
            return dict(row)

    def transition(self, actor, id, status, version, reason=None, canonical=None):
        authenticated(actor, True)
        if type(version) is not int or version < 0 or not isinstance(status, str) or status not in TRANSITIONS:
            raise Error(400, 'INVALID_DECISION')
        if status in REASONS:
            if not isinstance(reason, str) or reason not in REASONS[status]:
                raise Error(400, 'REASON_REQUIRED')
        elif reason is not None:
            raise Error(400, 'UNEXPECTED_REASON')
        if (status == 'DUPLICATE' and (not isinstance(canonical, str) or not canonical)) or (status != 'DUPLICATE' and canonical is not None):
            raise Error(400, 'INVALID_CANONICAL')
        with self.connection(True) as db:
            row = db.execute('SELECT * FROM reports WHERE id=?', (id,)).fetchone()
            if not row:
                raise Error(404, 'NOT_FOUND')
            if row['version'] != version:
                raise Error(409, 'VERSION_CONFLICT')
            if status not in TRANSITIONS[row['status']]:
                raise Error(409, 'INVALID_TRANSITION')
            if canonical:
                target = db.execute('SELECT * FROM reports WHERE id=?', (canonical,)).fetchone()
                children = db.execute('SELECT 1 FROM reports WHERE canonical=? LIMIT 1', (id,)).fetchone()
                if not target or target['id'] == id or target['canonical'] or target['barcode'] != row['barcode'] or children:
                    raise Error(409, 'INVALID_CANONICAL')
            db.execute('UPDATE reports SET status=?,version=version+1,canonical=? WHERE id=?', (status, canonical, id))
            self._audit(db, id, row['status'], status, version + 1, actor['uid'], reason, canonical)
            return {'id': id, 'status': status, 'version': version + 1}

    def queue(self, actor, status=None, normalized_barcode=None, created_from=None, created_to=None, limit=50, cursor=None):
        authenticated(actor, True)
        if type(limit) is not int or not 1 <= limit <= 100 or (status is not None and status not in TRANSITIONS):
            raise Error(400, 'INVALID_FILTER')
        if normalized_barcode is not None:
            normalized_barcode = barcode(normalized_barcode)
        if any(v is not None and (type(v) is not int or not 0 <= v <= 253402300799999999) for v in (created_from, created_to)):
            raise Error(400, 'INVALID_DATE')
        if created_from is not None and created_to is not None and created_from > created_to:
            raise Error(400, 'INVALID_DATE')
        filters = [status, normalized_barcode, created_from, created_to, limit]
        position = None
        with self.connection() as db:
            revision = db.execute('SELECT n FROM revision').fetchone()[0]
            if cursor is not None:
                try:
                    if len(cursor) > 2048:
                        raise ValueError()
                    raw, signature = cursor.split('.')
                    expected = hmac.new(self.secret, raw.encode(), hashlib.sha256).hexdigest()
                    if not hmac.compare_digest(signature, expected):
                        raise ValueError()
                    data = json.loads(base64.urlsafe_b64decode(raw))
                    if data['filters'] != filters:
                        raise ValueError()
                    if data['revision'] != revision:
                        raise Error(409, 'QUEUE_CHANGED')
                    position = data['position']
                except (ValueError, KeyError, TypeError):
                    raise Error(400, 'INVALID_CURSOR') from None
            where, args = ['r.canonical IS NULL'], []
            for clause, value in [('r.status=?', status), ('r.barcode=?', normalized_barcode),
                                  ('r.created>=?', created_from), ('r.created<=?', created_to)]:
                if value is not None:
                    where.append(clause)
                    args.append(value)
            sql = '''WITH queue AS (SELECT r.id,r.barcode,r.product,r.status,r.version,r.created,
                (SELECT count(DISTINCT owner) FROM reports d WHERE d.id=r.id OR d.canonical=r.id) AS report_count
                FROM reports r WHERE ''' + ' AND '.join(where) + ') SELECT * FROM queue'
            if position:
                sql += ' WHERE (-report_count,created,id) > (?,?,?)'
                args.extend(position)
            rows = db.execute(sql + ' ORDER BY report_count DESC,created ASC,id ASC LIMIT ?', args + [limit + 1]).fetchall()
            items = [{**dict(r), 'product': json.loads(r['product'])} for r in rows[:limit]]
            next_cursor = None
            if len(rows) > limit:
                last = rows[limit - 1]
                raw = base64.urlsafe_b64encode(json.dumps({'filters': filters, 'revision': revision,
                    'position': [-last['report_count'], last['created'], last['id']]}).encode()).decode()
                next_cursor = raw + '.' + hmac.new(self.secret, raw.encode(), hashlib.sha256).hexdigest()
            return {'items': items, 'next_cursor': next_cursor}

    def stage(self, actor, ids):
        authenticated(actor, True)
        if not isinstance(ids, list) or not 1 <= len(ids) <= 100 or any(not isinstance(i, str) for i in ids) or len(set(ids)) != len(ids):
            raise Error(400, 'INVALID_IDS')
        batch = str(uuid.uuid4())
        with self.connection(True) as db:
            records = []
            # Recovery uses this same order, regardless of the caller's ID order.
            for id in sorted(ids):
                row = db.execute('SELECT * FROM reports WHERE id=?', (id,)).fetchone()
                if not row or row['status'] != 'ACCEPTED' or row['canonical']:
                    raise Error(409, 'NOT_ACCEPTED')
                if db.execute('SELECT 1 FROM staging WHERE report=?', (id,)).fetchone():
                    raise Error(409, 'ALREADY_STAGED')
                product = json.loads(row['product'])
                if not isinstance(product, dict) or set(product) - PRODUCT_FIELDS:
                    raise Error(422, 'INVALID_PRODUCT')
                barcode(product.get('barcode'))
                if product['barcode'] != row['barcode'] or validate_record(dict(product)):
                    raise Error(422, 'INVALID_PRODUCT')
                if db.execute('SELECT 1 FROM staging WHERE barcode=?', (product['barcode'],)).fetchone():
                    raise Error(409, 'BARCODE_ALREADY_STAGED')
                records.append({'submission_id': id, 'version': row['version'], 'product': product})
            if len({r['product']['barcode'] for r in records}) != len(records):
                raise Error(422, 'DUPLICATE_BARCODE')
            for r in records:
                db.execute('INSERT INTO staging VALUES(?,?,?,?,?,?,?)', (r['submission_id'], batch, r['version'],
                           json.dumps(r['product']), time.time_ns() // 1000, actor['uid'], r['product']['barcode']))
            return {'schema': 'missing-product-staging-v1', 'trusted': False, 'batch_id': batch, 'records': records}

    def read_batch(self, actor, batch):
        authenticated(actor, True)
        with self.connection() as db:
            rows = db.execute('SELECT report,version,product FROM staging WHERE batch=? ORDER BY report', (batch,)).fetchall()
            if not rows:
                raise Error(404, 'NOT_FOUND')
            return {'schema': 'missing-product-staging-v1', 'trusted': False, 'batch_id': batch,
                    'records': [{'submission_id': r['report'], 'version': r['version'], 'product': json.loads(r['product'])} for r in rows]}
