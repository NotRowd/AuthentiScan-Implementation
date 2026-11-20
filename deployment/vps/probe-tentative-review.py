"""One private deployed-worker request; no scan write or third-party API."""
import json
import sys
import urllib.request

opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
request = urllib.request.Request('http://127.0.0.1:5005/features',
    data=sys.stdin.buffer.read(), headers={'X-AuthentiScan-Features': 'visual-features-v1', 'Content-Type': 'image/jpeg'})
with opener.open(request, timeout=300) as response:
    payload = json.load(response)
assert payload['success'] is True
review = payload['data']
assert review['anomaly_review_version'] == 'visual-anomalies-v3-tentative-1'
print(json.dumps(dict(version=review['anomaly_review_version'],
    tentative_observations=[item for item in review['findings'] if item['status'] == 'possible_concern'],
    unassessed=sum(item['status'] == 'unable_to_assess' for item in review['findings'])), indent=2))
