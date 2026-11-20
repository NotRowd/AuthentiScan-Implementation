"""Local Qwen adapter for the existing scene/features API. Not an AI verdict."""
import argparse
import hashlib
import io
import os
import secrets
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from contextlib import contextmanager

from PIL import Image, ImageOps
from run_visual_candidate import verify_assets
from prepare_visual_candidate import PLAN, DEST
from evaluate_visual_candidate import CANDIDATE, NoRedirect, request_review, parse_review
from scene_service import make_server, DISCLAIMER
from process_lifecycle import protect_process_tree, watch_parent_pipe
from visual_errors import VisualBusy, VisualInvalidResponse, reply_visual_error
from evaluate_visual_candidate import REQUEST_VERSION as ANOMALY_VERSION

VERSION = 3
REVIEW_VERSION = 'visual-features-v1'
TYPE_MAP = {'logo_graphic': 'logo', 'photograph_like': 'photograph'}


@contextmanager
def runtime(stop):
    exe = verify_assets()
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 5007))  # Never adopt/stop an unrelated server.
    protect_process_tree()
    key = secrets.token_urlsafe(32)
    os.environ['AUTHENTISCAN_CANDIDATE_KEY'] = key
    args = [str(exe), '-m', str(DEST / PLAN['files'][0]['name']),
        '--mmproj', str(DEST / PLAN['files'][1]['name']), '--host', '127.0.0.1',
        '--port', '5007', '--alias', CANDIDATE, '--ctx-size', '4096', '--parallel', '1',
        '--threads', '2', '--threads-batch', '2', '--batch-size', '256', '--ubatch-size', '128',
        '--n-gpu-layers', '0', '--no-mmproj-offload', '--no-webui',
        '--cors-origins', 'https://authentiscan.invalid', '--no-cors-credentials', '--timeout', '180']
    child = subprocess.Popen(args, env={**os.environ, 'LLAMA_API_KEY': key}, stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    def watch_parent():
        stop.wait()
        if child.poll() is None:
            child.terminate()
    threading.Thread(target=watch_parent, daemon=True).start()
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        deadline = time.monotonic() + 60
        while not stop.is_set():
            if child.poll() is not None:
                raise RuntimeError('Qwen runtime exited; check available memory')
            try:
                req = urllib.request.Request('http://127.0.0.1:5007/health', headers={'Authorization': 'Bearer ' + key})
                with opener.open(req, timeout=2) as response:
                    if response.status == 200:
                        break
            except OSError:
                pass
            if time.monotonic() > deadline:
                raise TimeoutError('Qwen runtime startup timed out')
            stop.wait(.5)
        if stop.is_set():
            raise InterruptedError('Parent stopped during model startup')
        yield child
    finally:
        stop.set()
        if child.poll() is None:
            child.terminate()
        try:
            child.wait(timeout=10)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait(timeout=5)
        os.environ.pop('AUTHENTISCAN_CANDIDATE_KEY', None)


def prepare_image(payload):
    if not payload or len(payload) > 10 * 1024 * 1024:
        raise ValueError('Invalid image size')
    with Image.open(io.BytesIO(payload)) as source:
        if source.format not in ('PNG', 'JPEG', 'WEBP') or getattr(source, 'n_frames', 1) != 1 or source.width * source.height > 16_000_000:
            raise ValueError('Unsupported image')
        image = ImageOps.exif_transpose(source).convert('RGBA')
        image = Image.alpha_composite(Image.new('RGBA', image.size, 'white'), image).convert('RGB')
        image.thumbnail((768, 768))
        output = io.BytesIO()
        image.save(output, format='PNG')
        return output.getvalue()


class QwenModel:
    def __init__(self, infer=request_review, parser=parse_review):
        self.infer = infer
        self.parse = parser
        self.lock = threading.Lock()
        self.cached = None  # One short-lived parsed result, no image bytes stored.

    def review(self, payload):
        digest = hashlib.sha256(payload).hexdigest()
        if not self.lock.acquire(blocking=False):
            raise VisualBusy('Visual model busy')
        try:
            if self.cached and self.cached[0] == digest and time.monotonic() < self.cached[1]:
                return digest, self.cached[2]
            prepared = prepare_image(payload)
            try:
                result = self.parse(self.infer(prepared))
            except ValueError as error:
                diagnostic = 'incomplete_generation' if str(error) == 'Visual review generation did not finish' else 'invalid_review_fields'
                known = {
                    'Concern needs a complete observation and location': 'incomplete_observation_or_location',
                    'Concern needs a distinct visible reason': 'incomplete_or_repeated_reason',
                    'Unsupported provenance claim': 'unsupported_origin_claim',
                    'Unusable description': 'unusable_internal_description',
                    'Too many anomaly claims': 'too_many_findings',
                    'Non-concern statuses require empty observation/location': 'contradictory_status_fields',
                    'Invalid text field': 'invalid_text_length_or_type',
                    'Invalid or duplicate category/status': 'invalid_category_or_status',
                    'Expected all five named feature checks': 'missing_feature_checks',
                    'Unexpected review fields': 'unexpected_review_fields',
                }
                diagnostic = known.get(str(error), diagnostic)
                print('Visual review rejected: ' + diagnostic, flush=True)
                raise VisualInvalidResponse('Unusable model response') from error
            self.cached = (digest, time.monotonic() + 120, result)
            return digest, result
        finally:
            self.lock.release()

    def predict(self, payload):
        digest, result = self.review(payload)
        concerns = [item['observation'] for item in result['findings'] if item['status'] == 'possible_concern']
        if result.get('review_outcome') == 'no_significant_anomalies':
            assessment = 'No significant visual anomalies detected. The image appears visually consistent.'
        elif concerns:
            assessment = ' '.join(concerns)
        elif all(item['status'] == 'unable_to_assess' for item in result['findings']):
            assessment = 'The model could not reliably assess these visual features. This does not establish authenticity.'
        else:
            assessment = 'The model reported no clear visual concern in the features it could assess. This does not establish authenticity.'
        # The description API has a bounded assessment field; full findings use /features.
        if len(assessment) > 1600:
            assessment = 'Possible concerns were reported. See the separate visual review; these are unverified observations.'
        return dict(schema_version=1, status='available', assessment='tentative',
            model_version=CANDIDATE, model_revision=PLAN['revision'], input_sha256=digest,
            observation=result['description'], explanation_version=VERSION,
            image_type=TYPE_MAP.get(result['image_type'], result['image_type']),
            visual_assessment=assessment, disclaimer=DISCLAIMER, changes_verdict=False)

    def features(self, payload):
        digest, result = self.review(payload)
        findings = []
        for item in result['findings']:
            observation = item['observation']
            if item['status'] == 'no_clear_concern':
                observation = 'The visual-review model reported no clear inconsistency in this feature. This does not confirm authenticity.'
            elif item['status'] == 'unable_to_assess':
                observation = observation or 'Not enough reliable model detail to assess this feature.'
            details = {}
            if result.get('anomaly_review_version'):
                details = dict(location=item['location'], reason=item['reason'])
                if 'title' in item:
                    details['title'] = item['title']
            findings.append(dict(category=item['category'], status=item['status'], observation=observation, **details))
        return dict(schema_version=1, review_version=REVIEW_VERSION, status='completed',
            model_version=CANDIDATE, model_revision=PLAN['revision'], input_sha256=digest,
            findings=findings, image_type=result['image_type'], changes_verdict=False, classifier_reason=False, validation_status='not_validated',
            **({'anomaly_review_version': result['anomaly_review_version']} if result.get('anomaly_review_version') else {}),
            **({'review_outcome': result['review_outcome']} if result.get('review_outcome') else {}))


def server_for(port, model, alive=lambda: True):
    server = make_server(port, model)
    server.daemon_threads = True
    parent = server.RequestHandlerClass
    class Handler(parent):
        def do_GET(self):
            if self.path != '/health':
                return self.reply(404, {})
            loaded = alive()
            self.reply(200 if loaded else 503, dict(service='authentiscan-scene', model_loaded=loaded,
                model_version=CANDIDATE, explanation_version=VERSION, feature_review_version=REVIEW_VERSION, anomaly_review_version=ANOMALY_VERSION,
                process_id=os.getpid(), launcher_process_id=os.getppid(), lifecycle_version=1))

        def do_POST(self):
            if self.path not in ('/features', '/explain'):
                return super().do_POST()
            feature_request = self.path == '/features'
            header, expected = ('X-AuthentiScan-Features', REVIEW_VERSION) if feature_request else ('X-AuthentiScan-Scene', 'local-scene-v1')
            if self.headers.get('Origin') or self.headers.get(header) != expected:
                return self.reply(403, {})
            try:
                size = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                return self.reply(400, {})
            if self.headers.get('Transfer-Encoding') or not 0 < size <= 10 * 1024 * 1024:
                return self.reply(413, {})
            try:
                self.connection.settimeout(20)
                payload = self.rfile.read(size)
                if len(payload) != size:
                    return self.reply(400, {})
                result = model.features(payload) if feature_request else model.predict(payload)
                self.reply(200, dict(success=True, data=result))
            except Exception as error:
                reply_visual_error(self, error)
    server.RequestHandlerClass = Handler
    return server


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=5005)
    parser.add_argument('--parent-pipe', action='store_true')
    args = parser.parse_args()
    stop = threading.Event()
    def interrupted(*_):
        stop.set()
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, interrupted)
    try:
        # Check both ports before starting threads or loading large model assets.
        for port in (args.port, 5007):
            with socket.socket() as probe:
                try:
                    probe.bind(('127.0.0.1', port))
                except OSError:
                    print(f'Scene service cannot start: port {port} is in use. Stop the previous scene session first. No existing process was stopped.', flush=True)
                    return 1
        if args.parent_pipe:
            watch_parent_pipe(stop)
        with runtime(stop) as child:
            server = server_for(args.port, QwenModel(), lambda: child.poll() is None)
            server.timeout = .5
            print('Qwen local descriptions and visual review ready. Observations are unverified; classifier unchanged.', flush=True)
            try:
                while not stop.is_set():
                    if child.poll() is not None:
                        raise RuntimeError('Model process exited')
                    server.handle_request()
            finally:
                server.server_close()
    except (KeyboardInterrupt, InterruptedError):
        stop.set()
    except Exception:
        print('Scene service stopped: model startup/runtime failed. Check available memory and local model setup; classifier unchanged.', flush=True)
        return 1
    finally:
        stop.set()
    return 0


if __name__ == '__main__':
    sys.exit(main())
