from __future__ import annotations

import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import continue_tgif2_benchmark as workflow


class PipelineTests(unittest.TestCase):
    def test_stages_are_automatic_but_do_not_release_model(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            root = Path(directory)
            checkpoint = root / "checkpoint"
            checkpoint.write_bytes(b"test-only")
            cache = root / "weights/hub/facebookresearch_dinov2_7764ea0f912e53c92e82eb78a2a1631e92725fc8"
            cache.mkdir(parents=True)
            (cache / "hubconf.py").touch()
            with patch.object(workflow, "ROOT", root), \
                 patch.object(workflow, "CHECKPOINT", checkpoint), \
                 patch.object(workflow, "CHECKSUM", hashlib.sha256(b"test-only").hexdigest()), \
                 patch.object(workflow, "execute") as execute, \
                 patch.object(workflow, "wait_for_download") as wait:
                workflow.pipeline(root, 2)
            wait.assert_called_once_with(root, 2)
            self.assertEqual([call.args[1] for call in execute.call_args_list],
                             ["preflight", "prepare", "infer", "evaluate", "summarize"])
            evaluation = execute.call_args_list[3].args[2]
            self.assertEqual(evaluation[evaluation.index("--fit-splits") + 1], "dev")
            infer = execute.call_args_list[2].args[2]
            self.assertIn("--offline", infer)
            self.assertNotIn("--threshold", infer)
            status = json.loads((root / "status.json").read_text())
            self.assertEqual(status["stage"], "evaluation_complete_needs_review")
            self.assertFalse(status["release_approved"])
            self.assertFalse(status["production_changed"])

    def test_stage_failure_stops_pipeline(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            root = Path(directory)
            with self.assertRaisesRegex(RuntimeError, "exit 7"):
                workflow.execute(root, "failure-test", ["-c", "raise SystemExit(7)"],
                                 dict(workflow.os.environ))
            self.assertTrue((root / "failure-test.log").is_file())

    def test_owned_download_precedes_preparation(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            root = Path(directory)
            checkpoint = root / "checkpoint"
            checkpoint.write_bytes(b"test-only")
            cache = root / "weights/hub/facebookresearch_dinov2_7764ea0f912e53c92e82eb78a2a1631e92725fc8"
            cache.mkdir(parents=True)
            (cache / "hubconf.py").touch()
            with patch.object(workflow, "ROOT", root), \
                 patch.object(workflow, "CHECKPOINT", checkpoint), \
                 patch.object(workflow, "CHECKSUM", hashlib.sha256(b"test-only").hexdigest()), \
                 patch.object(workflow, "execute") as execute, \
                 patch.object(workflow, "wait_for_download") as wait:
                workflow.pipeline(root, 2, download=True)
            wait.assert_not_called()
            self.assertEqual([call.args[1] for call in execute.call_args_list],
                             ["preflight", "download", "prepare", "infer", "evaluate", "summarize"])

    def test_wait_finishes_when_verified_download_manifest_exists(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            root = Path(directory)
            (root / "download_manifest.json").write_text("{}")
            with patch.object(workflow, "ARCHIVES", root), patch.object(workflow.time, "sleep") as sleep:
                workflow.wait_for_download(root, 1)
            sleep.assert_not_called()


if __name__ == "__main__":
    unittest.main()
