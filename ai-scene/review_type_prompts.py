"""Small offline prompt check on development examples, not an accuracy benchmark."""
from pathlib import Path
from scene_service import SceneModel,decode
if __name__=='__main__':
    model=SceneModel();root=Path(__file__).resolve().parent.parent
    prompts=[
        'Is this image a logo, a photograph, or an illustration? Answer briefly.',
        'Describe the visual style of this image. Is it a designed symbol or a camera photograph?',
        'What does this image represent? Describe it in one sentence.'
    ]
    for name,path in [('logo',root/'firebase-local/src/assets/logo.png'),('photo',root/'ai-localization/datasets/supervised-localization-v1/assets/validation/real/406129.png')]:
        for question in prompts:print(name,question,model.describe(decode(path.read_bytes()),question,35),flush=True)
