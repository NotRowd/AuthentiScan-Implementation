# Local AuthentiScan AI API

This service is a local pilot wrapper only. It does not contact the AuthentiScan
backend or web application. It loads a trained EfficientNet-B0 `.keras` file,
applies an explicit calibration policy, and exposes `/health`, `/predict`, and
generated Grad-CAM heatmaps.

## Start the pilot service

From `D:\AuthentiScan-AI-Foundation\ai-service`, install once:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-service.txt
```

For the current pilot, set the model and calibration-policy paths in the same
PowerShell window, then start the service:

```powershell
$env:AUTHENTISCAN_MODEL_PATH = "D:\AuthentiScan-Training\models\pilot-v3\authentiscan-efficientnet-b0-v3.keras"
$env:AUTHENTISCAN_POLICY_PATH = "D:\AuthentiScan-AI-Foundation\ai-service\service\policy.example.json"
.\.venv\Scripts\python.exe -m uvicorn service.app:app --host 127.0.0.1 --port 5002
```

`policy.example.json` uses the pilot's validation-derived threshold `0.51` and
uncertainty margin `0.05`. A future model must receive its own calibration
report and policy file; do not reuse this policy blindly.

## Test in Postman

1. Keep the service terminal open.
2. Send `GET http://127.0.0.1:5002/health` and expect `model_loaded: true`.
3. Send `POST http://127.0.0.1:5002/predict`.
4. In **Body** choose **form-data**. Add key `image`, change its type to
   **File**, choose a JPG, PNG, or WebP under 10 MB, then send.
5. Open `http://127.0.0.1:5002` plus the returned `heatmap_path` to view the
   Grad-CAM overlay.

The API returns scores from `0` to `1`. Multiply by 100 only when displaying a
percentage in the web interface.
