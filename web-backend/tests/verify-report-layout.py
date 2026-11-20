"""Text, visual-boundary and uncertainty checks on generated PDF fixtures."""
from pathlib import Path
import pdfplumber
from pypdf import PdfReader

root = Path(__file__).resolve().parent.parent / '.test-results/report-layout'
texts = {}
for name in ['sample', 'uncertain', 'missing', 'failed', 'long', 'invalid']:
    file = root / f'{name}.pdf'
    reader = PdfReader(file)
    texts[name] = '\n'.join(page.extract_text() or '' for page in reader.pages)
    assert reader.pages and len(reader.pages) <= 8, (name, len(reader.pages))
    with pdfplumber.open(file) as pdf:
        for index, page in enumerate(pdf.pages):
            words = page.extract_words()
            assert words, (name, index, 'blank page')
            # Check the entire text layer against the safe printable page region.
            for word in words:
                assert word['x0'] >= 42 and word['x1'] <= page.width - 40, (name, index, word)
                assert word['top'] >= 30 and word['bottom'] <= page.height - 18, (name, index, word)
            page_text = page.extract_text()
            assert f'Page {index + 1} of {len(pdf.pages)}' in page_text, (name, index, 'footer')
            if name in ['uncertain', 'failed', 'invalid']:
                pink = [rect for rect in page.rects if rect.get('non_stroking_color') == (190 / 255, 0, 101 / 255)]
                assert not pink, (name, index, 'uncertain/invalid localization was highlighted')
    print(f'PASS {name}: {len(reader.pages)} pages, page numbers, text within margins')

assert len(PdfReader(root / 'sample.pdf').pages) == 4
assert 'What looks unusual?' in texts['sample']
assert 'Synthetic fixture: a bright glow appears around the eye area.' in texts['sample']
for name in ['missing', 'invalid', 'failed']:
    assert 'Synthetic fixture: a bright glow' not in texts[name]
for name in ['missing', 'invalid']:
    assert 'No valid visual-feature review was saved' in texts[name]
assert ' '.join(texts['long'].split()).count('Synthetic fixture: an unusual bright edge appears along this surface.') == 40
for text in ['Image description', 'An illustrated person and dog', 'Grad-CAM', 'Edited-area check', 'Objects in the image', '92.00%', 'This model failed validation', '60%', 'Technical record']:
    assert text in texts['sample'], text
assert 'Inconclusive' in texts['uncertain']
assert 'No single-class heatmap' in texts['uncertain']
assert 'Pink = saved candidate areas' not in texts['uncertain']
assert 'No image description was saved' in texts['missing']
assert 'Original image unavailable' in texts['missing']
assert 'No AI result' in texts['failed'] and 'No scan credit was used' in texts['failed']
assert '82.00%' not in texts['failed'] and 'An illustrated person and dog' not in texts['failed']
assert '[U+1F50E]' in texts['long']
assert '20. a long object category' in texts['long']
assert ' '.join(texts['long'].split()).count('This is a long saved description') == 19
assert 'INVALID SCENE' not in texts['invalid'] and 'invented' not in texts['invalid']
assert 'No image description was saved' in texts['invalid']
print('PASS saved features, long captions, uncertain/failed safety, invalid metadata and font fallback')
