import hashlib
import io
import json
import threading
import unittest
import urllib.request
import urllib.error
from PIL import Image
from qwen_service import QwenModel, server_for, prepare_image, CANDIDATE


class QwenTests(unittest.TestCase):
    def test_updated_review_keeps_where_and_why_without_inventing_findings(self):
        raw = dict(image_type='photograph_like', description='A building is visible.', findings=[
            dict(category=c, status='no_clear_concern', observation='', location='', reason='')
            for c in ('eyes', 'shape', 'texture', 'lighting', 'scene')])
        raw['findings'][1].update(status='possible_concern',
            observation='One window frame bends abruptly across the straight surrounding wall.',
            location='Second window from the right',
            reason='Its vertical edge changes direction while the neighboring frames stay straight.')
        model = QwenModel(lambda _: json.dumps(raw))
        feature = model.features(self.image)
        self.assertEqual(feature['anomaly_review_version'], 'visual-anomalies-simple-v1')
        self.assertEqual(feature['findings'][1]['location'], raw['findings'][1]['location'])
        self.assertEqual(feature['findings'][1]['reason'], raw['findings'][1]['reason'])
        self.assertFalse(feature['changes_verdict'])
        self.assertEqual(feature['findings'][0]['reason'], '')

    def setUp(self):
        output = io.BytesIO()
        Image.new('RGB', (12, 12), 'white').save(output, format='PNG')
        self.image = output.getvalue()
        self.calls = 0
        def infer(_):
            self.calls += 1
            return json.dumps(dict(image_type='logo_graphic', description='A simple white square is visible.',
                findings=[dict(category=c, status='unable_to_assess', observation='', location='')
                    for c in ('eyes', 'shape', 'texture', 'lighting', 'scene')]))
        self.model = QwenModel(infer)

    def test_scene_and_features_share_bounded_result(self):
        scene = self.model.predict(self.image)
        review = self.model.features(self.image)
        self.assertEqual(self.calls, 1)
        self.assertEqual(scene['model_version'], CANDIDATE)
        self.assertEqual(scene['image_type'], 'logo')
        self.assertEqual(scene['explanation_version'], 3)
        self.assertEqual(scene['input_sha256'], hashlib.sha256(self.image).hexdigest())
        self.assertFalse(scene['changes_verdict'])
        self.assertFalse(review['classifier_reason'])
        self.assertEqual(review['validation_status'], 'not_validated')
        self.assertEqual(len(review['findings']), 5)
        self.assertTrue(all(f['observation'] for f in review['findings']))
        self.assertIn('could not reliably assess', scene['visual_assessment'])
        self.assertNotIn('no clear visual concern', scene['visual_assessment'])

    def test_partial_assessment_does_not_imply_all_features_were_checked(self):
        raw = json.loads(self.model.infer(b''))
        raw['findings'][3]['status'] = 'no_clear_concern'
        model = QwenModel(lambda _: json.dumps(raw))
        self.assertIn('features it could assess', model.predict(self.image)['visual_assessment'])

    def test_invalid_images_and_busy_model_fail_closed(self):
        for data in (b'', b'not an image', b'x' * (10 * 1024 * 1024 + 1)):
            with self.assertRaises(Exception):
                prepare_image(data)
        self.model.lock.acquire()
        try:
            with self.assertRaises(RuntimeError):
                self.model.predict(self.image)
        finally:
            self.model.lock.release()

    def test_named_model_slots_preserve_public_contract_and_shared_cache(self):
        raw = json.loads(self.model.infer(b''))
        raw['findings'] = {item['category']: {k: v for k, v in item.items() if k != 'category'}
                           for item in raw['findings']}
        raw['findings']['lighting'] = dict(status='possible_concern',
            observation='The shadow points in a different direction beside the chair.',
            location='Beside the chair')
        calls = []
        def infer(image):
            calls.append(image)
            return json.dumps(raw)
        model = QwenModel(infer)
        scene = model.predict(self.image)
        features = model.features(self.image)
        self.assertEqual(len(calls), 1)
        self.assertEqual(scene['observation'], raw['description'])
        self.assertIsInstance(features['findings'], list)
        self.assertEqual([f['category'] for f in features['findings']],
                         ['eyes', 'shape', 'texture', 'lighting', 'scene'])
        self.assertEqual(features['findings'][3]['observation'],
                         raw['findings']['lighting']['observation'])
        self.assertFalse(scene['changes_verdict'])
        self.assertFalse(features['classifier_reason'])

    def test_http_contract_and_browser_access(self):
        server = server_for(0, self.model)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = 'http://127.0.0.1:' + str(server.server_port)
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        try:
            for endpoint, header in [('explain', {'X-AuthentiScan-Scene': 'local-scene-v1'}),
                                     ('features', {'X-AuthentiScan-Features': 'visual-features-v1'})]:
                with opener.open(urllib.request.Request(base+'/'+endpoint, data=self.image, headers=header)) as response:
                    data = json.load(response)['data']
                    self.assertEqual(data['model_version'], CANDIDATE)
                for bad in ({}, {**header, 'Origin': 'https://example.com'}):
                    with self.assertRaises(urllib.error.HTTPError) as error:
                        opener.open(urllib.request.Request(base+'/'+endpoint, data=self.image, headers=bad))
                    self.assertEqual(error.exception.code, 403)
            with opener.open(base+'/health') as response:
                self.assertEqual(json.load(response)['explanation_version'], 3)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == '__main__':
    unittest.main()
