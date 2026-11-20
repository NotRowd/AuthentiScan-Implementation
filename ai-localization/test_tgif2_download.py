from __future__ import annotations

import hashlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import acquire_tgif2_flux1dev_subset as acquisition


class RangeResponse(io.BytesIO):
    status = 206

    def __init__(self, payload: bytes, start: int, end: int, total: int, interrupted=False):
        super().__init__(payload)
        self.headers = {"Content-Range": f"bytes {start}-{end}/{total}"}
        self.interrupted = interrupted

    def getcode(self):
        return self.status

    def read(self, size=-1):
        if self.interrupted and self.tell() >= 4:
            raise TimeoutError("simulated interrupted transfer")
        return super().read(size)


class DownloadTests(unittest.TestCase):
    def test_interrupted_range_resumes_without_duplicate_bytes(self):
        payload = b"abcdefghijkl"
        archive = acquisition.Archive("test", "public", "archive.gz", len(payload),
                                      hashlib.sha256(payload).hexdigest())
        starts = []

        class Opener:
            def open(self, request, timeout):
                start, end = map(int, request.get_header("Range").removeprefix("bytes=").split("-"))
                starts.append(start)
                return RangeResponse(payload[start:end + 1], start, end, len(payload),
                                     interrupted=len(starts) == 1)

        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            root = Path(directory)
            budget = acquisition.DownloadBudget(root)
            with patch.object(acquisition, "RANGE_BYTES", 8), \
                 patch.object(acquisition, "READ_BYTES", 4), \
                 patch.object(acquisition.time, "sleep"):
                result = acquisition.download(archive, root, Opener(), "token", budget)
            self.assertEqual(result.read_bytes(), payload)
            self.assertEqual(starts, [0, 4])
            self.assertFalse(result.with_suffix(".gz.part").exists())
            self.assertGreaterEqual(budget.used, len(payload))

    def test_budget_persists_and_rejects_excess_before_read(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            root = Path(directory)
            budget = acquisition.DownloadBudget(root, limit=100_000_010)
            budget.reserve(8)
            resumed = acquisition.DownloadBudget(root, limit=100_000_010)
            self.assertEqual(resumed.used, 100_000_008)
            with self.assertRaisesRegex(RuntimeError, "budget"):
                resumed.reserve(3)
            self.assertEqual(resumed.used, 100_000_008)


if __name__ == "__main__":
    unittest.main()
