# AuthentiScan public deployment readiness

Status updated: 2026-11-07. The owner selected Hostinger VPS for the website,
Node backend and all four AI workers together. Initial target: KVM 4, 16 GB RAM,
x86-64 Ubuntu 24.04, one-month term. See deployment/vps/README.md for the active
deployment procedure. The exact checkout total, hostname, account provisioning,
Linux build and runtime acceptance checks remain pending. No purchase or public
deployment has occurred. Vercel, Hetzner and Cloud Run are earlier alternatives;
none is required for the selected approach. Existing Firebase Authentication,
Firestore and Cloudinary remain external services. PayMongo stays TEST only.
Scan-result quality and manipulation localization are tracked
separately and are not release claims made by this document.

## Earlier Cloud Run proposal (superseded)

- Firebase Hosting: built React/Vite web application, with same-origin `/api`
  rewrites to Cloud Run.
- Cloud Run: Node API as the ingress container, with the unchanged
  Python/TensorFlow classifier as a private sidecar on loopback port 5001.
- Cloud Run sidecars share an instance network namespace, so the API can keep
  its existing loopback AI URL and retrieve Grad-CAM files from the classifier
  without exposing the model service publicly.
- Firebase Authentication and Firestore: existing account and record services.
- Cloudinary authenticated media: existing private media provider, subject to
  its quota and retention limits.
- Prefer a region close to the existing Firestore database after verifying its
  location. Keep the API and classifier in the same region where possible.
- Staging first. Do not publish a public production URL until acceptance checks
  pass and the owner explicitly approves any billable provisioning.

## Audit findings

The current project is a local/hybrid development setup, not a cloud deployment:

1. `firebase-local/firebase.json` configures Firestore, Storage, and local
   emulators, but has no Firebase Hosting site or rewrite to the API.
2. `firebase-local/src/services/firebase-api.js` now permits hosted HTTPS
   origins while preserving the localhost path.
3. `firebase-local/server/app.mjs` now has an explicit production origin
   allowlist; production startup fails if it is not configured.
4. `firebase-local/scripts/serve-cloud.mjs` remains the local development
   launcher. A separate Cloud Run API entrypoint is now prepared.
5. `firebase-local/server/firebase.mjs` now selects Application Default
   Credentials in Cloud Run; local mode retains its ignored JSON credential.
6. The classifier and Node API both use loopback assumptions. A Cloud Run
   sidecar layout can preserve those. Linux image construction and startup
   resource behavior still need validation.
7. The object detector, scene reviewer, and feature reviewer are separate local
   worker processes. Decide whether to package them as private sidecars or
   clearly disable them in the first public release; do not silently point them
   at localhost without starting them.
8. Production Dockerfiles, a Cloud Run API entrypoint, and a region-specific
   Firebase Hosting rewrite are now prepared. Cloud Run itself is not deployed.
9. PayMongo configuration is TEST-only (`sk_test_`); it is not ready for live
   charges. Merchant activation and live webhook/key setup remain separate
   launch gates.
10. `firebase-local/CLOUD-SETUP.md` describes local cloud-hybrid startup and
   contains an old strict no-billing constraint. The current project direction
   is paid hosting if needed; this does not authorize enabling billing or
   provisioning resources without an agreed budget and explicit review.

## Critical path to a private staging deployment

### 1. Production-safe app mode — initial code prepared

- Emulator and local cloud-hybrid launchers remain separate.
- Production requires an explicit origin allowlist and same-origin `/api` calls.
- The production Node entrypoint binds to Cloud Run's `PORT` and `0.0.0.0`.
- Cloud Run uses Application Default Credentials, not a downloaded Admin key.
- Startup compares published Firestore rules, checks Firebase/media health, and
  waits for the private classifier's locked model health response.
- Linux build and staging validation are still required before relying on this.

### 2. Package and deploy to staging — not started

- The region-specific Firebase Hosting build/rewrite config is prepared; deploy
  it only after the named Cloud Run API service exists.
- Add separate, minimal container builds for the Node API and Python AI sidecar.
- Store PayMongo, Cloudinary, and other secrets in Secret Manager; use a service
  identity with only the required Firebase permissions.
- Start with scale-to-zero, bounded max instances, concurrency and timeouts; set
  monitoring and cost notifications before deploying.
- Do not upload private user images as deployment fixtures.

## Prepared in the repository

- `firebase-local/Dockerfile` builds the Node ingress API. It runs as the
  unprivileged Node user and reads Cloudinary credentials from a mounted
  `/secrets/cloudinary.json` secret file.
- `ai-runtime/loyd-v1/Dockerfile` packages the current checksum-locked model and
  policy in a Python 3.11 sidecar image. The sidecar runs as an unprivileged
  numeric user and writes Grad-CAM files only to its container filesystem.
- `ai-runtime/loyd-v1/requirements-cloud.txt` pins the direct Python runtime
  dependencies observed in the existing environment. Linux image construction
  and resource sizing have not been validated.
- `firebase-local/scripts/serve-production-api.mjs` runs the production Firebase
  preflight, waits for the private classifier health check, and then binds the
  API to the Cloud Run port. It does not start Vite or local worker processes.
- Cloud Run ADC is explicit in production; the local Admin SDK JSON remains
  excluded from the container build. Cloudinary's credential file path can be
  supplied with `AUTHENTISCAN_CLOUDINARY_CONFIG_PATH`.
- `firebase-local/firebase.production.json` routes the hosted web app's `/api`
  traffic to `authentiscan-api` in `us-central1`. It is separate from the local
  emulator configuration and is not deployed.

## Still required before staging

- The existing Firestore location `nam5` has been confirmed from the Firebase
  Console screenshot. `us-central1` is selected for Cloud Run and recorded in
  the separate `firebase-local/firebase.production.json`; the local emulator
  configuration remains unchanged. Cloud Run and Hosting resources are not
  created yet.
- Measure Linux/cgroup peak memory and latency for a real scan; choose Cloud Run
  CPU, memory, request concurrency, startup/liveness probes, and maximum scale
  from those measurements.
- Decide how optional object detection, scene description, and feature review
  should behave in the first hosted release. They currently expect local worker
  processes and are not included in the two prepared images.
- Configure Secret Manager versions and the dedicated runtime service account,
  including Firebase permissions and Cloudinary credentials. Do not place
  secrets in container build arguments or frontend assets.
- Add the Gmail sender address and 16-character app password as Cloud Run secret
  environment variables `AUTHENTISCAN_SMTP_USER` and
  `AUTHENTISCAN_SMTP_PASSWORD`. Local Windows still uses its existing protected
  credential helper; Cloud Run cannot use that Windows-only helper.
- Payment is still a TEST integration. Until merchant activation and live
  credentials/webhook verification are complete, publicly exposed checkout
  must stay clearly test-only or be disabled.
- Run image builds and staging acceptance after the deployment region, budget,
  identities, secrets, and runtime limits are chosen. None have been done here.

### 3. Staging acceptance with the developer PC off

- Sign in and create/read a test profile.
- Check API health and authenticated API behavior.
- Complete a scan using the unchanged current classifier and verify the current
  saved-record/media flow works across Cloud Run instance restarts.
- Check history, image access ownership, deletion, and PDF export.
- Confirm AI service is private and cross-account access is denied.
- Check cold start, memory, timeouts, and service restart behavior.
- Verify there are no secrets in frontend assets or build output.

### 4. Public launch gates

- Owner chooses a maximum monthly spend and reviews the estimate/configuration.
- Confirm backups, privacy notice, retention/deletion behavior, support contact,
  HTTPS, and custom domain.
- PayMongo merchant activation is complete; live keys and production webhook are
  configured and verified before accepting real payments. Otherwise keep payment
  disabled or clearly test-only.
- Owner approves the final production deployment after staging passes.

## Current boundary

No billing changes, cloud resources, DNS changes, live payment credentials, or
public deployment have been made. The owner accepted a low-traffic estimate of
about ₱0–₱650/month as a planning target, not a hard spending cap. The first
frontend production build completed locally on 2026-11-04. Firebase CLI login
and access to `authentiscan-bc704` were confirmed in the user's terminal.
Google Cloud CLI is installed and authenticated with that project selected.
Docker Desktop is installed on D:, but its engine cannot start because WSL
installation failed; C: had about 1 GiB free during troubleshooting.

The proposed build route is now Google Cloud Build using the prepared
Dockerfiles. Local Docker/WSL is not a deployment prerequisite for this route.
Before any build submission, prepare minimal upload contexts that exclude
credentials, private user media, training data, and unrelated model artifacts;
review build IAM, registry storage, and costs. Container builds and staging
validation remain outstanding. Cloud Build's free allowance is not a spending
cap and does not make all related storage/runtime usage free.

A read-only `gcloud billing projects describe authentiscan-bc704` check on
2026-11-05 returned `billingEnabled: false`. No billing change, cloud build,
resource provisioning, or deployment was performed during this check.

## Local build preparation — 2026-11-05

- C: cleanup recovered about 2.25 GiB of old npm/pip download caches, leaving
  about 5.51 GiB free. Build preparation stays on D:.
- `deployment/prepare-contexts.py` creates fresh, allowlisted API and classifier
  contexts under `deployment/prepared/`; it does not submit builds. It rejects
  linked input paths, verifies applicable AI lock hashes, checks for common
  embedded private-key/payment-secret patterns, and verifies copied hashes.
- Prepared snapshot: `deployment/prepared/20261105T025543064164Z`.
  API payload: 47 files / 0.70 MiB. Classifier payload: 9 files / 27.62 MiB.
  The classifier, preprocessing, policy, and Grad-CAM sources are unchanged.
- Exact `.gcloudignore` and `.dockerignore` allowlists exclude future unlisted
  files as well as existing local credentials, user media, caches, and datasets.
  `gcloud meta list-files-for-upload` matched both manifests (49 API files and
  11 classifier files including the two ignore files). Nothing was uploaded.
- Container build/startup validation and staging checks remain outstanding.
  Next external prerequisite: owner completes trial/billing signup and links
  the account to `authentiscan-bc704`; budget notifications, IAM, registry and
  build configuration must then be reviewed before provisioning.

`firebase-local/.firebaserc` now keeps `demo-authentiscan-local` as the default
for local work and defines a separate `production` alias for
`authentiscan-bc704`. Production deployment commands must still specify
`--project authentiscan-bc704` explicitly; never switch the local default.
