"""Run in a separate process for capstone testing."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading
from PIL import Image
from engine import Engine, MODEL, MAX_BYTES
from get_weights import DEFAULT


def serve(engine, port):
    busy = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(15)

        def respond(self, code, data):
            body = json.dumps(data, allow_nan=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path != "/health":
                return self.respond(404, {"success": False})
            self.respond(200, dict(service="authentiscan-localizer", model_loaded=True,
                                   model_version=MODEL, checkpoint_sha256=engine.checkpoint_sha256,
                                   validation_status="development_gates_failed"))

        def do_POST(self):
            if self.path != "/localize":
                return self.respond(404, {"success": False})
            if "Origin" in self.headers or self.headers.get("X-AuthentiScan-Localizer") != "localization-v1":
                return self.respond(403, {"success": False})
            if not busy.acquire(blocking=False):
                return self.respond(503, {"success": False, "error": "Localizer busy"})
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if "Transfer-Encoding" in self.headers or not 0 < length <= MAX_BYTES:
                    return self.respond(413, {"success": False, "error": "Invalid length"})
                payload = self.rfile.read(length)
                if len(payload) != length:
                    raise ValueError("Incomplete image")
                self.respond(200, {"success": True, "data": engine.predict(payload)})
            except (ValueError, OSError, Image.DecompressionBombError):
                self.respond(400, {"success": False, "error": "Invalid image"})
            except Exception:
                self.respond(503, {"success": False, "error": "Localization unavailable"})
            finally:
                busy.release()

        def log_message(self, *args):
            pass

    with ThreadingHTTPServer(("127.0.0.1", port), Handler) as server:
        print(f"Pixel-localization service ready on 127.0.0.1:{server.server_port}; development validation gates failed.", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights", type=Path, default=DEFAULT)
    parser.add_argument("--port", type=int, default=5014)
    args = parser.parse_args()
    serve(Engine(args.weights), args.port)
