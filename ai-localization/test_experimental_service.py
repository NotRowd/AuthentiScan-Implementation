import hashlib
import json
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.request import urlopen

import numpy as np

from experimental_service import ExperimentalLocalizer, MODEL, HEAD_SHA, load_candidate, experimental_prediction
from localizer_service import make_server


class ExperimentalTests(unittest.TestCase):
    def test_requires_explicit_opt_in_and_pinned_artifacts(self):
        with self.assertRaisesRegex(ValueError, 'explicit opt-in'):
            ExperimentalLocalizer()
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'best-head.pt').write_bytes(b'wrong')
            with self.assertRaisesRegex(ValueError, 'artifacts changed'):
                load_candidate(root)

    def test_real_profile_remains_failed_and_unapproved(self):
        profile, fingerprint = load_candidate()
        self.assertEqual(profile['validation_status'], 'failed')
        self.assertFalse(profile['release_approved'])
        self.assertEqual(profile['threshold'], .97)
        self.assertEqual(len(fingerprint), 64)

    def test_candidate_empty_and_full_preserve_disclosures(self):
        for fill, status in [(0., 'uncertain'), (1., 'uncertain'), (None, 'available')]:
            scores = np.full((32, 32), fill if fill is not None else 0.)
            if fill is None:
                scores[2, 3] = .98
            result = experimental_prediction(scores, .97, (100, 200), 'a'*64, 'b'*64)
            self.assertEqual(result['status'], status)
            self.assertEqual(result['usage_mode'], 'experimental')
            self.assertEqual(result['validation_status'], 'failed')
            self.assertEqual(result['model_version'], MODEL)
            self.assertEqual(result['model_sha256'], HEAD_SHA)
            self.assertFalse(result['release_approved'])
            self.assertEqual(result['score_scale'],10000)
            self.assertEqual(len(result['score_grid']),1024)
            if fill is not None:
                self.assertEqual(set(result['score_grid']),{int(fill*10000)})
            self.assertNotIn('verdict', result)
        with self.assertRaises(ValueError):
            experimental_prediction(np.full((32,32),1.1),.97,(100,200),'a'*64,'b'*64)

    def test_score_preview_preserves_weak_absolute_response(self):
        result=experimental_prediction(np.full((32,32),.12),.97,(100,200),'a'*64,'b'*64)
        self.assertEqual(result['status'],'uncertain')
        self.assertIsNone(result['mask'])
        self.assertEqual(set(result['score_grid']),{1200})

    def test_health_discloses_failed_model_identity(self):
        class FakeEngine:
            model_version=MODEL
            usage_mode='experimental'
            validation_status='failed'
        server=make_server(0,FakeEngine())
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            with urlopen(f'http://127.0.0.1:{server.server_port}/health') as response:
                value=json.load(response)
            self.assertTrue(value['model_loaded'])
            self.assertEqual(value['validation_status'],'failed')
            self.assertEqual(value['model_version'],MODEL)
        finally:
            server.shutdown();server.server_close();thread.join(3)


if __name__=='__main__':unittest.main()
