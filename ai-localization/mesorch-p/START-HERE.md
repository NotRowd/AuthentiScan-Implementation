# AuthentiScan experimental localization test kit for Amel

Use this kit on a local test copy of AuthentiScan. It accepts a new image from the app's backend and returns a pixel mask for an optional **Suspected edit regions** panel. Start with that panel disabled. Preserve the existing classifier result and Grad-CAM display. This kit is for the capstone team's development testing. Its current quality decision is **fail**.

## Set up the test machine

Extract the whole ZIP. From its extracted folder, open PowerShell. Use a compatible NVIDIA GPU and CUDA-enabled PyTorch. Loyd tested Windows, Python 3.11, an RTX 2060, torch 2.6.0+cu124, torchvision 0.21.0+cu124 and timm 1.0.22. Plan for 6 GiB free system RAM and 4.5 GiB free GPU memory before startup. These figures come from the development screen. Reserve disk space for the Python environment and the 813 MB model.

Use a separate test environment on Amel's PC. If creating a fresh one, run:

```powershell
py -3.11 -m venv .venv
$py = ".\.venv\Scripts\python.exe"
& $py -m pip install torch==2.6.0 torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cu124
& $py -m pip install -r requirements.txt
& $py verify_package.py
& $py get_weights.py
& $py service.py
```

If using an existing compatible environment, set `$py` to its Python executable and start at the verifier. The explicit download command uses the authors' Google Drive. It checks size and SHA-256 before accepting the file. Manual alternative: download **mesorch_p-118.pth** from the [authors' checkpoint folder](https://drive.google.com/drive/folders/1jwYv-S3HAZqzz0YxM9bJynBiPv-O9-6x) and place it at `weights/mesorch_p-118.pth`. To reuse an existing official copy, launch `service.py --weights "E:\path\to\mesorch_p-118.pth"`. Startup verifies the digest in either case. Once the service prints its ready message, keep that terminal open.

## Try one upload

In another PowerShell window in the extracted folder:

```powershell
Invoke-RestMethod http://127.0.0.1:5014/health
& .\.venv\Scripts\python.exe try_image.py "C:\path\to\photo.jpg" ".\example-result"
```

Choose a fresh output folder each time. Read `result.json`. For an available region, open `preview.png` and `mask.png`. Orange pixels are the suspected region. The CLI writes these files only when invoked with an explicit output directory. The HTTP service processes uploads in memory.

## Connect the test app

Use the backend example in INTEGRATION.md. Keep this service in its own process. Stop it with Ctrl+C and disable the test panel to roll back. Amel owns testing against the current app checkout and its upload orientation, timeouts and UI.

## Results to explain during the defense

On the 36 previously exposed holdout images, mean Dice was **0.192 for semantic edits** and **0.299 for random edits**. Each needed 0.50. The model highlighted **7 of 12 authentic images** (allowed 1), although the mean highlighted authentic area was only 0.147%. In 13 of 24 edited images the mask missed the annotated region entirely. The slowest single-image measurement in the original 48-image RTX 2060 screen was 0.382 s after loading. New photographs and other hardware can behave differently. Independent final evaluation is pending.

Describe a highlight as a region flagged for review. An empty result is inconclusive. The experiment does not establish AI authorship. See evidence/SCREEN-04-REPORT.md for the development measurements and the constant-input limitation.
