"""Explicit, optional acquisition of the official model on the recipient's PC."""
import hashlib
import http.cookiejar
from html.parser import HTMLParser
from pathlib import Path
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent
DEFAULT = ROOT / "weights" / "mesorch_p-118.pth"
SIZE = 812736608
SHA = "efa61592f2c783698a8760c2d3e48dc58c1b4890c50dbcdc166b24425a197674"
FILE_ID = "1uDu-wJLUA18xX0xiRoSgq2EtRm5KP4h5"


def verify(path):
    if path.stat().st_size != SIZE:
        raise ValueError("Unexpected checkpoint length")
    with path.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != SHA:
            raise ValueError("Unexpected checkpoint SHA-256")


class Confirmation(HTMLParser):
    def __init__(self):
        super().__init__()
        self.fields = {}
        self.action = None

    def handle_starttag(self, tag, attrs):
        fields = dict(attrs)
        if tag == "form" and fields.get("id") == "download-form":
            self.action = fields.get("action")
        if tag == "input" and fields.get("type") == "hidden":
            self.fields[fields["name"]] = fields["value"]


def acquire():
    DEFAULT.parent.mkdir(exist_ok=True)
    if DEFAULT.exists():
        verify(DEFAULT)
        return
    partial = DEFAULT.with_suffix(".pth.partial")
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    first = "https://drive.google.com/uc?export=download&id=" + FILE_ID
    with opener.open(first, timeout=30) as response:
        page = Confirmation()
        page.feed(response.read(1000000).decode("utf-8"))
    if page.action != "https://drive.usercontent.google.com/download" or page.fields.get("id") != FILE_ID:
        raise RuntimeError("Drive confirmation changed. Use the official link in START-HERE.md.")
    with opener.open(page.action + "?" + urllib.parse.urlencode(page.fields), timeout=60) as response:
        with partial.open("xb") as output:
            remaining = SIZE
            while remaining:
                chunk = response.read(min(1048576, remaining))
                if not chunk:
                    raise IOError("Incomplete download")
                output.write(chunk)
                remaining -= len(chunk)
            if response.read(1):
                raise IOError("Excess download length")
    verify(partial)
    partial.rename(DEFAULT)


if __name__ == "__main__":
    acquire()
    print("Verified", DEFAULT)
