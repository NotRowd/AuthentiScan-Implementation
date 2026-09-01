# AuthentiScan AI Service

This FastAPI service wraps the team's EfficientNet-B0 Keras model and Grad-CAM utility. It is designed to run separately from the Express backend on port `5001`.

## Setup

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```

The team training notebook confirmed the binary class mapping: `fake = 0` and
`real = 1`. Therefore set this local value in `.env`:

```text
AI_POSITIVE_LABEL=authentic
```

The service deliberately refuses predictions when this value is absent or invalid.

## Run

```powershell
.\.venv\Scripts\python.exe -m uvicorn app:app --port 5001 --reload
```

Open `http://127.0.0.1:5001/docs` for interactive API documentation.

## Endpoints

- `GET /health` — confirms the model loaded and whether the label mapping is configured.
- `POST /predict` — accepts one `image` file (`JPEG`, `PNG`, or `WebP`, maximum 10 MB) and returns the AuthentiScan AI-result fields plus a Grad-CAM heatmap path.

## Verification

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests
```

The Express backend calls this service when `AI_SERVICE_URL` is configured. Keep the AI service running on port `5001` during local end-to-end testing.

## Evaluate the model before claiming accuracy

The class mapping is confirmed, but the model's real accuracy still needs independent testing. Use at least 10 known authentic camera images and 10 known AI-generated images that were **not** used during training. Place them locally in two folders (the `calibration/` folder is ignored by Git), then run:

```powershell
.\.venv\Scripts\python.exe .\evaluate_model.py `
  --authentic-dir .\calibration\authentic `
  --ai-generated-dir .\calibration\ai_generated `
  --uncertainty-margin 0.05 `
  --report .\evaluation-report.json
```

The report includes overall accuracy, decisive accuracy, uncertainty coverage, false AI-generated results, missed AI-generated results, and every tested image score. Keep it as adviser evidence. Do not claim the model is accurate until this report uses an independently labelled dataset.
