"""Fixed public diagnostics; never expose model output or arbitrary exceptions."""
import urllib.error


class VisualBusy(RuntimeError):
    pass


class VisualInvalidResponse(ValueError):
    pass


def reply_visual_error(handler, error):
    if isinstance(error, VisualBusy):
        status, code = 429, 'VISUAL_BUSY'
    elif isinstance(error, VisualInvalidResponse):
        status, code = 502, 'VISUAL_INVALID_RESPONSE'
    elif isinstance(error, TimeoutError) or isinstance(getattr(error, 'reason', None), TimeoutError):
        status, code = 504, 'VISUAL_TIMEOUT'
    elif isinstance(error, urllib.error.HTTPError):
        status, code = (429, 'VISUAL_BUSY') if error.code == 429 else (503, 'VISUAL_MODEL_FAILURE')
    elif isinstance(error, (ConnectionError, urllib.error.URLError)):
        status, code = 503, 'VISUAL_OFFLINE'
    else:
        status, code = 503, 'VISUAL_MODEL_FAILURE'
    handler.reply(status, dict(success=False, code=code, message='Visual review could not complete.'))
