"""Linux runner adapter. Preserve the locked Qwen model, prompts and API."""
from pathlib import Path
import sys
import run_visual_candidate
from prepare_visual_candidate import PLAN, DEST, digest


def verify_linux_assets():
    for record in PLAN['files']:
        file = DEST / record['name']
        if file.stat().st_size != record['bytes'] or digest(file) != record['sha256']:
            raise ValueError('Visual model checksum mismatch')
    return Path('/usr/local/bin/llama-server')


run_visual_candidate.verify_assets = verify_linux_assets
import qwen_service

if __name__ == '__main__':
    sys.exit(qwen_service.main())
