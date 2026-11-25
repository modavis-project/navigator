"""Shared read-only vocabulary query and byte-fixity boundaries."""
from functools import wraps
import hashlib
import re
import sqlite3

from flask import Response, jsonify, request


class VocabularyUnavailable(Exception):
    pass


def query_arguments(raw, allowed, *, pins=()):
    values = {}
    if set(raw) - set(allowed):
        raise ValueError('Unsupported vocabulary parameter: ' + ', '.join(sorted(set(raw) - set(allowed))))
    for key in raw:
        operands = raw.getlist(key) if hasattr(raw, 'getlist') else [raw[key]]
        if len(operands) != 1:
            raise ValueError('Repeated vocabulary parameter: ' + key)
        value = operands[0]
        if not isinstance(value, str) or len(value) > 500 or re.search(r'[\x00-\x1f\x7f]', value):
            raise ValueError('Invalid vocabulary parameter: ' + key)
        if key in pins and not value.strip():
            raise ValueError('An explicitly supplied ' + key + ' must not be empty')
        values[key] = value
    return values


def bounded_integer(values, key, default, minimum, maximum):
    value = values.get(key)
    if value is None:
        return default
    if not re.fullmatch(r'[0-9]+', value) or not minimum <= int(value) <= maximum:
        raise ValueError(f'Invalid {key}; use an integer from {minimum} to {maximum}')
    return int(value)


def require_snapshot(values, expected, name='snapshot'):
    if name in values and values[name] != expected:
        raise RuntimeError('Requested vocabulary snapshot is unavailable')


def workbench_resource(app):
    work = app.extensions.get('research_workbench')
    if work is None:
        raise VocabularyUnavailable('Source terminology is unavailable for this snapshot')
    health = app.extensions.get('capability_health')
    if health and any(not health.resource_state(key)['available'] for key in ('workbench', 'researchIndex')):
        raise VocabularyUnavailable('Source terminology resources are unavailable or have changed')
    try:
        work.assert_binding()
    except (ValueError, OSError):
        raise VocabularyUnavailable('Source terminology snapshot binding is unavailable') from None
    return work


def vocabulary_endpoint(function):
    @wraps(function)
    def wrapped(*args, **kwargs):
        try:
            return function(*args, **kwargs)
        except VocabularyUnavailable as exc:
            message, status = str(exc), 503
        except LookupError as exc:
            message, status = str(exc), 404
        except (TimeoutError, sqlite3.OperationalError):
            message, status = 'Vocabulary query exceeded its budget; no partial result was returned', 503
        except RuntimeError as exc:
            message, status = str(exc), 409
        except OverflowError as exc:
            message, status = str(exc), 422
        except (ValueError, TypeError) as exc:
            message, status = str(exc), 400
        response = jsonify({'error': message})
        response.status_code = status
        response.headers['Cache-Control'] = 'no-store'
        return response
    return wrapped


def byte_response(body, media_type, *, filename=None, content_sha256=None):
    data = body.encode('utf-8') if isinstance(body, str) else body
    digest = hashlib.sha256(data).hexdigest()
    response = Response(data, content_type=media_type)
    response.set_etag(digest)
    response.headers['X-Content-SHA256'] = digest
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Cache-Control'] = 'private, max-age=60'
    if filename:
        response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
    if content_sha256:
        response.headers['X-Vocabulary-Content-SHA256'] = content_sha256
    return response.make_conditional(request)
