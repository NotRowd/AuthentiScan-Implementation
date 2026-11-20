import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import time
import types
import unittest
from unittest.mock import patch
from contextlib import contextmanager
import urllib.request
from PIL import Image
from qwen_service import server_for

ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('loyd_visual_worker',ROOT/'loyd-handoff/visual_worker.py')
worker=importlib.util.module_from_spec(spec)
# Memory helper is deliberately shared unchanged with the earlier handoff.
sys.path.insert(0,str(ROOT.parent/'ai-localization'))
spec.loader.exec_module(worker)


class VisualHandoffTests(unittest.TestCase):
    def fixture(self,root):
        (root/'images').mkdir()
        cases=[]
        for i,color in enumerate(('white','red','blue','green')):
            path=root/'images'/f'{i}.png';Image.new('RGB',(16,16),color).save(path)
            cases.append(dict(sample_id=str(i),file='images/'+path.name,sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
        (root/'CASES.json').write_text(json.dumps(cases))

    def run_worker(self,invalid=False,low_memory=False):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);self.fixture(root);out=root/'result'
            real_opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
            address={};runtime_calls=[]
            @contextmanager
            def runtime(stop):
                runtime_calls.append(1)
                try:yield types.SimpleNamespace(poll=lambda:None)
                finally:stop.set()
            def server(port,model,alive):
                value=server_for(0,model,alive);address['port']=value.server_port;return value
            class Opener:
                def open(self,request,timeout):
                    if isinstance(request,str):
                        request=request.replace(':5005/',':'+str(address['port'])+'/')
                    else:
                        request=urllib.request.Request(request.full_url.replace(':5005/',':'+str(address['port'])+'/'),
                            data=request.data,headers=dict(request.header_items()),method=request.get_method())
                    return real_opener.open(request,timeout=timeout)
            class Probe:
                def __enter__(self):return self
                def __exit__(self,*args):pass
                def bind(self,address):pass
            def infer(png):
                time.sleep(.15)  # Deterministic overlap for the busy probe.
                if invalid:return 'invalid model JSON'
                return json.dumps(dict(image_type='logo_graphic',description='A plain colored square is visible.',
                    findings={c:dict(status='unable_to_assess',observation='',location='') for c in ('eyes','shape','texture','lighting','scene')}))
            with patch.object(worker,'ROOT',root),patch.object(worker,'runtime',runtime),patch.object(worker,'server_for',server),patch.object(worker,'socket',types.SimpleNamespace(socket=Probe)),patch.object(worker,'free_memory_bytes',return_value=(1 if low_memory else 8)*1024**3),patch.object(worker,'request_review',infer),patch.object(worker.urllib.request,'build_opener',return_value=Opener()),patch.object(sys,'argv',['worker','--output',str(out)]):
                if invalid or low_memory:
                    with self.assertRaises(RuntimeError):worker.main()
                else:worker.main()
            report=json.loads((out/'RESULT.json').read_text())
            self.assertFalse(report['accuracy_validated']);self.assertFalse(report['deployment_approved'])
            if low_memory:
                self.assertEqual(runtime_calls,[]);self.assertEqual(report['inference_calls'],[])
            elif invalid:
                self.assertEqual(report['stage'],'failed')
                self.assertEqual(len(report['inference_calls']),1)
                self.assertEqual(report['rows'][0]['description']['reply']['http_status'],502)
            else:
                self.assertTrue(report['completed']);self.assertEqual(len(report['inference_calls']),4)
                self.assertTrue(all(row['shared_cache_passed'] for row in report['rows']))
                self.assertEqual(report['rows'][0]['concurrent_features']['http_status'],429)
                self.assertEqual(report['browser_request']['http_status'],403)

    def test_real_adapter_cache_and_busy_protocol_with_fake_inference(self):self.run_worker()
    def test_malformed_model_reply_is_preserved_and_not_retried(self):self.run_worker(invalid=True)
    def test_low_memory_stops_before_starting_model(self):self.run_worker(low_memory=True)


if __name__=='__main__':unittest.main()
