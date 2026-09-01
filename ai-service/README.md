# AuthentiScan AI Service

This FastAPI service wraps the team's EfficientNet-B0 Keras model and Grad-CAM utility. It is designed to run separately from the Express backend on port `5001`.

## Setup

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Before using `/predict`, confirm the training-label mapping with the AI member and set one of these in `.env`:

```text
AI_POSITIVE_LABEL=ai_generated
```

or:

```text
AI_POSITIVE_LABEL=authentic
```

The service deliberately refuses predictions until this mapping is confirmed.

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

The Express backend must not call this service until `/predict` has been tested with a real image and the label mapping is confirmed.
