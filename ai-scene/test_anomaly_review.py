import json
import unittest
from anomaly_review import parse_anomaly_review, VERSION


def concern():
    return dict(category='scene',title='Body and surface interaction',
                observation='The person appears to be swimming through the road surface.',
                location='Lower center-right, around the torso and raised arm',
                reason='The surrounding road appears solid, but the body meets it through a water-like boundary.')


class AnomalyReviewTests(unittest.TestCase):
    def test_one_related_issue_stays_one_finding(self):
        item=concern()
        value=parse_anomaly_review(json.dumps(dict(outcome='possible_concerns',findings=[item,dict(item,category='shape')])))
        self.assertEqual(len(value['findings']),1)
        self.assertEqual(value['anomaly_review_version'],VERSION)
        self.assertEqual(value['review_outcome'],'possible_concerns')
        self.assertEqual(value['findings'][0]['location'],item['location'])

    def test_clean_and_inconclusive_are_distinct(self):
        for status in ('no_significant_anomalies','inconclusive'):
            value=parse_anomaly_review(json.dumps(dict(outcome=status,findings=[])))
            self.assertEqual(value['review_outcome'],status)
            self.assertEqual(value['findings'],[])

    def test_contradictions_do_not_manufacture_a_clean_result(self):
        item=concern()
        item['reason']='The person and the road are consistent with a natural environment.'
        value=parse_anomaly_review(json.dumps(dict(outcome='possible_concerns',findings=[item])))
        self.assertEqual(value['review_outcome'],'inconclusive')
        self.assertEqual(value['findings'],[])

    def test_provenance_claims_and_unrelated_reasons_are_withheld(self):
        for reason in ('This proves the entire image is AI-generated and manipulated.',
                       'The sun casts a long shadow behind the building.'):
            item=concern();item['reason']=reason
            value=parse_anomaly_review(json.dumps(dict(outcome='possible_concerns',findings=[item])))
            self.assertEqual(value['review_outcome'],'inconclusive')

    def test_invalid_or_missing_evidence_rejected(self):
        for value in [dict(outcome='possible_concerns',findings=[]),
                      dict(outcome='no_significant_anomalies',findings=[concern()]),
                      dict(outcome='possible_concerns',findings=[dict(concern(),location='')]),
                      dict(outcome='possible_concerns',findings=[concern()]*3)]:
            with self.assertRaises(ValueError):
                parse_anomaly_review(json.dumps(value))


if __name__=='__main__':
    unittest.main()
