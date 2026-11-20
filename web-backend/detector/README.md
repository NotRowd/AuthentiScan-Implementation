# Optional local object context (web)

SSDLite320 MobileNetV3 Large, TorchVision COCO_V1 weights, CPU-only. This is a lightweight **baseline**, not a custom-trained manipulation detector. It identifies common COCO object categories; it does not detect every possible object, assess authenticity, or outline edited pixels. Detection confidence is not model accuracy or calibrated authenticity probability. The official COCO box mAP is 21.3, not an expected accuracy for AuthentiScan images.

Official references:
- https://docs.pytorch.org/vision/stable/models/generated/torchvision.models.detection.ssdlite320_mobilenet_v3_large.html
- https://github.com/pytorch/vision/blob/main/LICENSE
- https://download.pytorch.org/models/ssdlite320_mobilenet_v3_large_coco-a79551df.pth

Checkpoint SHA256: `a79551df90c79834bcd3bb3845ef9d966b5449a3a9b2833ae8404778ca5d65d2`.

## Setup on another Windows PC

From the web/backend project folder with Python 3.11 available:

```powershell
py -3.11 -m venv .detector-venv
& .\.detector-venv\Scripts\python.exe -m pip install -r detector/requirements.txt --index-url https://download.pytorch.org/whl/cpu
& .\.detector-venv\Scripts\python.exe detector/setup.py
npm.cmd run start:cloud
```

The launcher starts the detector on loopback port 5003 if installed, and stops only the process it started. An existing compatible detector is reused, not killed. No subscription, card, paid API, GPU, or external image upload is used. Missing detection setup does not block the web or classifier. The classifier remains a separately started service on port 5001. Do not install detector packages in its existing TensorFlow environment.

For a separate detector terminal:

```powershell
& .\.detector-venv\Scripts\python.exe -u detector/service.py
```

The model is loaded once, with at most two CPU threads. One inference runs at a time; overload fails safely rather than queuing unbounded work. Uploaded bytes are processed in memory and not retained by the detector. Only setup downloads weights, from the official PyTorch host with hash verification. Weights, virtual environments, and test outputs must not be committed.

## User workflow and saved records

New successful scans attempt detection alongside classification. An unavailable detector does not turn a valid classification into a failed scan. Scan Details shows **Object context**, saved numbered boxes, labels, scores, and an optional visual comparison with Grad-CAM. Saved completed scans without detections can use **Identify objects**. Successful empty detections are valid results and are not silently rerun. This action never changes the classifier, Grad-CAM, or allowance.

Results live on the owned scan document in `object_detection`. No separate image asset is created. Deleting the scan therefore removes detection metadata with it. Retry inference uses a short Firestore lease and checks deletion state before saving, so it cannot recreate a deleted scan. The API accepts a scan UUID, not a client-supplied URL or another user's image path.

Coordinates are normalized `[x1,y1,x2,y2]` in raw RGB pixel orientation. EXIF auto-rotation is deliberately not applied, matching current classifier preprocessing. A protected metadata-stripped preview aligns boxes with that orientation. The optional heatmap overlay is visual context only: no object-level manipulation score, overlap measurement, or segmentation mask is calculated. The detector does **not** make Grad-CAM mathematically stronger.

## Verification

```powershell
& .\.detector-venv\Scripts\python.exe detector/test_model.py
npm.cmd test
npm.cmd run test:ui
npm.cmd run build
npm.cmd run check
```

The JavaScript suites use fixtures and local Firebase emulators, not live accounts. A real local model smoke test proves inference works, not detector accuracy. Before release, evaluate detection recall and localization quality on representative photos, artwork, and graphics. Exact manipulation localization needs separately annotated data and evaluation. Loyd's classifier checkpoint remains pending its separate evaluation; this feature does not promote it.

This does not finish fully online deployment, provider selection under the no-billing constraint, release security/performance review, or mobile integration. Pro subscriptions remain excluded.
