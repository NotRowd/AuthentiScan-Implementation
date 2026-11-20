import json
import unittest
from verified_review_candidate import two_pass_review

class VerifiedReviewTests(unittest.TestCase):
    def item(self):return dict(category='scene',observation='The animal appears to carry a person at the center.',location='Center of the picture',reason='Its front legs appear to act like human arms.')
    def run_review(self,decisions):
        replies=iter([json.dumps({'context':'An animal and a person are visible.','findings':[self.item()]}),json.dumps({'checks':decisions})])
        return two_pass_review(b'fixture',infer=lambda *a,**k:next(replies))
    def test_second_pass_can_withhold_without_manufacturing_normal_result(self):
        result=self.run_review([dict(index=0,decision='unsupported_or_unclear',evidence='The claimed contact is hidden behind clothing.')])
        self.assertEqual(result['accepted'],[])
        self.assertEqual(result['outcome'],'findings_not_supported')
    def test_supported_original_is_preserved(self):
        result=self.run_review([dict(index=0,decision='visible_issue',evidence='The front legs bend around the adult.')])
        self.assertEqual(result['accepted'],[self.item()])
    def test_bad_or_missing_verification_cannot_pass(self):
        for checks in [[],[dict(index=1,decision='visible_issue',evidence='A detail is visible.')],
                       [dict(index=0,decision='visible_issue',evidence='This proves it is AI-generated.')]]:
            with self.assertRaises(ValueError):self.run_review(checks)
    def test_empty_candidates_skip_second_pass(self):
        calls=[]
        def infer(*a,**k):calls.append(1);return json.dumps({'context':'A plain wall is visible.','findings':[]})
        self.assertEqual(two_pass_review(b'fixture',infer)['outcome'],'no_issue_reported')
        self.assertEqual(len(calls),1)

if __name__=='__main__':unittest.main()
