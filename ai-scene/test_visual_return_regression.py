import io
import json
from pathlib import Path
import threading
import unittest
import urllib.error
import urllib.request
from PIL import Image
from qwen_service import QwenModel, server_for


class ReturnRegression(unittest.TestCase):
    def setUp(self):
        output = io.BytesIO()
        Image.new('RGB', (12, 12), 'white').save(output, format='PNG')
        self.image = output.getvalue()

    def test_exact_loyd_outputs_preserve_description_and_other_checks(self):
        path = Path(__file__).resolve().parents[1] / 'firebase-local/tests/fixtures/visual-review-regression.json'
        for case in json.loads(path.read_text()):
            with self.subTest(case=case['sample']):
                calls = []
                def infer(_):
                    calls.append(1)
                    return case['raw']
                model = QwenModel(infer)
                scene = model.predict(self.image)
                review = model.features(self.image)
                self.assertEqual(len(calls), 1)
                self.assertEqual(scene['observation'], case['scene']['observation'])
                self.assertFalse(scene['changes_verdict'])
                self.assertFalse(review['classifier_reason'])
                for actual, previous in zip(review['findings'], case['features']['findings']):
                    if case['sample'] == 'sheep-original' and actual['category'] == 'eyes':
                        self.assertEqual(actual['status'], 'unable_to_assess')
                        self.assertIn('inconclusive', actual['observation'])
                    else:
                        self.assertEqual(actual, previous)

    def test_both_http_endpoints_expose_only_fixed_failure_codes(self):
        def fail(error):
            def infer(_): raise error
            return infer
        for kind, infer, expected in [
            ('invalid', lambda _: 'not-json', (502, 'VISUAL_INVALID_RESPONSE')),
            ('timeout', fail(TimeoutError('PRIVATE')), (504, 'VISUAL_TIMEOUT')),
            ('offline', fail(ConnectionRefusedError('PRIVATE')), (503, 'VISUAL_OFFLINE')),
            ('busy', lambda _: '{}', (429, 'VISUAL_BUSY')),
        ]:
            model = QwenModel(infer)
            if kind == 'busy': model.lock.acquire()
            server = server_for(0, model)
            thread = threading.Thread(target=server.serve_forever, daemon=True);thread.start()
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            try:
                for endpoint, header, value in [('explain', 'X-AuthentiScan-Scene', 'local-scene-v1'), ('features', 'X-AuthentiScan-Features', 'visual-features-v1')]:
                    request = urllib.request.Request(f'http://127.0.0.1:{server.server_port}/{endpoint}', data=self.image, headers={header:value})
                    with self.assertRaises(urllib.error.HTTPError) as caught: opener.open(request)
                    error = caught.exception
                    body = error.read().decode();error.close()
                    self.assertEqual((error.code, json.loads(body)['code']), expected)
                    self.assertNotIn('PRIVATE', body)
            finally:
                server.shutdown();server.server_close();thread.join()
                if kind == 'busy': model.lock.release()


if __name__ == '__main__': unittest.main()
