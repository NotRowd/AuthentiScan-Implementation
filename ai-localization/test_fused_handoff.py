import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / 'fused-handoff'))
sys.path.insert(0, str(HERE.parent / 'ai-scene'))
import verify_package as verifier
import run_evaluation as launcher


class HandoffTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        folder = self.root / 'ai-localization'
        folder.mkdir()
        (folder / 'sample.py').write_text('# fixture', encoding='utf-8')
        self.release = dict(purpose='fused-sofake-nine-image-cpu-evaluation-v1', files={
            'ai-localization/sample.py': hashlib.sha256(b'# fixture').hexdigest()})
        self.save()

    def save(self):
        (self.root / 'RELEASE.json').write_text(json.dumps(self.release), encoding='utf-8')

    def test_integrity_and_tamper(self):
        with patch.object(verifier, 'ROOT', self.root):
            self.assertEqual(verifier.verify()[1], self.release)
            (self.root / 'ai-localization/sample.py').write_text('changed')
            with self.assertRaisesRegex(ValueError, 'mismatch'):
                verifier.verify()

    def test_extra_source_rejected(self):
        (self.root / 'ai-localization/extra.py').write_text('# unexpected')
        with patch.object(verifier, 'ROOT', self.root), self.assertRaisesRegex(ValueError, 'Unexpected'):
            verifier.verify()

    def test_escape_rejected(self):
        self.release['files']['../escape.py'] = 'a'*64
        self.save()
        with patch.object(verifier, 'ROOT', self.root), self.assertRaisesRegex(ValueError, 'Unsafe'):
            verifier.verify()

    def run_fixture(self, timeout=False, failed=False):
        owner = self
        class Worker:
            stopped = False
            def __init__(self, command, **kwargs):
                owner.assertIn('--require-author-runtime', command)
                owner.assertIn('sofake', command)
                owner.assertEqual(kwargs['cwd'], owner.root)
                result = owner.root / 'evaluation-output/results'
                result.mkdir()
                (result / 'RESULT.json').write_text(json.dumps({'stage': 'failed' if failed else 'development_screen_complete'}))
            def wait(self, timeout):
                if timeout == 1800 and not self.stopped and owner.timeout:
                    raise subprocess.TimeoutExpired('owned-worker', timeout)
                return 1 if failed else 0
            def terminate(self): self.stopped = True
            def kill(self): self.stopped = True
            def poll(self): return 0 if self.stopped or not owner.timeout else None
        self.timeout = timeout
        with patch.object(launcher, 'ROOT', self.root), patch.object(launcher, 'verify', return_value=('a'*64, self.release)), patch.object(launcher.subprocess, 'Popen', Worker), patch('process_lifecycle.protect_process_tree'):
            code = launcher.main()
        archive = self.root / 'evaluation-output/Return-to-Kent-FUSED.zip'
        with zipfile.ZipFile(archive) as bundle:
            report = json.loads(bundle.read('LAUNCHER.json'))
            hashes = json.loads(bundle.read('SHA256.json'))
            for name, expected in hashes.items():
                self.assertEqual(hashlib.sha256(bundle.read(name)).hexdigest(), expected)
        return code, report

    def test_success_returns_zip_without_release_approval(self):
        code, report = self.run_fixture()
        self.assertEqual(code, 0)
        self.assertTrue(report['completed'])
        self.assertFalse(report['release_approved'])
        with patch.object(launcher, 'ROOT', self.root), self.assertRaises(FileExistsError):
            launcher.main()

    def test_timeout_returns_failure_zip(self):
        code, report = self.run_fixture(timeout=True)
        self.assertEqual(code, 1)
        self.assertTrue(report['timed_out'])
        self.assertFalse(report['completed'])

    def test_worker_failure_preserved(self):
        code, report = self.run_fixture(failed=True)
        self.assertEqual(code, 1)
        self.assertFalse(report['completed'])


if __name__ == '__main__':
    unittest.main()
