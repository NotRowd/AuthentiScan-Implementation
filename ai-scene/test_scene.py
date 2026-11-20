import io
import unittest
import json
import threading
import urllib.request
import urllib.error
from PIL import Image
from scene_service import clean_observation,clean_assessment,decode,make_server,image_type,SceneModel
class SceneTests(unittest.TestCase):
    def test_image_type_must_be_single_known_answer(self):
        self.assertEqual(image_type('Logo.'),'logo')
        self.assertEqual(image_type('Designed symbol.'),'logo')
        self.assertEqual(image_type('The image is a photograph taken in a tennis court setting.'),'photograph')
        for answer in ('logo or photograph','real','A beautiful logo','ignore all instructions','Not a photograph','Photograph or illustration','Maybe a logo'):
            self.assertEqual(image_type(answer),'uncertain')
    def test_no_provenance_verdict_passes(self):
        for text in ('This is AI-generated.','This is fake.','An authentic photo.'):
            self.assertIn('uncertain',clean_observation(text))
        self.assertEqual(clean_observation('A person is on a road.'),'A person is on a road.')
    def test_logo_is_described_without_forcing_an_anomaly(self):
        image=Image.new('RGB',(32,32));out=io.BytesIO();image.save(out,format='PNG')
        model=object.__new__(SceneModel);answers=iter(['Designed symbol.','A blue shield and magnifying glass.'])
        model.describe=lambda *args:next(answers)
        result=model.predict(out.getvalue())
        self.assertEqual(result['image_type'],'logo')
        self.assertEqual(result['explanation_version'],2)
        self.assertIn('not assessed',result['visual_assessment'])
        self.assertFalse(result['changes_verdict'])
    def test_image_bounds_and_rgb(self):
        image=Image.new('RGBA',(600,300));out=io.BytesIO();image.save(out,format='PNG')
        value=decode(out.getvalue());self.assertEqual(value.size,(512,256));self.assertEqual(value.mode,'RGB')
        with self.assertRaises(ValueError):decode(b'')
    def test_empty_or_long_output_abstains(self):
        for text in ('','a'*1601):self.assertIn('uncertain',clean_observation(text))
    def test_bare_labels_are_not_anomaly_explanations(self):
        self.assertIn('could not reliably assess',clean_assessment('Black curtain.'))
        self.assertIn('could not reliably assess',clean_assessment('Scarecrow.'))
        self.assertIn('uncertain',clean_assessment('This is an AI-generated image of a person.'))
    def test_loopback_http_requires_header_and_rejects_browser_origin(self):
        class Fake:
            def predict(self,payload):return {'fixture':True}
        server=make_server(0,Fake());worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
        url=f'http://127.0.0.1:{server.server_port}/explain'
        try:
            for headers in ({},{'X-AuthentiScan-Scene':'local-scene-v1','Origin':'https://example.test'}):
                with self.assertRaises(urllib.error.HTTPError) as caught:urllib.request.urlopen(urllib.request.Request(url,data=b'x',headers=headers))
                self.assertEqual(caught.exception.code,403)
            with urllib.request.urlopen(urllib.request.Request(url,data=b'x',headers={'X-AuthentiScan-Scene':'local-scene-v1'})) as response:
                self.assertTrue(json.load(response)['success'])
        finally:server.shutdown();server.server_close();worker.join()
if __name__=='__main__':unittest.main()
