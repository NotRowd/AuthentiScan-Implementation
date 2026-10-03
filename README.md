# AuthentiScan — team handoff

**Start with [TEAM-SETUP.md](TEAM-SETUP.md).** This branch contains the current
source snapshot for shared web/mobile development, not a cloud deployment.

| Folder | Role |
| --- | --- |
| `web-backend/` | Current React website + Express/Firebase backend; start here for web work |
| `mobile/` | Current Expo app; offline mode or the legacy API, not yet migrated to Firebase |
| `ai-service/` | Current Python classification and Grad-CAM service + training source |
| `legacy-backend/` | MySQL/JWT API still used by mobile |
| `legacy-web/` | Latest pre-Firebase website, retained for reference |

Root `src/`, `public/`, and root npm configuration below are the original
repository scaffold preserved from `main`. **They are not the current website.**
Run web commands inside `web-backend/`.

No private credentials, user accounts/images, database dumps, model weights or
training datasets are included. Ask Kent privately for approved model access;
use emulators for web development without cloud credentials. Do not enable billing.
Loyd's classifier-training handoff is separate and AI work remains paused.

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
