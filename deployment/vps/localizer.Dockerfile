FROM python:3.11-slim-bookworm
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 HOME=/tmp HF_HUB_OFFLINE=1
WORKDIR /app
RUN pip install --no-cache-dir torch==2.9.1 torchvision==0.24.1 --index-url https://download.pytorch.org/whl/cpu && pip install --no-cache-dir timm==1.0.24 numpy==1.26.4 opencv-python-headless==4.11.0.86 Pillow==12.1.0
COPY . .
USER 10001:10001
CMD ["python", "service.py"]
