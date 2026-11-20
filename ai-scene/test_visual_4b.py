import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import run_visual_4b as runner


class PreflightTests(unittest.TestCase):
    def test_low_memory_fails_before_creating_output_or_starting_process(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'run'
            with patch('sys.argv', ['run_visual_4b.py', '--output', str(output)]), \
                 patch.object(runner, 'free_memory_bytes', return_value=runner.MINIMUM_RAM - 1), \
                 patch.object(runner.subprocess, 'Popen') as launch:
                with self.assertRaisesRegex(RuntimeError, 'No model started'):
                    runner.main()
                launch.assert_not_called()
                self.assertFalse(output.exists())

    def test_existing_output_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch('sys.argv', ['run_visual_4b.py', '--output', folder]), \
                 patch.object(runner.subprocess, 'Popen') as launch:
                with self.assertRaises(ValueError):
                    runner.main()
                launch.assert_not_called()

    def test_corrupt_weights_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            target = root / 'weights' / 'candidate'
            target.mkdir(parents=True)
            (target / 'test.gguf').write_bytes(b'wrong')
            plan = dict(candidate_id='candidate', files=[dict(name='test.gguf', bytes=5, sha256='0'*64)])
            with patch.object(runner, 'ROOT', root), self.assertRaisesRegex(ValueError, 'checksum'):
                runner.verify_candidate(plan)


if __name__ == '__main__': unittest.main()
