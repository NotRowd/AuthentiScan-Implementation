#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$HOME/authentiscan"
restore_visual() {
  sudo docker compose start visual >/dev/null
}
trap restore_visual EXIT HUP INT TERM
sudo docker compose stop visual
timeout --signal=TERM --kill-after=15s 900s sudo docker run --rm \
  --name authentiscan-private-vision-eval \
  --network none --memory 5g --cpus 2 --user 1000:1000 \
  --env "EVAL_LIMIT=${EVAL_LIMIT:-3}" \
  --env "MODEL_PLAN=${MODEL_PLAN:-gemma-evaluation.json}" \
  --read-only --tmpfs /tmp:rw,size=128m \
  --mount "type=bind,src=$HOME/authentiscan-private-vision-eval-20261108,dst=/eval,readonly" \
  authentiscan-visual:latest python /eval/evaluate-private-vision.py \
  | tee "$HOME/authentiscan-private-vision-eval-20261108/runtime-results.log"
