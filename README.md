# AuthentiScan — team handoff

**Start with [TEAM-SETUP.md](TEAM-SETUP.md).** This branch contains the current
source snapshot for shared web/mobile development. Saving this branch does not
deploy it or merge it into `main`.

The November 20, 2026 checkpoint contains the current web/backend source and
the restored original mobile UI. The compact mobile Option B redesign was
reverted; the earlier Light/Dark/System themes remain. Android release 1.0.2
(version code 3) installs over 1.0.1. See [mobile/ANDROID-APK.md](mobile/ANDROID-APK.md)
for the signed download and build instructions.

| Folder | Role |
| --- | --- |
| `web-backend/` | Current React website + Express/Firebase backend; start here for web work |
| `mobile/` | Current Expo app; shares accounts and scans with the AWS HTTPS API |
| `ai-runtime/`, `ai-scene/`, `ai-localization/` | Supporting AI runtime, integration and test source; excludes weights, datasets and vendor environments |
| `deployment/` | Deployment templates, checks and AWS status notes; excludes prepared bundles and secrets |
| `ai-service/` | Historical Python classifier/Grad-CAM and training source |
| `legacy-backend/` | Historical MySQL/JWT API retained for reference |
| `legacy-web/` | Latest pre-Firebase website, retained for reference |

Root `src/`, `public/`, and root npm configuration below are the original
repository scaffold preserved from `main`. **They are not the current website.**
Run web commands inside `web-backend/`.

No private credentials, user accounts/images, database dumps, model weights or
training datasets are included. Ask Kent privately for approved model access;
use emulators for web development without cloud credentials. Do not enable billing.
Training data and model binaries are not part of this source checkpoint.
Temporary previews, build caches, database exports and private signing keys are
excluded. Deployment preparation scripts retain original workspace paths;
review those paths before using them in a different checkout.

Create feature branches from `team-handoff-2026-10-03` and open pull requests
back to that branch until the team reviews and merges it into `main`.

## Original scaffold notes (historical)

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
