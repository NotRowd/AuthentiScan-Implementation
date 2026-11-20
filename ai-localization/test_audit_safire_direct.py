import unittest
import numpy as np
from audit_safire_direct import summarize


class AuditTests(unittest.TestCase):
    def setUp(self):
        self.rows=[dict(condition=c) for c in ('authentic_control','segm_flux1dev','random_flux1dev')]
        self.truth=np.zeros((3,4,4),dtype=np.uint8)
        self.truth[1:,1:3,1:3]=1

    def test_perfect_localization(self):
        groups=summarize(self.truth.astype(float),self.truth,self.rows,.5)
        self.assertEqual(groups['segm_flux1dev']['dice'],1)
        self.assertEqual(groups['authentic_control']['images_with_highlights'],0)

    def test_no_highlights_is_not_success(self):
        groups=summarize(np.zeros_like(self.truth),self.truth,self.rows,.5)
        self.assertEqual(groups['random_flux1dev']['dice'],0)
        self.assertIsNone(groups['authentic_control']['dice'])

    def test_nonfinite_rejected(self):
        with self.assertRaises(ValueError):
            summarize(np.full(self.truth.shape,np.nan),self.truth,self.rows,.5)


if __name__=='__main__':unittest.main()
