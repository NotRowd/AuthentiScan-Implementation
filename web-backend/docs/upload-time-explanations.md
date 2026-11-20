# Upload-time image observations

New uploads remain `processing` until classification, optional detection/localization,
and the image description plus five-feature review have finished their attempts.
Both text results are stored with the completed scan and returned in its upload
response. The saved classifier verdict/scores are never rewritten by these models.

The scene and feature calls run sequentially because the local Qwen service shares
one CPU model and caches the parsed result for the same image. Normally the second
call reuses that inference. Responses remain model/version-checked and image-hash-bound.

`upload_review` records whether each optional review completed or was unavailable.
An unavailable review does not fail/refund a successful classification, and opening
details will not automatically start another wait. The user can explicitly retry
without another scan credit. Older scans without this marker retain lazy generation.
Existing scans are not bulk reprocessed. The original five-check review UI remains
web-only; Android receives the same saved description and processing behavior.

Transport limits: classifier 120s, scene 180s, features 300s. Upload clients wait up
to 660s, Vite proxy 690s, and the processing reservation expires after 720s if the
server was interrupted. These are ceilings, not progress estimates. Leaving the
screen does not cancel backend processing. Check History before uploading again.

Restart the existing `npm.cmd run start:cloud:mobile` terminal to load backend
changes. Keep the classifier terminal running. The scene service checks port 5005
and reuses a compatible running instance. Do not start duplicate model workers.

Tests: `npm.cmd test` includes isolated emulator checks for prepared results,
processing-state/idempotency, one-credit charging, optional failures and wrong-image
responses. `npm.cmd run test:ui` checks immediate rendering and explicit retries.
These tests do not create production scans or send images outside this PC.
