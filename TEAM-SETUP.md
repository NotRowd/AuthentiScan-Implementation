# Team setup

## 1. Get this version

```powershell
git clone --branch team-handoff-2026-10-03 https://github.com/NotRowd/AuthentiScan-Implementation.git
cd AuthentiScan-Implementation
git switch -c feature/your-name-your-task
```

Use Node.js 24 or newer for the current web project. Install dependencies inside
each component, not at the repository root. The examples below use PowerShell.
GitHub shares source; these commands still run services locally.

## 2. Current web: Rodel/Jayclief's web work

From the repository root:

```powershell
cd web-backend
npm.cmd ci
npm.cmd run check
npm.cmd run test:unit
npm.cmd run build
npm.cmd start
```

`npm start` uses local Firebase emulators, not production accounts. Install a
Java 21 JDK and make `java` available on PATH before starting the emulators.
The first start downloads emulator files. Open http://127.0.0.1:5174; emulator
data viewer: http://127.0.0.1:4000. Create disposable local test accounts.
The backend is port 5002. The optional separate AI service is port 5001; without
it, pages/authentication can be developed but real image analysis is unavailable.
Do not substitute fake successful results for an unavailable AI service.

Cloud mode (`npm.cmd run start:cloud`) connects to the team's LIVE Firebase and
Cloudinary services and needs authorized private credentials in `.secrets/`.
Kent must approve access and supply credentials securely, never through GitHub.
See CLOUD-SETUP.md and CLOUDINARY-SETUP.md for configuration. Do not deploy rules,
run live/cloud tests or change shared data as part of ordinary UI development.
Public Firebase web configuration in cloud-config.mjs is not an Admin private key.

## 3. Mobile work

Open a separate terminal at the repository root:

```powershell
cd mobile
npm.cmd ci
Copy-Item .env.example .env.local
npx.cmd expo start --clear
```

Do not overwrite an existing `.env.local`; edit it instead. The example defaults
to OFFLINE mode for isolated UI work. Offline results are simulations, not AI
analysis, and offline accounts do not sync to Firebase.

For real integration, the mobile app currently targets the MySQL/JWT API in
`legacy-backend/`, usually port 5000. **Do not point it at the Firebase web API
on port 5002 and expect login to work.** Mobile migration is a separate task.
Read mobile/BACKEND-INTEGRATION.md and mobile/OFFLINE-COMPATIBILITY.md; old D:
paths there describe Kent's original folders, not required clone locations.
Use your development PC's LAN address for a physical phone; 10.0.2.2 is for
Android emulators. Localhost on a phone means the phone, not your computer.
Follow mobile/AGENTS.md before changing mobile code.

## 4. Legacy backend (only for existing mobile integration)

Use a dedicated local MySQL development database, never an existing production
database. Review `legacy-backend/database/schema.sql` before importing it.
Configure your own DB values and a strong random JWT_SECRET in the ignored .env.

```powershell
cd legacy-backend
npm.cmd ci
Copy-Item .env.example .env
npm.cmd run dev
```

Copy the example only if `.env` does not already exist. Read the backend README
for schema setup. This backend is retained for compatibility, not the current
web database. Accounts are separate from Firebase accounts.

## 5. AI service (optional for UI work)

The current model and matching policy are intentionally excluded from public
GitHub. Obtain the approved pair privately from Kent. Do not train or download
datasets just to run the website. Do not use policy.example.json as if it were
the calibrated policy for the current model.

```powershell
cd ai-service
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-service.txt
$env:AUTHENTISCAN_MODEL_PATH='C:\your-private-model-folder\authentiscan-efficientnet-b0-v3.keras'
$env:AUTHENTISCAN_POLICY_PATH='C:\your-private-model-folder\policy.candidate-dev.json'
.\.venv\Scripts\python.exe -m uvicorn service.app:app --host 127.0.0.1 --port 5001
```

Use the compatible Python/runtime supplied with the model if these requirements
change. Check http://127.0.0.1:5001/health before scanning. This service does
classification and Grad-CAM, not object detection or exact manipulation masks.

## 6. Share changes safely

Keep web changes in web-backend/, mobile changes in mobile/, and coordinate
API changes across both teams. Use small feature branches and pull requests.

```powershell
git status
git add path/to/the/files-you-changed
git diff --cached
git commit -m "Describe the change"
git push -u origin feature/your-name-your-task
```

Open the pull request against team-handoff-2026-10-03, not main, until the
handoff is merged. Never force-push teammates' branches. Kent/NotRowd must invite
each teammate as a repository collaborator for push access; otherwise use forks.
Public cloning does not grant write access. Do not commit .env, .secrets,
credentials, uploads, datasets, weights, logs or dependency folders.
