import concurrent.futures
import io
import json
import sqlite3
import tempfile
import unittest

from database.missing_reports.api import Application
from database.missing_reports.workflow import Error, Store, TRANSITIONS

REVIEWER = {'uid': 'reviewer', 'missing_product_reviewer': True}
OWNER = {'uid': 'owner'}


class WorkflowTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.store = Store(self.tmp.name + '/review.db', b'x' * 32)

    def ingest(self, id='r1', code='12345678', owner='owner', **product):
        return self.store.ingest(id, owner, {'barcode': code, 'productName': 'Example', **product})

    def call(self, path, actor=OWNER, method='GET', body=None, query=''):
        def verify(token):
            if token == 'bad':
                raise ValueError()
            return actor
        app = Application(self.store, verify)
        data = json.dumps(body).encode() if body is not None else b''
        env = {'REQUEST_METHOD': method, 'PATH_INFO': path, 'QUERY_STRING': query,
               'wsgi.input': io.BytesIO(data), 'CONTENT_LENGTH': str(len(data)), 'CONTENT_TYPE': 'application/json'}
        if actor is not None:
            env['HTTP_AUTHORIZATION'] = 'Bearer good'
        response = []
        payload = b''.join(app(env, lambda status, headers: response.append((status, headers))))
        return int(response[0][0].split()[0]), json.loads(payload)

    def test_authorization_and_privacy(self):
        self.ingest(internal_notes='secret', reporter_email='private')
        path = '/api/missing-products/r1/status'
        self.assertEqual(self.call(path), (200, {'id': 'r1', 'status': 'PENDING'}))
        self.assertEqual(self.call(path, {'uid': 'other'})[0], 404)
        self.assertEqual(self.call('/api/missing-products/absent/status', OWNER)[0], 404)
        self.assertEqual(self.call(path, None)[0], 401)
        self.assertEqual(self.call('/api/missing-products')[0], 404)
        for actor, status in [(None, 401), (OWNER, 403), ({'uid': 'x', 'missing_product_reviewer': 'true'}, 403)]:
            self.assertEqual(self.call('/internal/missing-products', actor)[0], status)
            self.assertEqual(self.call('/internal/missing-products/r1/status', actor, 'POST', {'status': 'IN_REVIEW', 'version': 0})[0], status)
            with self.assertRaises(Error):
                self.store.stage(actor, ['r1'])
        status, queue = self.call('/internal/missing-products', REVIEWER)
        self.assertEqual(status, 200)
        for secret in ('secret', 'private', 'owner', 'reporter_email', 'internal_notes'):
            self.assertNotIn(secret, json.dumps(queue))

    def test_full_transition_matrix(self):
        # Imported legacy reports can share a barcode before being linked.
        for old in TRANSITIONS:
            for new in TRANSITIONS:
                with self.subTest(old=old, new=new):
                    id = old + new
                    with self.store.connection(True) as db:
                        if old == 'DUPLICATE' or new == 'DUPLICATE':
                            db.execute('INSERT OR IGNORE INTO reports(id,owner,barcode,product,created,status) VALUES(?,?,?,?,?,?)', ('canonical', 'owner', '12345678', '{}', 0, 'PENDING'))
                        db.execute('INSERT INTO reports(id,owner,barcode,product,created,status,canonical) VALUES(?,?,?,?,?,?,?)',
                                   (id, 'owner', '12345678', '{}', 1, old, 'canonical' if old == 'DUPLICATE' else None))
                    reason = 'SAME_BARCODE' if new == 'DUPLICATE' else 'ABUSE' if new == 'REJECTED' else None
                    kwargs = {'reason': reason, 'canonical': 'canonical' if new == 'DUPLICATE' else None}
                    if new in TRANSITIONS[old]:
                        self.store.transition(REVIEWER, id, new, 0, **kwargs)
                        with self.store.connection() as db:
                            audit = db.execute('SELECT * FROM audit WHERE report=?', (id,)).fetchone()
                            self.assertEqual((audit['old_status'], audit['new_status'], audit['actor'], audit['version']), (old, new, 'reviewer', 1))
                            self.assertGreater(audit['timestamp'], 0)
                    else:
                        with self.assertRaises(Error) as error:
                            self.store.transition(REVIEWER, id, new, 0, **kwargs)
                        self.assertEqual(error.exception.code, 'INVALID_TRANSITION')
                        with self.store.connection() as db:
                            row = db.execute('SELECT status,version FROM reports WHERE id=?', (id,)).fetchone()
                            self.assertEqual(tuple(row), (old, 0))
                            self.assertEqual(db.execute('SELECT count(*) FROM audit WHERE report=?', (id,)).fetchone()[0], 0)

    def test_concurrent_decisions_and_immutable_audit(self):
        self.ingest()
        self.store.transition(REVIEWER, 'r1', 'IN_REVIEW', 0)
        def decide(status):
            try:
                return self.store.transition(REVIEWER, 'r1', status, 1, 'ABUSE' if status == 'REJECTED' else None)['status']
            except Error as error:
                return error.code
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            results = list(pool.map(decide, ['ACCEPTED', 'REJECTED']))
        self.assertEqual(results.count('VERSION_CONFLICT'), 1)
        with self.store.connection() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM audit').fetchone()[0], 3)
        for sql in ["UPDATE audit SET actor='tampered'", 'DELETE FROM audit']:
            with self.assertRaises(sqlite3.IntegrityError), self.store.connection(True) as db:
                db.execute(sql)

    def test_duplicates_idempotency_and_priority(self):
        self.ingest('a')
        self.ingest('b', '123456789012')
        self.ingest('c', ' 123456789012 ', 'other')
        self.ingest('d', '123456789012', 'other')
        self.ingest('a')
        self.assertEqual(self.store.public_status({'uid': 'other'}, 'c')['status'], 'DUPLICATE')
        rows = self.store.queue(REVIEWER)['items']
        self.assertEqual([r['id'] for r in rows], ['b', 'a'])
        self.assertEqual(rows[0]['report_count'], 2)
        with self.assertRaises(Error):
            self.ingest('a', owner='intruder')
        with self.assertRaises(Error):
            self.store.transition(REVIEWER, 'a', 'DUPLICATE', 0, 'SAME_BARCODE', 'b')
        with self.assertRaises(Error):
            self.store.transition(REVIEWER, 'a', 'DUPLICATE', 0, 'SAME_BARCODE', 'a')

    def test_pagination_filters_and_empty(self):
        self.assertEqual(self.store.queue(REVIEWER), {'items': [], 'next_cursor': None})
        for i in range(5):
            self.ingest(str(i), str(12345678 + i))
        with self.store.connection(True) as db:
            db.execute('UPDATE reports SET created=10')
        page = self.store.queue(REVIEWER, limit=2)
        ids = [r['id'] for r in page['items']]
        first_cursor = page['next_cursor']
        while page['next_cursor']:
            page = self.store.queue(REVIEWER, limit=2, cursor=page['next_cursor'])
            ids += [r['id'] for r in page['items']]
        self.assertEqual(ids, ['0', '1', '2', '3', '4'])
        self.assertEqual(len(self.store.queue(REVIEWER, created_from=10, created_to=10)['items']), 5)
        self.assertEqual(len(self.store.queue(REVIEWER, normalized_barcode='12345678')['items']), 1)
        for kwargs in [{'limit': 0}, {'limit': 101}, {'created_from': 2, 'created_to': 1}, {'status': 'X'}, {'cursor': 'garbage'}, {'cursor': first_cursor, 'limit': 3}]:
            with self.assertRaises(Error):
                self.store.queue(REVIEWER, **kwargs)
        self.store.transition(REVIEWER, '0', 'IN_REVIEW', 0)
        with self.assertRaises(Error) as error:
            self.store.queue(REVIEWER, limit=2, cursor=first_cursor)
        self.assertEqual(error.exception.code, 'QUEUE_CHANGED')

    def accept(self, id='r1'):
        self.store.transition(REVIEWER, id, 'IN_REVIEW', 0)
        self.store.transition(REVIEWER, id, 'ACCEPTED', 1)

    def test_staging_validation_recovery_and_no_products(self):
        self.ingest()
        with self.assertRaises(Error):
            self.store.stage(REVIEWER, ['r1'])
        self.accept()
        self.ingest('incomplete', '123456789012', productName='')
        self.accept('incomplete')
        with self.assertRaises(Error):
            self.store.stage(REVIEWER, ['r1', 'incomplete'])
        with self.store.connection() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM staging').fetchone()[0], 0)
        result = self.store.stage(REVIEWER, ['r1'])
        self.assertFalse(result['trusted'])
        self.assertEqual(result, self.store.read_batch(REVIEWER, result['batch_id']))
        self.assertNotIn('reviewer', json.dumps(result))
        self.assertNotIn('owner', json.dumps(result))
        with self.assertRaises(Error):
            self.store.stage(REVIEWER, ['r1'])
        self.ingest('duplicate')
        with self.assertRaises(Error):
            self.store.stage(REVIEWER, ['duplicate'])
        with self.store.connection(True) as db:
            db.execute('UPDATE reports SET product=? WHERE id=?', ('{"barcode":"bad","productName":"x"}', 'incomplete'))
        with self.assertRaises(Error):
            self.store.stage(REVIEWER, ['incomplete'])
        with self.store.connection() as db:
            self.assertIsNone(db.execute("SELECT name FROM sqlite_master WHERE lower(name)='products'").fetchone())
        with self.assertRaises(sqlite3.IntegrityError), self.store.connection(True) as db:
            db.execute('DELETE FROM staging')

    def test_reason_and_http_validation(self):
        self.ingest()
        self.store.transition(REVIEWER, 'r1', 'IN_REVIEW', 0)
        for reason in [None, '', 'free text', ['ABUSE']]:
            with self.assertRaises(Error):
                self.store.transition(REVIEWER, 'r1', 'REJECTED', 1, reason)
        self.assertEqual(self.call('/internal/missing-products/r1/status', REVIEWER, 'POST', {'status': 'REJECTED', 'version': 1, 'reason': 'ABUSE'})[0], 200)
        for query in ['limit=101', 'limit=x', 'status=PENDING&status=ACCEPTED', 'owner=someone']:
            self.assertEqual(self.call('/internal/missing-products', REVIEWER, query=query)[0], 400)

    def test_audit_failure_rolls_back_transition(self):
        self.ingest()
        with self.store.connection(True) as db:
            db.execute("CREATE TRIGGER simulate_disk_failure BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'failure'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.transition(REVIEWER, 'r1', 'IN_REVIEW', 0)
        self.assertEqual(self.store.public_status(OWNER, 'r1')['status'], 'PENDING')
        self.assertEqual(self.store.queue(REVIEWER)['items'][0]['version'], 0)

    def test_concurrent_ingestion_aggregates(self):
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            list(pool.map(lambda id: self.ingest(id, owner=id), ['a', 'b']))
        queue = self.store.queue(REVIEWER)['items']
        self.assertEqual(len(queue), 1)
        self.assertEqual(queue[0]['report_count'], 2)

    def test_legacy_duplicate_exports_and_sample(self):
        self.ingest()
        self.accept()
        with self.store.connection(True) as db:
            db.execute("INSERT INTO reports SELECT 'legacy',owner,barcode,product,created,status,version,canonical FROM reports WHERE id='r1'")
        with self.assertRaises(Error) as error:
            self.store.stage(REVIEWER, ['r1', 'legacy'])
        self.assertEqual(error.exception.code, 'DUPLICATE_BARCODE')
        self.store.stage(REVIEWER, ['r1'])
        with self.assertRaises(Error) as error:
            self.store.stage(REVIEWER, ['legacy'])
        self.assertEqual(error.exception.code, 'BARCODE_ALREADY_STAGED')
        from pathlib import Path
        sample = json.loads((Path(__file__).parents[1] / 'docs/backend/missing-product-staging.example.json').read_text())
        product = sample['records'][0]['product']
        self.store.ingest('sample', 'owner', product)
        self.accept('sample')
        exported = self.store.stage(REVIEWER, ['sample'])
        self.assertEqual(exported['records'][0]['product'], product)

    def test_rejected_token(self):
        def reject(token):
            raise ValueError('expired or forged token')
        app = Application(self.store, reject)
        response = []
        result = app({'HTTP_AUTHORIZATION': 'Bearer forged'}, lambda status, headers: response.append(status))
        self.assertTrue(response[0].startswith('401 '))
        self.assertEqual(json.loads(b''.join(result)), {'error': 'UNAUTHENTICATED'})

    def test_ingestion_rejects_nested_metadata_and_unaddressable_ids(self):
        for field in ('productName', 'brand'):
            with self.subTest(field=field), self.assertRaises(Error) as error:
                self.ingest(**{field: {'reporter_email': 'private@example.com'}})
            self.assertEqual(error.exception.code, 'INVALID_PRODUCT')
        for id in ('a/b', 'a?b', '', 'x' * 129):
            with self.subTest(id=id), self.assertRaises(Error):
                self.ingest(id)
        self.assertEqual(self.store.queue(REVIEWER)['items'], [])

    def test_multi_record_recovery_has_identical_order(self):
        self.ingest('z', '00000001')
        self.ingest('a', '00000002')
        self.accept('z')
        self.accept('a')
        result = self.store.stage(REVIEWER, ['z', 'a'])
        self.assertEqual(result, self.store.read_batch(REVIEWER, result['batch_id']))
        self.assertEqual([r['submission_id'] for r in result['records']], ['a', 'z'])
        for actor in (None, OWNER):
            with self.assertRaises(Error):
                self.store.read_batch(actor, result['batch_id'])

    def test_http_decisions_are_private_and_audit_is_not_editable(self):
        self.ingest()
        path = '/internal/missing-products/r1/status'
        self.assertEqual(self.call(path, REVIEWER, 'POST',
                                   {'status': 'IN_REVIEW', 'version': 0})[0], 200)
        self.assertEqual(self.call(path, REVIEWER, 'POST',
                                   {'status': 'REJECTED', 'version': 1, 'reason': 'ABUSE'})[0], 200)
        self.assertEqual(self.call('/api/missing-products/r1/status'),
                         (200, {'id': 'r1', 'status': 'REJECTED'}))
        for method in ('POST', 'PUT', 'PATCH', 'DELETE'):
            self.assertEqual(self.call('/internal/missing-products/r1/audit', REVIEWER,
                                       method, {'actor': 'replacement'})[0], 404)
        with self.store.connection() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM audit').fetchone()[0], 3)

    def test_cursor_tampering_and_ingestion_invalidation(self):
        self.ingest('a')
        self.ingest('b', '00000001')
        cursor = self.store.queue(REVIEWER, limit=1)['next_cursor']
        for bad in ('', cursor + 'x', 'x' * 2049):
            with self.subTest(cursor=bad[:20]), self.assertRaises(Error) as error:
                self.store.queue(REVIEWER, limit=1, cursor=bad)
            self.assertEqual(error.exception.code, 'INVALID_CURSOR')
        self.ingest('duplicate', owner='another-owner')
        with self.assertRaises(Error) as error:
            self.store.queue(REVIEWER, limit=1, cursor=cursor)
        self.assertEqual(error.exception.code, 'QUEUE_CHANGED')

    def test_export_required_field_matrix_is_atomic(self):
        products = [
            {'barcode': '00000001'},
            {'barcode': '00000001', 'productName': '   '},
            {'barcode': '00000001', 'productName': 5},
            {'barcode': '00000001', 'productName': 'Example', 'brand': []},
            {'barcode': 'bad', 'productName': 'Example'},
            {'barcode': '00000002', 'productName': 'Example'},
        ]
        self.ingest('valid')
        self.accept('valid')
        self.ingest('invalid', '00000001')
        self.accept('invalid')
        for product in products:
            with self.subTest(product=product):
                with self.store.connection(True) as db:
                    db.execute('UPDATE reports SET product=? WHERE id=?',
                               (json.dumps(product), 'invalid'))
                with self.assertRaises(Error):
                    self.store.stage(REVIEWER, ['valid', 'invalid'])
                with self.store.connection() as db:
                    self.assertEqual(db.execute('SELECT count(*) FROM staging').fetchone()[0], 0)


if __name__ == '__main__':
    unittest.main()
