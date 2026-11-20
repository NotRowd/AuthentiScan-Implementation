# AuthentiScan private VPS deployment preparation

Provider decision, 2026-11-07: Hostinger VPS. Start by reviewing KVM 4 with a
one-month billing period. This is a proposed 16 GB deployment target, not a
purchase or verified performance claim. Confirm the actual one-month total,
taxes and renewal settings before payment; promotional monthly equivalents may
require long prepaid contracts. Select VPS, not shared web hosting or a website
builder. Keep Vercel out of this deployment: Caddy serves the website on the same
VPS as the API and private AI containers. Firebase and Cloudinary remain in use;
PayMongo remains test-only. A hostname/domain and its cost still need deciding.

Prepared for a single x86-64 Ubuntu 24.04 server, initially 16 GB RAM, at least 80 GB disk. Sizing and Linux model parity are unverified until the server test. Do not choose ARM. Current Windows app is unchanged. This replaces the earlier Cloud Run deployment proposal; Google Cloud billing and local Docker/WSL are not required for a remote Linux build.

## Before spending

1. Create a cloud-provider account, check its identity/payment requirements and available monthly plans. Review the actual one-month total, IPv4, taxes and cancellation terms before creating the server. No server has been purchased by this package.
2. Use an existing domain/subdomain you control, or decide on a hostname before launch. The server needs a public hostname with DNS pointing to its IP for HTTPS. Domain charges are separate if buying a domain.
3. Rent the reviewed x86 server. Use SSH keys, install security updates and the official Docker Engine + Compose plugin for Ubuntu. Permit SSH only from the administrator's IP and public TCP 80/443; never expose 5001–5014 or 8080. Docker's published ports bypass some UFW rules, so only the web container publishes ports.

## Private setup on the server

Transfer the prepared directory privately with scp/SFTP. Model checkpoint redistribution terms remain unverified; never publish the package or weights as a public download. Keep model limitations in the UI. No frontend, output-policy or model-quality change is implied.

Create `.env` from `.env.example` and fill APP_DOMAIN and TLS_EMAIL. Create a `secrets` directory accessible only to the administrator. Add `runtime.env` from its example, the existing Firebase service-account JSON and Cloudinary credentials JSON. These are intentionally absent from the package. Runtime secrets must be provisioned securely; don't paste them in chat. The API runs as UID 1000: grant that UID read access to its JSON files without making them publicly readable. Do not mount the host Docker socket.

SMTP needs the Gmail app password itself; Windows-encrypted credentials cannot run on Linux. PayMongo accepts TEST keys only and designated Firebase UIDs only. Use the new permanent HTTPS webhook URL `/api/payments/paymongo/webhook`, subscribed to `checkout_session.payment.paid`, and save its new signing secret in runtime.env. No real charges or automatic renewal.

Verify all TRANSFER-MANIFEST.json hashes after transfer. On the server:

```sh
python3 verify-transfer.py
docker compose config --quiet
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=60
docker compose exec -T api node --input-type=module < check-services.mjs
```

Do not share logs containing credentials. `config --quiet` validates without printing interpolated secrets. Workers share the API network namespace to preserve the loopback-only API contracts. They start after the API container starts; the API waits for the classifier. Startup can briefly return 502. If the API container is recreated, run `docker compose down` then `docker compose up -d` to recreate all workers sharing its namespace.

## Required launch checks

* Add the public hostname under Firebase Authentication authorized domains. Change Firebase's custom action URL from localhost to `https://YOUR_HOST/reset-password` (applies to all email templates). Verify the existing published Firestore rules; the API refuses mismatches.
* Confirm all four service health checks, then run the same known image through Windows and Linux. Compare classifier scores/verdict, localization full-size binary mask and orientation, description/review completion, latency and peak memory. Do not claim parity until measured. The Linux visual binary uses llama.cpp b11696 commit ceefd16daa2093730bf3340315fa2b84b286ddbc; downloaded model files retain their verified hashes.
* Test registration, OTP, login, reset-password expired/used links, profile update, scan quotas, upload, saved report, PDF export, search, permanent deletion, one feedback submission, and access denial using another account.
* Test PayMongo TEST checkout with an allowlisted account: automatic confirmation after return, webhook, cancellation, repeated events and expiry. Other accounts remain Free; clearly show test-only messaging.
* Repeat on another device/network with both development PCs switched off. Check memory under concurrent requests and restore/restart behavior. Save observed results before announcing deployment complete.

No local Linux Docker build or end-to-end cloud test has been completed yet. The package includes deployment adapters, not a model accuracy improvement. Keep the current local setup for rollback. After defense, export necessary records, then delete the VPS and any separately billable disks, snapshots, backups or IPs through the provider; stopping the server alone may still incur charges. Firebase/Cloudinary data and their quotas remain separate.
