#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$HOME/authentiscan"
restore_visual() { sudo docker compose start visual >/dev/null; }
trap restore_visual EXIT HUP INT TERM
sudo docker compose stop visual
timeout --signal=TERM --kill-after=15s 900s sudo docker run --rm \
 --name authentiscan-two-pass-evaluation --network none --memory 4g --cpus 2 \
 --user 1000:1000 --read-only --tmpfs /tmp:rw,size=128m \
 --env PYTHONPATH=/eval:/app \
 --mount "type=bind,src=$HOME/authentiscan-verified-eval-20261108,dst=/eval,readonly" \
 authentiscan-visual:latest python /eval/evaluate-verified-review.py \
 | tee "$HOME/authentiscan-verified-eval-20261108/results.log"
