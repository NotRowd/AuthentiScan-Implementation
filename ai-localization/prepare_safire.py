"""Download only approved official SAFIRE assets; no inference or app changes."""
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent
ASSETS = (
    ('safire.pth', 'https://drive.google.com/uc?export=download&id=1KVbMC7z6eG7xDMoSbvelqD7JW3R0koSg', 420798714),
    ('sam_vit_b_01ec64.pth', 'https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth', 375042383),
)


class Confirmation(HTMLParser):
    def __init__(self):
        super().__init__()
        self.action = None
        self.fields = {}
        self.inside = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'form' and attrs.get('id') == 'download-form':
            self.inside = True
            self.action = attrs.get('action')
        if self.inside and tag == 'input' and attrs.get('name'):
            self.fields[attrs['name']] = attrs.get('value', '')

    def handle_endtag(self, tag):
        if tag == 'form':
            self.inside = False


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def main():
    folder = ROOT / 'weights/safire'
    folder.mkdir(parents=True, exist_ok=True)
    ledger_file = folder / 'assets.json'
    ledger = json.loads(ledger_file.read_text()) if ledger_file.exists() else {}
    for name, url, size in ASSETS:
        target = folder / name
        if target.exists():
            digest = sha(target)
            if target.stat().st_size != size or ledger.get(name, {}).get('sha256') != digest:
                raise ValueError('Existing unverified asset; refusing to overwrite: ' + name)
            print('Verified existing ' + name, flush=True)
            continue
        partial = folder / (name + '.partial')
        if partial.exists():
            raise ValueError('Partial download exists; inspect it before retrying: ' + name)
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor())
        response = opener.open(url, timeout=60)
        if 'text/html' in response.headers.get('Content-Type', ''):
            page = response.read(1024 * 1024 + 1)
            response.close()
            if len(page) > 1024 * 1024:
                raise ValueError('Oversized confirmation page')
            form = Confirmation()
            form.feed(page.decode('utf-8'))
            parsed = urllib.parse.urlsplit(form.action or '')
            if parsed.scheme != 'https' or parsed.hostname != 'drive.usercontent.google.com' or form.fields.get('id') != '1KVbMC7z6eG7xDMoSbvelqD7JW3R0koSg':
                raise ValueError('Unexpected official download confirmation')
            response = opener.open(form.action + '?' + urllib.parse.urlencode(form.fields), timeout=60)
        if 'text/html' in response.headers.get('Content-Type', ''):
            response.close()
            raise ValueError('Download returned HTML instead of weights')
        received = 0
        checkpoint = 0
        with response, partial.open('xb') as output:
            while True:
                block = response.read(1024 * 1024)
                if not block:
                    break
                received += len(block)
                if received > size:
                    raise ValueError('Asset exceeds approved size')
                output.write(block)
                if received - checkpoint >= 50 * 1024 * 1024:
                    print(f'{name}: {received}/{size} bytes', flush=True)
                    checkpoint = received
        if received != size:
            raise ValueError('Asset size mismatch')
        digest = sha(partial)
        partial.rename(target)
        ledger[name] = dict(bytes=size, sha256=digest, source=url, hash_type='local_integrity_pin_not_publisher_hash')
        ledger_file.write_text(json.dumps(ledger, indent=2), encoding='utf-8')
        print(f'Completed {name}: {digest}', flush=True)


if __name__ == '__main__':
    main()
