from pathlib import Path
import json
import pdfplumber
from pypdf import PdfReader
root=Path(__file__).resolve().parents[2] / 'output/pdf-score-fix-20261121'
expected={'authentic':'97.46%','ai-generated':'93.15%','ai-edited':'91.25%','uncertain':'58.40%','digital':'96.04%','unsupported':'75.00%','zero':'0.00%','full':'100.00%'}
results=[]
for file in sorted((root/'pdf').glob('*.pdf')):
 reader=PdfReader(file);text='\n'.join(page.extract_text() or '' for page in reader.pages)
 assert 'Technical record' not in text,file
 assert 'Record ID:' not in text,file
 assert 'Report continued' not in text or len(reader.pages)>3,file
 if file.stem in expected:
  first=reader.pages[0].extract_text()
  assert expected[file.stem] in first,(file,first)
  assert 'N/A' not in first,file
  assert 'Authentic Not supplied' not in first,file
  assert 'AI-generated Not supplied' not in first,file
 if file.stem=='digital':assert 'Editing confidence, not confidence in authenticity.' in text
 if file.stem=='ai-edited':assert 'Confidence in detected AI editing' in text
 if file.stem in ['missing','invalid']:assert 'Not supplied' in reader.pages[0].extract_text()
 if file.stem=='failed':assert '97.46%' not in text and 'No AI result' in text
 if file.stem=='class-scores':assert '18.00%' in text and '82.00%' in text
 with pdfplumber.open(file) as pdf:
  for i,page in enumerate(pdf.pages):
   words=page.extract_words();assert words,(file,i,'Blank page')
   assert f'Page {i+1} of {len(pdf.pages)}' in page.extract_text(),(file,i,'footer')
   for word in words:assert word['x0']>=42 and word['x1']<=page.width-40 and word['top']>=30 and word['bottom']<=page.height-18,(file,i,word)
 results.append({'file':file.name,'pages':len(reader.pages),'passed':True})
assert len(results)==12
(root/'checks.json').write_text(json.dumps({'passed':True,'fixtures':results,'checks':['saved confidence on first page','no invented binary scores','editing score remains distinct','missing/invalid/failed safe','native binary class scores retained','Technical record removed','no blank technical page','text margins and page numbering']},indent=2))
print(json.dumps({'passed':True,'fixtures':len(results),'authenticPages':next(r['pages'] for r in results if r['file']=='authentic.pdf')}))
