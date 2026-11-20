"""Loopback-only, memory-only image detector. No cloud requests or saved uploads."""
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
print('Loading optional CPU object detector...', flush=True)
from model import load_detector, detect, MODEL_VERSION, MAX_BYTES


def serve(port=5003):
    model = load_detector()
    busy = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass  # Do not log user filenames, image contents, or headers.

        def reply(self, status, payload):
            data = json.dumps(payload, allow_nan=False).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            try:
                self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def do_GET(self):
            if self.path != '/health':
                return self.reply(404, {'success': False})
            self.reply(200, {'success': True, 'service': 'authentiscan-object-detector', 'model_loaded': True, 'model_version': MODEL_VERSION})

        def do_POST(self):
            if self.path != '/detect':
                return self.reply(404, {'success': False})
            length = self.headers.get('Content-Length', '')
            if not length.isdigit() or not 0 < int(length) <= MAX_BYTES or self.headers.get('Transfer-Encoding'):
                return self.reply(413, {'success': False})
            # Drain a bounded rejected body so Windows does not reset the socket
            # before the caller can read the error response. Never decode it.
            def reject(status):
                self.connection.settimeout(2)
                remaining = int(length)
                try:
                    while remaining:
                        chunk = self.rfile.read(min(65536, remaining))
                        if not chunk: break
                        remaining -= len(chunk)
                except OSError:
                    pass
                self.reply(status, {'success': False})
            # No browser origins, permissive CORS, client URLs, or remote file downloads.
            if self.headers.get('Origin') or self.headers.get('X-AuthentiScan-Detector') != 'local-object-detection-v1':
                return reject(403)
            if not busy.acquire(blocking=False):
                return reject(429)
            try:
                self.connection.settimeout(15)
                data = self.rfile.read(int(length))
                if len(data) != int(length):
                    raise ValueError('Incomplete image')
                result = detect(model, data)
                self.reply(200, {'success': True, 'data': result})
            except Exception:
                self.reply(422, {'success': False, 'message': 'Object detection could not complete.'})
            finally:
                busy.release()

    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    print(f'Object detector ready on 127.0.0.1:{server.server_port} ({MODEL_VERSION}, CPU)', flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == '__main__':
    serve(int(os.getenv('OBJECT_DETECTOR_PORT', '5003')))
