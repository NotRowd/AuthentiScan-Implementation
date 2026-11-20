import copy
import json
import unittest
from unittest.mock import patch

from evaluate_visual_candidate import CATEGORIES, parse_review
from evidence_review_candidate import (claims_for, parse_check, apply_check,
    request_check, DESCRIPTION_UNAVAILABLE)


def review():
    findings = {key: dict(status='unable_to_assess', observation='', location='') for key in CATEGORIES}
    findings['scene'] = dict(status='possible_concern',
        observation='The arm appears to intersect the road surface.', location='Center of the road')
    findings['lighting']['status'] = 'no_clear_concern'
    return parse_review(json.dumps(dict(image_type='photograph_like', description='A person is on a road.', findings=findings)))


class EvidenceTests(unittest.TestCase):
    def test_rejection_is_inconclusive_and_does_not_change_other_checks(self):
        original = review()
        before = copy.deepcopy(original)
        for verdict in ('unsupported', 'uncertain'):
            checks = {key: dict(verdict=verdict, reason='The detail is not clear.') for key in claims_for(original)}
            result = apply_check(original, checks)
            self.assertEqual(result['description'], DESCRIPTION_UNAVAILABLE)
            self.assertEqual(result['findings'][-1]['status'], 'unable_to_assess')
            self.assertEqual(result['findings'][-1]['location'], '')
            self.assertEqual(result['findings'][:-1], original['findings'][:-1])
            self.assertEqual(original, before)

    def test_supported_claim_retains_original_not_checker_prose(self):
        original = review()
        checks = {key: dict(verdict='supported', reason='New invented observation.') for key in claims_for(original)}
        self.assertEqual(apply_check(original, checks), original)

    def test_no_concern_still_checks_description_and_cannot_invent_findings(self):
        original = review()
        original['findings'][-1].update(status='unable_to_assess', observation='', location='')
        self.assertEqual(list(claims_for(original)), ['description'])
        result = apply_check(original, {'description': dict(verdict='supported', reason='Scene is visible.')})
        self.assertEqual(result, original)

    def test_invalid_check_cannot_silently_approve_missing_claim(self):
        claims = claims_for(review())
        good = {key: dict(verdict='supported', reason='Visible.') for key in claims}
        bad = [None, {}, {**good, 'extra': good['scene']},
               {'description': good['description']},
               {**good, 'scene': dict(verdict='yes', reason='Visible.')},
               {**good, 'scene': dict(verdict='supported', reason=' ')},
               {**good, 'scene': dict(verdict='supported', reason='Hidden\ntext')},
               {**good, 'scene': dict(verdict='supported', reason='Visible.', extra=True)}]
        for item in bad:
            with self.subTest(item=item), self.assertRaises(ValueError):
                parse_check(json.dumps(item), claims)
        with self.assertRaises(ValueError):
            parse_check('{"description":{},"description":{}}', claims)

    def test_no_key_never_attempts_request(self):
        with patch.dict('os.environ', {}, clear=True), patch('urllib.request.build_opener') as opener:
            with self.assertRaises(ValueError): request_check(b'png', claims_for(review()))
            opener.assert_not_called()


if __name__ == '__main__':
    unittest.main()
