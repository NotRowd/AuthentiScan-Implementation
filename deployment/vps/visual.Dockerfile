FROM debian:bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates cmake g++ make libssl-dev libcurl4-openssl-dev && rm -rf /var/lib/apt/lists/*
RUN git init /llama && cd /llama && git remote add origin https://github.com/ggml-org/llama.cpp.git && git fetch --depth 1 origin ceefd16daa2093730bf3340315fa2b84b286ddbc && git checkout --detach FETCH_HEAD && test "$(git rev-parse HEAD)" = ceefd16daa2093730bf3340315fa2b84b286ddbc
RUN cmake -S /llama -B /build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_SERVER=ON && cmake --build /build --target llama-server -j 2
FROM python:3.11-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 libcurl4 libssl3 && rm -rf /var/lib/apt/lists/* && pip install --no-cache-dir Pillow==12.1.0
COPY --from=builder /build/bin/llama-server /usr/local/bin/llama-server
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 HOME=/tmp
WORKDIR /app
COPY . .
USER 10001:10001
CMD ["python", "visual_linux.py"]
