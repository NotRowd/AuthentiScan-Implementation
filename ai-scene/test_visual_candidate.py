import json
import unittest
from unittest.mock import patch
from evaluate_visual_candidate import CATEGORIES, NoRedirect, parse_review, select_input, request_review, REVIEW_SCHEMA, completion_text


def fixture():
    return dict(image_type='photograph_like', description='A person is standing on a path.', findings=[
        dict(category=c, status='unable_to_assess', observation='', location='') for c in CATEGORIES])


class CandidateTests(unittest.TestCase):
    def test_extra_valid_findings_do_not_discard_the_whole_review(self):
        data=fixture()
        for item in data['findings']:
            item['reason']=''
        examples=[
            ('eyes','The left pupil has two separate outlines inside the iris.','Face at the center','The pupil has a second edge inside the same eye.'),
            ('shape','Several fingers merge together at the lower left hand.','Lower left hand','The finger outlines join while the palm has a clear edge.'),
            ('lighting','The wall shadow points away from the neighboring tree shadow.','Wall at the right','The two shadows point in different directions under the same light.'),
        ]
        for category,observation,location,reason in examples:
            data['findings'][CATEGORIES.index(category)].update(status='possible_concern',observation=observation,location=location,reason=reason)
        result=parse_review(json.dumps(data))
        self.assertEqual(sum(f['status']=='possible_concern' for f in result['findings']),2)
        self.assertEqual(result['findings'][3]['status'],'unable_to_assess')
        self.assertIn('not shown',result['findings'][3]['observation'])

    def test_tentative_wording_and_category_mismatch(self):
        data=fixture()
        for item in data['findings']:
            item['reason']=''
        data['findings'][1].update(status='possible_concern',
            observation='Several fingers seem fused together along the lower edge.',
            location='Lower left hand',
            reason='The anatomy has an interrupted outline instead of separate digits.')
        self.assertEqual(parse_review(json.dumps(data))['findings'][1]['status'],'possible_concern')
        data['findings'][3].update(status='possible_concern',
            observation='The lighting on the arm appears different from the landscape.',
            location='Raised arm at the center',
            reason='The hand has an unnatural position for a swimming motion.')
        self.assertEqual(parse_review(json.dumps(data))['findings'][3]['status'],'unable_to_assess')

    def test_physical_impossibility_is_not_model_inability(self):
        data=fixture()
        for item in data['findings']:
            item['reason']=''
        data['findings'][1].update(status='possible_concern',
            observation='The person appears to emerge through the solid road surface.',
            location='Center-right, at the torso and road contact',
            reason='A human body cannot naturally pass through a solid asphalt road.')
        parsed=parse_review(json.dumps(data))
        self.assertEqual(parsed['findings'][1]['status'],'possible_concern')
        data['findings'][4]=dict(data['findings'][1],category='scene')
        parsed=parse_review(json.dumps(data))
        self.assertEqual(sum(f['status']=='possible_concern' for f in parsed['findings']),1)
        data['findings'][1]['reason']='Lighting casts shadows toward the opposite side of the building.'
        parsed=parse_review(json.dumps(data))
        self.assertEqual(parsed['findings'][1]['status'],'unable_to_assess')
        data['findings'][1].update(reason='The arm is in contact with the road surface, which is a plausible occlusion.')
        self.assertEqual(parse_review(json.dumps(data))['findings'][1]['status'],'unable_to_assess')

    def test_anomalies_require_location_and_distinct_reason(self):
        data = fixture()
        for item in data['findings']:
            item['reason'] = ''
        data['findings'][1].update(status='possible_concern',
            observation='Several fingers merge into one continuous shape at the fingertips.',
            location='Hand in the lower left',
            reason='Separate finger boundaries stop abruptly while the palm remains clearly outlined.')
        parsed = parse_review(json.dumps(data))
        self.assertEqual(parsed['anomaly_review_version'], 'visual-anomalies-simple-v1')
        self.assertEqual(parsed['findings'][1]['location'], 'Hand in the lower left')
        for reason in ('', 'It looks odd.', data['findings'][1]['observation'],
                       'This proves the whole image is AI-generated.'):
            bad = json.loads(json.dumps(data))
            bad['findings'][1]['reason'] = reason
            with self.assertRaises(ValueError):
                parse_review(json.dumps(bad))
        data['findings'][1].update(
            observation='The shield has a pointed bottom consistent with a standard shield design.',
            reason='The shape does not show any visible anomalies in its outline.')
        filtered = parse_review(json.dumps(data))['findings'][1]
        self.assertEqual(filtered['status'], 'unable_to_assess')
        self.assertEqual(filtered['location'], '')
        self.assertEqual(filtered['reason'], '')
        data['findings'][1].update(
            observation='The sign contains an arrow pointing toward the left side.',
            reason='The sign should point toward the right to indicate a stop.')
        self.assertEqual(parse_review(json.dumps(data))['findings'][1]['status'], 'unable_to_assess')

    def test_incomplete_refused_and_empty_completions_are_rejected(self):
        valid = {'choices': [{'finish_reason': 'stop', 'message': {'content': '{}'}}]}
        self.assertEqual(completion_text(valid), '{}')
        for reason in ('length', 'content_filter', None):
            invalid = json.loads(json.dumps(valid))
            invalid['choices'][0]['finish_reason'] = reason
            with self.assertRaises(ValueError):
                completion_text(invalid)
        for message in ({'content': ''}, {'content': None}, {'content': '{}', 'refusal': 'refused'}):
            with self.assertRaises(ValueError):
                completion_text({'choices': [{'finish_reason': 'stop', 'message': message}]})
        for envelope in ({}, {'choices': []}, {'choices': [None]}, None):
            with self.assertRaises(ValueError):
                completion_text(envelope)

    def test_named_slots_require_every_category_and_normalize_to_public_array(self):
        data = fixture()
        data['findings'] = {item['category']: {key: value for key, value in item.items() if key != 'category'}
                            for item in data['findings']}
        parsed = parse_review(json.dumps(data))
        self.assertEqual([item['category'] for item in parsed['findings']], list(CATEGORIES))
        self.assertEqual(REVIEW_SCHEMA['properties']['findings']['type'], 'object')
        self.assertEqual(REVIEW_SCHEMA['properties']['findings']['required'], list(CATEGORIES))
        self.assertFalse(REVIEW_SCHEMA['properties']['findings']['additionalProperties'])
        for mutate in [lambda x: x['findings'].pop('scene'),
                       lambda x: x['findings'].update(extra={}),
                       lambda x: x['findings']['eyes'].update(category='shape'),
                       lambda x: x['findings'].update(eyes=None)]:
            bad = json.loads(json.dumps(data))
            mutate(bad)
            with self.assertRaises(ValueError):
                parse_review(json.dumps(bad))

    def test_duplicate_eye_regression_is_rejected_not_repaired_or_hidden(self):
        data = fixture()
        data['findings'][-1] = dict(data['findings'][0])
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            parse_review(json.dumps(data))
        duplicate = json.dumps(fixture())
        # The JSON decoder also rejects duplicate object keys, independently
        # of whether the constrained model runtime obeys its schema.
        with self.assertRaisesRegex(ValueError, 'Duplicate JSON key'):
            parse_review(duplicate.replace('"image_type":', '"image_type":"logo_graphic","image_type":', 1))

    def test_structural_success_does_not_claim_accuracy(self):
        data = fixture()
        data['findings'][0].update(status='possible_concern',
            observation='Both eyes have bright yellow light extending beyond their edges.', location='Eyes on the face')
        self.assertEqual(parse_review(json.dumps(data))['findings'][0]['status'], 'possible_concern')

    def test_rejects_provenance_fragments_and_hidden_contradictions(self):
        for status, observation, location in [
            ('possible_concern', 'This proves the person is AI-generated in the image.', 'Face'),
            ('possible_concern', 'Eyes.', 'Face'),
            ('possible_concern', 'The eye has a strong yellow glow around its edge.', ''),
            ('no_clear_concern', 'The two arms merge together into one hand.', 'Hands')]:
            data = fixture()
            data['findings'][0].update(status=status, observation=observation, location=location)
            with self.assertRaises(ValueError):
                parse_review(json.dumps(data))

    def test_rejects_missing_duplicate_and_extra_fields(self):
        for mutate in [lambda x: x['findings'].pop(),
                       lambda x: x['findings'][1].update(category='eyes'),
                       lambda x: x.update(classifier_reason=True),
                       lambda x: x.update(description='This is authentic.'),
                       lambda x: x['findings'][0].update(location='x\n')]:
            data = fixture(); mutate(data)
            with self.assertRaises(ValueError):
                parse_review(json.dumps(data))
        with self.assertRaises(ValueError):
            parse_review('{"description":"a","description":"b"}')

    def test_final_test_not_selected(self):
        with self.assertRaises(ValueError):
            select_input('not-a-training-sample')
        path, sample, source = select_input()
        self.assertTrue(path.is_file())
        self.assertEqual(sample, 'project-logo')
        self.assertIsNone(source)

    def test_loopback_only_transport_and_redirect_rejection(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, size): return json.dumps({'choices': [{'finish_reason': 'stop', 'message': {'content': '{}'}}]}).encode()
        class Opener:
            def open(self, request, timeout):
                self.request = request
                assert request.full_url == 'http://127.0.0.1:5007/v1/chat/completions'
                assert request.get_header('Authorization') == 'Bearer local-test'
                body = json.loads(request.data)
                assert body['response_format']['type'] == 'json_schema'
                assert body['response_format']['json_schema']['schema']['properties']['findings']['type'] == 'object'
                assert body['model'] == 'qwen3-vl-2b-q4km-f16-review-v1'
                assert 'data:image/png;base64,' in body['messages'][0]['content'][1]['image_url']['url']
                return Response()
        with patch.dict('os.environ', {'AUTHENTISCAN_CANDIDATE_KEY': 'local-test'}), patch('urllib.request.build_opener', return_value=Opener()) as build:
            self.assertEqual(request_review(b'fixture'), '{}')
            self.assertEqual(build.call_args.args[0].proxies, {})
        with self.assertRaises(ValueError):
            NoRedirect().redirect_request(None, None, 302, None, None, 'https://example.com')

    def test_no_request_without_local_authentication(self):
        with patch.dict('os.environ', {}, clear=True), patch('urllib.request.build_opener') as build:
            with self.assertRaises(ValueError):
                request_review(b'fixture')
            build.assert_not_called()


if __name__ == '__main__':
    unittest.main()
