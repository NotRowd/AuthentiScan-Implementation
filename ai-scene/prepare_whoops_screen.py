"""Acquire first four public WHOOPS test examples for frozen-prompt screening.

CC BY 4.0 plus authors' test-only commercial-use condition. Not training data.
Reference explanations are dataset annotations, not verified physical truths.
"""
import hashlib
import json
from pathlib import Path
import urllib.parse
import urllib.request

DEST = Path(__file__).resolve().parent / 'datasets' / 'whoops-screen-v1'
IDS = (
    '00c2b245b97d9c02150d2b88df1d5c8d1cf398e20e18dec1bb7ba268ad0924e3',
    '0165e9be8bd8dce5ca046484a5f6340cf767f18ae4e5a80a1e5139fc65172bff',
    '0190270cf0f43e512685879bc8ee88d5bb858132d67158fb27830bea83674716',
    '02064a6756a56defa8aec1b7a72a019abb94bb620ffab5f83f678d9639de79f1')


def bounded_get(url, limit):
    with urllib.request.urlopen(url, timeout=60) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError('Public asset exceeds download bound')
    return data


def main():
    if DEST.exists():
        raise ValueError('Dataset screen directory already exists; never overwrite')
    rows = json.loads(bounded_get('https://datasets-server.huggingface.co/rows?dataset=nlphuji%2Fwhoops&config=default&split=test&offset=0&length=4', 1024 * 1024))['rows']
    if tuple(row['row']['image_id'] for row in rows) != IDS:
        raise ValueError('Public sample order changed; review before downloading')
    license_url = 'https://whoops-benchmark.github.io/static/pdfs/whoops_license_agreement.txt'
    license_text = bounded_get(license_url, 16384)
    DEST.mkdir(parents=True)
    with (DEST / 'LICENSE.txt').open('xb') as handle:
        handle.write(license_text)
    samples = []
    for i, record in enumerate(rows):
        row = record['row']
        url = row['image']['src']
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme != 'https' or parsed.hostname != 'datasets-server.huggingface.co' or not parsed.path.startswith('/cached-assets/nlphuji/whoops/'):
            raise ValueError('Unexpected public image source')
        data = bounded_get(url, 5 * 1024 * 1024)
        filename = f'{i:02d}.jpg'
        with (DEST / filename).open('xb') as handle:
            handle.write(data)
        samples.append(dict(sample_id='whoops-' + str(i), image_id=row['image_id'],
            image=filename, sha256=hashlib.sha256(data).hexdigest(), source_path=parsed.path,
            reference_explanation=row.get('designer_explanation'), author=row.get('designer'),
            reference_is_not_verified_physical_truth=True))
        print('Downloaded public screening image ' + str(i), flush=True)
    manifest = dict(dataset='WHOOPS!', repository='nlphuji/whoops', original_split='test',
        usage='frozen-prompt screening only; not training', license_url=license_url,
        citation='Bitton-Guetta et al., Breaking Common Sense: WHOOPS!, ICCV 2023',
        paper='https://openaccess.thecvf.com/content/ICCV2023/html/Bitton-Guetta_Breaking_Common_Sense_WHOOPS_A_Vision-and-Language_Benchmark_of_Synthetic_and_Compositional_ICCV_2023_paper.html',
        samples=samples, accuracy_benchmark=False)
    with (DEST / 'manifest.json').open('x', encoding='utf-8') as handle:
        json.dump(manifest, handle, indent=2)


if __name__ == '__main__':
    main()
