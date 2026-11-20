# Build from the repository root so the current locked model is included.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOME=/tmp \
    TF_NUM_INTRAOP_THREADS=2 \
    TF_NUM_INTEROP_THREADS=2 \
    AUTHENTISCAN_MODEL_PATH=/app/model/finetune.keras \
    AUTHENTISCAN_POLICY_PATH=/app/policy/policy.json

WORKDIR /app
COPY ai-runtime/loyd-v1/requirements-cloud.txt ./requirements-cloud.txt
RUN pip install --no-cache-dir --only-binary=:all: -r requirements-cloud.txt
COPY ai-runtime/loyd-v1/service ./service
COPY ai-runtime/loyd-v1/policy.manuscript-60.json ./policy/policy.json
COPY ai-work/2026-10-04/loyd-return-verified/runs/classifier-v1/finetune.keras ./model/finetune.keras
RUN mkdir -p /app/service/generated-heatmaps && chown -R 10001:10001 /app/service
USER 10001:10001

EXPOSE 5001
CMD ["uvicorn", "service.app:app", "--host", "0.0.0.0", "--port", "5001"]
