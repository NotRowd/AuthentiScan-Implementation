"""One private production endpoint check, without creating a saved scan."""
import json
import sys
import urllib.request
import urllib.error

opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
request=urllib.request.Request('http://127.0.0.1:5005/features', data=sys.stdin.buffer.read(),
    headers={'X-AuthentiScan-Features':'visual-features-v1','Content-Type':'image/png'})
try:
    with opener.open(request, timeout=300) as response:
        payload=json.load(response)
except urllib.error.HTTPError as error:
    payload=json.loads(error.read(2048))
    print(json.dumps({'http_status':error.code,'code':payload.get('code')}))
    raise SystemExit(1)
review=payload['data']
assert review['anomaly_review_version']=='visual-anomalies-simple-v1'
print(json.dumps({'version':review['anomaly_review_version'],'image_type':review.get('image_type'),
    'findings':review['findings']},indent=2))
