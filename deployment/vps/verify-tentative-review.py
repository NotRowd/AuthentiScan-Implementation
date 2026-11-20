"""Smoke-test the deployed parser without inference."""
import json
from evaluate_visual_candidate import CATEGORIES, REQUEST_VERSION, parse_review

assert REQUEST_VERSION == 'visual-anomalies-v3-tentative-1'
data = dict(image_type='photograph_like', description='A hand is visible.', findings=[
    dict(category=c, status='unable_to_assess', observation='', location='', reason='') for c in CATEGORIES])
data['findings'][1].update(status='possible_concern',
    observation='Several fingers seem fused together along the lower edge.',
    location='Lower left hand', reason='The anatomy has an interrupted outline instead of separate digits.')
data['findings'][3].update(status='possible_concern',
    observation='The lighting on the arm appears different from the landscape.',
    location='Raised arm at the center', reason='The hand has an unnatural position for a swimming motion.')
value = parse_review(json.dumps(data))
assert value['findings'][1]['status'] == 'possible_concern'
assert value['findings'][3]['status'] == 'unable_to_assess'
data['findings'][4] = dict(data['findings'][1], category='scene')
assert sum(item['status'] == 'possible_concern' for item in parse_review(json.dumps(data))['findings']) == 1
print('PASS: deployed tentative parser retains detailed observations and withholds mismatched explanations/duplicates.')
