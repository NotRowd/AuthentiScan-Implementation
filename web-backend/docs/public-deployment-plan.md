# Public deployment plan — November 4, 2026

## Recommended architecture

- **Web client:** Firebase Hosting, built as static Vite assets.
- **Authenticated API and PayMongo webhook:** a Node.js Cloud Run service in the same Google Cloud project as Firebase. The app already uses Firebase Authentication, Firestore and Cloudinary, so this keeps those integrations and removes the developer PC from request handling.
- **Classifier:** a separate private Python Cloud Run service. The API calls it with service-to-service identity; browsers never call it directly. Keep the existing model, preprocessing, decision policy and Grad-CAM contract unchanged during deployment work.
- **Data:** keep Firebase Authentication and Firestore. Keep Cloudinary's authenticated media storage while its plan and usage remain suitable. Continue to store provider credentials in server-side Secret Manager, never in Vite assets.
- **Region:** choose after checking the Firestore database location and current supported service regions. Singapore is a Cloud Run option close to the Philippines, but placing compute near the existing database can reduce request latency.

## Local-only assumptions to remove behind an explicit production mode

The current local app intentionally rejects public deployment. Before deploying, add a separate production configuration while preserving local and emulator modes:

1. `src/services/firebase-api.js` rejects every hostname except localhost and 127.0.0.1.
2. `server/app.mjs` rejects browser origins other than localhost Vite origins.
3. The current startup script runs the Vite development server and API together; there is no static Hosting configuration or Cloud Run entry point.
4. `server/firebase.mjs` requires a downloaded Firebase Admin service-account JSON file. Cloud Run should use an attached least-privilege service identity instead.
5. `server/ai.mjs` permits loopback AI URLs only. Production must use authenticated private service-to-service calls and preserve the existing 120-second analysis timeout.
6. There are no Dockerfiles or Cloud Run deployment manifests in the active project folder.

Do not weaken origin checks globally. Production should use an explicit HTTPS origin allowlist, verified Firebase ID tokens, a private AI service, and non-public secrets.

## Deployment and release sequence

1. Add production mode and container entry points without changing the existing local/emulator launchers.
2. Build the frontend and deploy it to a staging Firebase Hosting site.
3. Deploy the API and private classifier to staging Cloud Run. Use a least-privilege runtime identity, private AI invocation, maximum-instance limits, request timeouts, and Secret Manager.
4. Verify sign-in, email verification, profile, scan upload, credit reservation/refund, history, image access, PDF, payment webhook endpoint and account isolation with synthetic/staging accounts while the developer PC is off.
5. Check the current PayMongo merchant approval and finish test-mode checkout/webhook delivery. Keep live keys rejected until a separately reviewed production billing change is ready.
6. Set billing budgets/alerts and inspect expected spend. Alerts are notifications rather than a guaranteed hard spending cap. Keep minimum instances at zero initially to avoid idle compute costs; measure and decide whether cold starts need a paid warm instance.
7. Only after staging acceptance, deploy production and verify the public HTTPS domain from a second account/device.

## Cost model

Cloud Run request-based services bill for active CPU, memory and requests, and can scale to zero. Actual monthly cost depends on scan count, inference duration, selected region, memory, network egress, image storage, and whether any instances are kept warm. Firebase Hosting includes no-cost quotas, but linking Google Cloud billing (Firebase Blaze) enables the Cloud Run deployment and can incur usage charges. Cloud Build, Artifact Registry, Cloudinary overages, domain registration, and PayMongo transaction fees are separate cost items. Check the Google Cloud calculator with measured scan load before production; do not treat a budget alert as a spending cap.

Current provider references (recheck at provisioning):

- [Cloud Run pricing](https://cloud.google.com/run/pricing)
- [Firebase pricing](https://firebase.google.com/pricing)
- [Firebase Hosting usage and quotas](https://firebase.google.com/docs/hosting/usage-quotas-pricing)
- [Secret Manager pricing](https://cloud.google.com/secret-manager/pricing)

## Current status

No cloud resources, billing settings, domain, or merchant settings were changed by writing this plan. The website remains local/hybrid until the production configuration and staging tests are completed. Classifier output work is outside this deployment plan and remains separate.
