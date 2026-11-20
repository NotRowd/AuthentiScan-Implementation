import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('loader_fix', Path(__file__).parent / 'fused-handoff/apply_loader_fix.py')
fixer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixer)


class LoaderFixTests(unittest.TestCase):
    def fixture(self, root):
        package, fix = root / 'package', root / 'fix'
        package.mkdir(); fix.mkdir()
        files = {}
        replacements = {}
        for name in ('ai-localization/evaluate_fused_candidate.py', 'run_evaluation.py', 'START-HERE.md'):
            path = package / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'old')
            files[name] = hashlib.sha256(b'old').hexdigest()
            new = fix / 'payload' / name
            new.parent.mkdir(parents=True, exist_ok=True)
            new.write_bytes(b'new')
            replacements[name] = hashlib.sha256(b'new').hexdigest()
        old = json.dumps(dict(files=files)).encode()
        (package / 'RELEASE.json').write_bytes(old)
        old_hash = hashlib.sha256(old).hexdigest()
        new = dict(files=replacements, loader_revision=2, supersedes_release_sha256=old_hash)
        (fix / 'FIX.json').write_text(json.dumps(dict(replacements=replacements,
            new_release_sha256=hashlib.sha256(json.dumps(new, indent=2).encode()).hexdigest())))
        (package / 'evaluation-output').mkdir()
        (package / 'evaluation-output/RESULT.json').write_bytes(b'failed-original')
        return package, fix, old_hash

    def test_apply_preserves_old_output_and_rejects_repeat(self):
        with tempfile.TemporaryDirectory() as temp:
            package, fix, old_hash = self.fixture(Path(temp))
            with patch.object(fixer, 'OLD_RELEASE', old_hash):
                fixer.apply(package, fix)
                self.assertEqual((package / 'run_evaluation.py').read_bytes(), b'new')
                self.assertEqual((package / 'loader-fix-v2-backup/run_evaluation.py').read_bytes(), b'old')
                self.assertEqual((package / 'evaluation-output/RESULT.json').read_bytes(), b'failed-original')
                with self.assertRaises(ValueError): fixer.apply(package, fix)

    def test_corrupt_original_or_payload_rejected_before_write(self):
        for location in ('package', 'fix'):
            with self.subTest(location=location), tempfile.TemporaryDirectory() as temp:
                package, fix, old_hash = self.fixture(Path(temp))
                target = package / 'START-HERE.md' if location == 'package' else fix / 'payload/START-HERE.md'
                target.write_bytes(b'corrupt')
                with patch.object(fixer, 'OLD_RELEASE', old_hash), self.assertRaises(ValueError):
                    fixer.apply(package, fix)
                self.assertEqual((package / 'run_evaluation.py').read_bytes(), b'old')
                self.assertFalse((package / 'loader-fix-v2-backup').exists())


if __name__ == '__main__': unittest.main()
