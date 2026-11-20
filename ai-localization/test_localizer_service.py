import hashlib
import io
import json
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError

import numpy as np
from PIL import Image

from localizer_service import MODEL,SCOPE,decode_upright,load_reviewed_policy,make_server,pack_prediction


class ServiceTests(unittest.TestCase):
    def test_image_orientation_and_alpha(self):
        image=Image.new("RGB",(4,2),"red")
        exif=Image.Exif();exif[274]=6
        stream=io.BytesIO();image.save(stream,format="JPEG",exif=exif)
        self.assertEqual(decode_upright(stream.getvalue()).size,(2,4))
        stream=io.BytesIO();Image.new("RGBA",(3,3),(0,0,0,0)).save(stream,format="PNG")
        self.assertEqual(decode_upright(stream.getvalue()).getpixel((1,1)),(255,255,255))
        stream=io.BytesIO();image.save(stream,format="GIF")
        with self.assertRaises(ValueError):decode_upright(stream.getvalue())

    def test_empty_and_diffuse_maps_abstain(self):
        for value,reason in [(0.,"no_candidate_region"),(1.,"diffuse_response")]:
            result=pack_prediction(np.full((32,32),value),.05,(32,64),"a"*64,"b"*64)
            self.assertEqual(result["status"],"uncertain")
            self.assertEqual(result["reason"],reason)
            self.assertIsNone(result["mask"])
        scores=np.zeros((32,32));scores[1,2]=.06
        result=pack_prediction(scores,.05,(32,64),"a"*64,"b"*64)
        self.assertEqual(result["status"],"available")
        self.assertEqual(sum(result["mask"]),1)
        self.assertEqual(result["mask"][34],1)
        self.assertNotIn("verdict",result)
        with self.assertRaises(ValueError):pack_prediction(np.full((32,32),np.nan),.05,(32,64),"a"*64,"b"*64)

    def test_policy_is_not_approved_by_training_or_download_alone(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);path=root/"policy.json"
            path.write_text(json.dumps({"review_status":"pending"}))
            with self.assertRaisesRegex(ValueError,"reviewed"):load_reviewed_policy(path)
            report=dict(status="research_evaluation_not_release_certification",model={"model_key":"dinov2_vits14","layers":[11]},
                        configuration={"family":"haar","strength":.2,"application":"global","replicates":1},
                        threshold=.05,test_threshold_retuning=False,split_counts={"dev":240,"test":240})
            raw=json.dumps(report).encode();(root/"results.json").write_bytes(raw)
            policy=dict(review_status="approved_for_limited_research",model_version=MODEL,scope=SCOPE,
                        evaluation_report="results.json",evaluation_sha256=hashlib.sha256(raw).hexdigest(),threshold=.05,
                        review_notes="Synthetic contract fixture only, never a real approval")
            path.write_text(json.dumps(policy))
            self.assertEqual(load_reviewed_policy(path)[0]["threshold"],.05)
            policy["threshold"]=.09;path.write_text(json.dumps(policy))
            with self.assertRaisesRegex(ValueError,"does not match"):load_reviewed_policy(path)
            (root/"results.json").write_text("{}")
            with self.assertRaisesRegex(ValueError,"checksum"):load_reviewed_policy(path)

    def test_http_defaults_unavailable_and_rejects_browser_origin(self):
        server=make_server(0)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        base=f"http://127.0.0.1:{server.server_port}"
        try:
            with urlopen(base+"/health",timeout=3) as response:
                self.assertFalse(json.load(response)["model_loaded"])
            req=Request(base+"/localize",data=b"image",headers={"X-AuthentiScan-Localizer":"localization-v1"})
            with urlopen(req,timeout=3) as response:
                self.assertEqual(json.load(response)["data"]["reason"],"candidate_not_approved")
            req.add_header("Origin","https://example.com")
            with self.assertRaises(HTTPError) as caught:urlopen(req,timeout=3)
            self.assertEqual(caught.exception.code,403)
        finally:
            server.shutdown();server.server_close();thread.join(3)


if __name__=="__main__":unittest.main()
