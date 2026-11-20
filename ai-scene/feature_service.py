"""Compatible scene server plus a separately versioned offline feature review."""
import argparse
import threading
from scene_service import SceneModel, make_server, MODEL_ID, EXPLANATION_VERSION
from feature_review import FeatureReviewer, REVIEW_VERSION

def make_feature_server(port, model):
    inference_lock=threading.Lock()
    class GuardedScene:
        def predict(self, payload):
            if not inference_lock.acquire(blocking=False):
                raise RuntimeError('Local visual model is busy')
            try:
                return model.predict(payload)
            finally:
                inference_lock.release()
    server=make_server(port,GuardedScene())
    parent=server.RequestHandlerClass
    reviewer=FeatureReviewer(model)
    class Handler(parent):
        def do_GET(self):
            if self.path!='/health':
                return super().do_GET()
            self.reply(200,dict(service='authentiscan-scene',model_loaded=True,
                model_version=MODEL_ID,explanation_version=EXPLANATION_VERSION,feature_review_version=REVIEW_VERSION))

        def do_POST(self):
            if self.path!='/features':
                return super().do_POST()
            if self.headers.get('Origin') or self.headers.get('X-AuthentiScan-Features')!=REVIEW_VERSION:
                return self.reply(403,{})
            try:
                size=int(self.headers.get('Content-Length','0'))
            except ValueError:
                return self.reply(400,{})
            if self.headers.get('Transfer-Encoding') or not 0<size<=10*1024*1024:
                return self.reply(413,{})
            if not inference_lock.acquire(blocking=False):
                return self.reply(429,{'message':'Local visual model is busy'})
            try:
                self.connection.settimeout(20)
                payload=self.rfile.read(size)
                if len(payload)!=size:
                    return self.reply(400,{})
                self.reply(200,dict(success=True,data=reviewer.predict(payload)))
            except Exception:
                self.reply(503,dict(success=False,message='Feature review unavailable'))
            finally:
                inference_lock.release()
    server.RequestHandlerClass=Handler
    return server

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=5005)
    args=parser.parse_args()
    model=SceneModel()
    print('Local scene and visual-feature review ready. Observations are not classifier reasons or verified edits.',flush=True)
    make_feature_server(args.port,model).serve_forever()
