"""Apply the reviewed checkout update to the existing AWS deployment."""
import hashlib
import os
from pathlib import Path
import shutil
from datetime import datetime, timezone

root = Path.home() / 'authentiscan'
staging = Path(__file__).resolve().parent
expected = {
    'billing-config.mjs': '4bda6262a85853e47665353fadf12d223d68764c6d6c42c47b7fd066406aa052',
    'billing.mjs': '4bc7827c7d2b67408c89917514097d138d8ad5836fefd04e8676bc0c4c669b24',
}
for name, digest in expected.items():
    target = root / 'api/server' / name
    if hashlib.sha256(target.read_bytes()).hexdigest() != digest:
        raise SystemExit(f'{name} changed since review; update stopped.')
    if not (staging / name).is_file():
        raise SystemExit(f'Missing staged file: {name}')

runtime = root / 'secrets/runtime.env'
lines = runtime.read_text(encoding='utf-8-sig').splitlines()
if 'AUTHENTISCAN_BILLING_MODE=test' not in lines:
    raise SystemExit('Expected test billing mode; update stopped.')
backup = Path.home() / 'authentiscan-backups' / ('checkout-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
backup.mkdir(parents=True, mode=0o700)
backup.chmod(0o700)
shutil.copy2(runtime, backup / 'runtime.env')
(backup / 'runtime.env').chmod(0o600)
for name in expected:
    target = root / 'api/server' / name
    shutil.copy2(target, backup / name)
    shutil.copyfile(staging / name, target)
lines = [line for line in lines if not line.startswith('AUTHENTISCAN_BILLING_TEST_USERS=')]
lines.append('AUTHENTISCAN_BILLING_TEST_USERS=*')
temp = runtime.with_name('runtime.env.checkout-update')
with open(temp, 'x', encoding='utf-8', opener=lambda path, flags: os.open(path, flags, 0o600)) as stream:
    stream.write('\n'.join(lines) + '\n')
os.replace(temp, runtime)
print(f'Applied test-checkout update. Private backup: {backup}')
