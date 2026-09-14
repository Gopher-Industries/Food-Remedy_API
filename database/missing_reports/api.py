"""WSGI API. Mount behind TLS; identity comes only from verified Firebase tokens."""
import json
import logging
import os
import re
import sqlite3
from http import HTTPStatus
from urllib.parse import parse_qs

from .workflow import Error, Store, authenticated


def verify_token(token):
    import firebase_admin
    from firebase_admin import auth
    try:
        firebase_admin.get_app()
    except ValueError:
        firebase_admin.initialize_app()
    return auth.verify_id_token(token, check_revoked=True)


class Application:
    def __init__(self, store, verifier=verify_token):
        self.store, self.verifier = store, verifier

    def __call__(self, env, start_response):
        try:
            header = env.get('HTTP_AUTHORIZATION', '')
            if not header.startswith('Bearer ') or not 0 < len(header[7:]) <= 8192:
                raise Error(401, 'UNAUTHENTICATED')
            try:
                actor = self.verifier(header[7:])
            except Exception:
                raise Error(401, 'UNAUTHENTICATED') from None
            authenticated(actor)
            method, path = env['REQUEST_METHOD'], env['PATH_INFO']
            if path.startswith('/internal/'):
                authenticated(actor, True)
            match = re.fullmatch(r'/api/missing-products/([^/]+)/status', path)
            if method == 'GET' and match:
                result = self.store.public_status(actor, match[1])
            elif method == 'GET' and path == '/internal/missing-products':
                query = parse_qs(env.get('QUERY_STRING', ''), keep_blank_values=True, max_num_fields=10)
                allowed = {'status', 'normalized_barcode', 'created_from', 'created_to', 'limit', 'cursor'}
                if set(query) - allowed or any(len(v) != 1 for v in query.values()):
                    raise Error(400, 'INVALID_FILTER')
                args = {k: v[0] for k, v in query.items()}
                for key in ('created_from', 'created_to', 'limit'):
                    if key in args:
                        args[key] = int(args[key])
                result = self.store.queue(actor, **args)
            elif method == 'POST' and re.fullmatch(r'/internal/missing-products/[^/]+/status', path):
                body = self.body(env)
                if set(body) - {'status', 'version', 'reason', 'canonical'} or not {'status', 'version'} <= set(body):
                    raise Error(400, 'INVALID_DECISION')
                result = self.store.transition(actor, path.split('/')[3], **body)
            else:
                raise Error(404, 'NOT_FOUND')
            status = 200
        except Error as error:
            status, result = error.status, {'error': error.code}
        except (ValueError, TypeError):
            status, result = 400, {'error': 'INVALID_REQUEST'}
        except sqlite3.OperationalError:
            status, result = 503, {'error': 'STORE_UNAVAILABLE'}
        except Exception:
            logging.getLogger(__name__).error('Missing-product request failed')
            status, result = 500, {'error': 'INTERNAL_ERROR'}
        payload = json.dumps(result).encode()
        start_response(f'{status} {HTTPStatus(status).phrase}', [
            ('Content-Type', 'application/json'), ('Cache-Control', 'no-store'),
            ('Content-Length', str(len(payload)))])
        return [payload]

    @staticmethod
    def body(env):
        if env.get('CONTENT_TYPE', '').split(';')[0] != 'application/json':
            raise Error(415, 'JSON_REQUIRED')
        length = int(env.get('CONTENT_LENGTH') or 0)
        if not 0 < length <= 4096:
            raise Error(413, 'BODY_TOO_LARGE')
        value = json.loads(env['wsgi.input'].read(length))
        if not isinstance(value, dict):
            raise Error(400, 'INVALID_REQUEST')
        return value


def create_app():
    return Application(Store(os.environ['MISSING_REPORT_DB'], os.environ['MISSING_REPORT_CURSOR_SECRET'].encode()))
