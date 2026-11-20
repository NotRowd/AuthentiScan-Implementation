# Earlier deployment alternative: Vercel website (superseded)

Superseded 2026-11-07: the owner selected Hostinger VPS for website, backend and
AI together. See ../vps/README.md. The notes below are retained for reference;
do not use them as the active launch instructions.

Updated 2026-11-06 at the owner's request. Hetzner is no longer the selected provider. No purchase, account change or deployment has occurred.

## Components

| Component | Hosting decision |
| --- | --- |
| React/Vite website | Vercel |
| Auth and records | Existing Firebase Authentication and Firestore |
| Protected image files | Existing Cloudinary account |
| Node API and classifier/localization/visual/object workers | Cloud host still to be selected and tested |
| Subscription checkout | PayMongo TEST only; explicit no-real-charge messaging and designated test UIDs |

The current working app expects same-origin `/api` requests and private loopback connections between its API and AI workers. Selecting Vercel for the website does not make the current Docker Compose stack runnable on Vercel unchanged. Its existing VPS package remains a provider-independent backend option.

Vercel now also documents Services and public-beta Daemons. Earlier blanket statements that Vercel cannot run persistent processes were too broad. These capabilities do not establish that our HTTP AI workers, memory requirements and existing private network contracts fit the platform. A Vercel-only migration requires a separate feasibility check and measured costs; do not promise it is supported or included in the $20 Pro base price.

## Sequence

1. Create the Vercel account and review Hobby eligibility for this noncommercial capstone, or Pro pricing and usage controls. Do not activate a paid plan merely to start preparation.
2. Prepare a frontend-only transfer folder with package files, index.html, Vite/Tailwind/PostCSS config, src, shared and public assets. Never upload the whole backend workspace, `.secrets`, Python environments, datasets or model weights to the frontend project. Do not put service-account JSON, Gmail app passwords, Cloudinary secrets or PayMongo secret keys into VITE variables.
3. Use the Vite preset, Node 24, `npm ci` install, `npm run build`, and `dist` output. The source application lives in `firebase-local`; an isolated frontend folder is preferred over uploading unrelated backend files.
4. Select and test cloud hosting for the API and all four AI workers, preserving Firebase ownership checks, test-payment restrictions and model provenance. Keep both PCs out of the production request path. Compare any Vercel-only redesign against the already prepared Linux backend package before committing time or money.
5. Once the backend has a stable HTTPS address, configure an external `/api/:path*` rewrite to it, before the SPA fallback to `/index.html`. Review proxy request-size and timeout limits with the app's 10 MB images and slow visual review. Do not mark the app usable if `/api/config`, uploads or reviews fail through the proxy. If proxy limits do not fit, explicitly implement and test an authenticated direct API route with exact-origin CORS rather than silently reducing upload support.
6. Configure the exact stable Vercel production origin in AUTHENTISCAN_ALLOWED_ORIGINS and AUTHENTISCAN_CHECKOUT_ORIGIN. Add the website hostname to Firebase Auth's authorized domains. Set the Firebase custom email action URL to `https://WEBSITE/reset-password`. Preview origins are not automatically authorized.
7. Create the permanent PayMongo TEST webhook at the selected backend's HTTPS `/api/payments/paymongo/webhook` endpoint and securely configure its signing secret. Keep payment callbacks pointed at the production website. Do not enable live billing.
8. Run the full account, upload, report, localization, visual review, PDF, history, deletion, feedback, quota, privacy and test-checkout checks from another device while both PCs are off. Verify failed AI services produce honest errors and never grant Pro from a browser redirect alone.
9. Record the final URLs, measured speed/memory, provider charges and rollback steps. After defense, remove separately billable resources and paid plans through each provider; retain required records privately.

## Cost status

Vercel Hobby may be free if the project meets its personal/noncommercial terms. Pro starts at $20/month with usage charges possible. Backend/AI compute and any purchased domain are additional unless a validated Vercel-only setup replaces the separate backend host. No final all-system monthly quote is established yet.

## Official references

- https://vercel.com/docs/frameworks/frontend/vite
- https://vercel.com/docs/routing/rewrites
- https://vercel.com/docs/services
- https://vercel.com/docs/daemons
- https://vercel.com/docs/functions/limitations
- https://vercel.com/pricing
- https://vercel.com/docs/plans/hobby
