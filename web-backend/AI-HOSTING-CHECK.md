# AI hosting feasibility: initial local measurement

Measured 2026-09-23 06:09 UTC against the already running localhost:5001 service.
Model: curated-v1-candidate-v1-dev (EfficientNetB0).

| Measurement | Result |
|---|---:|
| Baseline resident working set | 315.3 MiB |
| Process lifetime peak before tests | 343.9 MiB |
| Process lifetime peak after tests | 561.8 MiB |
| Resident working set after tests | 551.1 MiB |
| Scan 1 response time | 7.741 seconds |
| Scan 2 response time | 1.948 seconds |
| Scan 3 response time | 2.151 seconds |

All three sequential requests used the same bundled hero.png, completed
classification and returned a heatmap whose downloaded PNG signature was checked.
Each heatmap was 46,716 bytes. Three local heatmap files were created and retained.
No Firebase accounts/records were changed and no account scan credits were used.

Reproduce from PowerShell 7 in this folder, with the AI service already running:

```powershell
& './scripts/benchmark-ai.ps1'
```

## Interpretation and limits

A 512 MiB host is not a safe target based on this measurement. A host with at least
1 GiB available to the AI process is a candidate to test, not a proven minimum or
guarantee. Backend memory and operating/container overhead are additional if
co-located. Windows working set is not the same metric as Linux cgroup usage.

This is not a cold-start, concurrency, maximum-image-size, memory-leak, model
accuracy or production-load test. Polling every 100 ms can miss short peaks;
the process lifetime peak also includes activity outside the sampled requests.
The first recorded request is not claimed to be the first since service startup.

Next gate: validate the unchanged model and Grad-CAM inside the intended Linux
runtime with enforced memory limits, representative large images and serialized
inference. Select an account-eligible no-payment compute host only after its
current limits are checked. Do not enable billing, create chargeable trials,
publish private images/model weights, or mark full deployment complete.
