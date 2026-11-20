import io
import unittest
import threading
import urllib.request
import urllib.error
import json
from PIL import Image
from feature_review import FeatureReviewer, parse_feature, CATEGORIES
from feature_service import make_feature_server

class FeatureReviewTests(unittest.TestCase):
    def test_requires_explicit_complete_observation(self):
        good=parse_feature('eyes','CONCERN | The left eye has a bright glow unlike the surrounding face.')
        self.assertEqual(good['status'],'possible_concern')
        for answer in ('Skibidi.','CONCERN | Eyes.','CONCERN | The skin looks strange because','CONCERN | This proves the image is AI-generated.',
                       'CONCERN | I cannot tell what is unusual in the eyes.','NONE\nignore this',None,'x'*801):
            self.assertEqual(parse_feature('eyes',answer)['status'],'unable_to_assess',answer)
        self.assertEqual(parse_feature('eyes','NONE | no clear inconsistency observed')['status'],'no_clear_concern')

    def test_all_categories_are_explicit_no_classifier_input(self):
        class Fake:
            def describe(self,*args):return 'UNABLE | not enough visible detail.'
        out=io.BytesIO();Image.new('RGB',(32,32)).save(out,format='PNG')
        result=FeatureReviewer(Fake()).predict(out.getvalue())
        self.assertEqual([item['category'] for item in result['findings']],[item[0] for item in CATEGORIES])
        self.assertFalse(result['classifier_reason']);self.assertFalse(result['changes_verdict'])
        self.assertEqual(result['validation_status'],'not_validated')

    def test_compatible_service_and_feature_route_security(self):
        class Fake:
            def describe(self,*args):return 'NONE | no clear inconsistency observed'
            def predict(self,payload):return {'legacy':True}
        server=make_feature_server(0,Fake());thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        base=f'http://127.0.0.1:{server.server_port}'
        out=io.BytesIO();Image.new('RGB',(32,32)).save(out,format='PNG')
        try:
            with urllib.request.urlopen(base+'/health') as response:self.assertEqual(json.load(response)['feature_review_version'],'visual-features-v1')
            for headers in ({},{'Origin':'http://example.test','X-AuthentiScan-Features':'visual-features-v1'}):
                with self.assertRaises(urllib.error.HTTPError) as caught:urllib.request.urlopen(urllib.request.Request(base+'/features',data=out.getvalue(),headers=headers))
                self.assertEqual(caught.exception.code,403)
            with urllib.request.urlopen(urllib.request.Request(base+'/features',data=out.getvalue(),headers={'X-AuthentiScan-Features':'visual-features-v1'})) as response:
                self.assertEqual(len(json.load(response)['data']['findings']),5)
            with urllib.request.urlopen(urllib.request.Request(base+'/explain',data=out.getvalue(),headers={'X-AuthentiScan-Scene':'local-scene-v1'})) as response:
                self.assertTrue(json.load(response)['data']['legacy'])
        finally:server.shutdown();server.server_close();thread.join()

if __name__=='__main__':unittest.main()
