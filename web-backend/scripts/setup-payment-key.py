"""Save local test-payment settings without contacting PayMongo or Firebase."""
import argparse
import getpass
import os
from pathlib import Path
import re
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--webhook', action='store_true', help='Save the webhook signing secret instead of the API key')
    mode.add_argument('--test-user', action='store_true', help='Add a Firebase user UID to the test-checkout allowlist')
    args = parser.parse_args()
    field = 'PAYMONGO_TEST_WEBHOOK_SECRET' if args.webhook else 'PAYMONGO_TEST_SECRET_KEY'
    label = 'webhook signing secret' if args.webhook else 'test key'
    prefix = 'whsk_' if args.webhook else 'sk_test_'
    if args.test_user:
        field, label = 'AUTHENTISCAN_BILLING_TEST_USERS', 'test-user UID'
    root = Path(__file__).resolve().parent.parent
    target = root / '.secrets' / 'payments.test.env'
    source = target if target.exists() else root / 'payments.test.env.example'
    text = source.read_text(encoding='utf-8-sig')
    pattern = rf'(?m)^{field}=[^\r\n]*'
    if len(re.findall(pattern, text)) != 1:
        raise ValueError('Expected exactly one matching setting; file left unchanged.')
    if args.test_user:
        key = input('Paste the Firebase UID of your designated AuthentiScan test account: ').strip()
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', key):
            raise ValueError('Expected a generated Firebase UID, not an email or API key; file left unchanged.')
        if key.startswith(('sk_', 'pk_', 'whsk_')):
            raise ValueError('This looks like a payment key, not a Firebase UID; file left unchanged.')
        existing = re.search(pattern, text).group(0).split('=', 1)[1].strip()
        users = [value.strip() for value in existing.split(',') if value.strip()]
        if key not in users:
            users.append(key)
        key = ','.join(users)
    else:
        key = getpass.getpass(f'Paste {label} (hidden), then press Enter: ').strip()
        if not re.fullmatch(re.escape(prefix) + r'[A-Za-z0-9]+', key):
            raise ValueError(f'Expected {label} starting with {prefix}; file left unchanged.')
    updated = re.sub(pattern, lambda _: field + '=' + key, text)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', newline='\n',
                                         dir=target.parent, delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(updated)
        os.replace(temporary, target)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()
    print(f'Saved the {label} locally. Other payment settings preserved.')
    print('No payment request was sent. Restart the payment-enabled backend after configuration is complete.')
    if args.test_user:
        print('UID saved locally; account existence and checkout have not yet been verified.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError) as error:
        print(str(error))
        raise SystemExit(1)
    except (KeyboardInterrupt, EOFError):
        print('\nCancelled; no key saved.')
        raise SystemExit(1)
