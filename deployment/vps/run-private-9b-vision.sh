#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$HOME/authentiscan"
restore_ai() {
  sudo docker compose start classifier localizer visual >/dev/null
}
trap restore_ai EXIT HUP INT TERM
sudo docker compose stop visual localizer classifier
timeout --signal=TERM --kill-after=15s 900s sudo docker run --rm \
  --name authentiscan-private-vision-eval \
  --network none --memory 6912m --cpus 2 --user 1000:1000 \
  --env EVAL_LIMIT=3 --env MODEL_PLAN=qwen35-9b-evaluation.json \
  --read-only --tmpfs /tmp:rw,size=128m \
  --mount "type=bind,src=$HOME/authentiscan-private-9b-eval-20261108,dst=/eval,readonly" \
  authentiscan-visual:latest python /eval/evaluate-private-vision.py \
  | tee "$HOME/authentiscan-private-9b-eval-20261108/runtime-results.log"
