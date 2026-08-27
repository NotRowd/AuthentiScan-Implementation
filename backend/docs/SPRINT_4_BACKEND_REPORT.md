# AuthentiScan Backend - Sprint 4 Progress Report

## Scope

Sprint 4 focuses on authenticated image upload, local image storage, upload validation, scan records, and preparation for AI prediction integration.

## Completed Work

- Added a shared `API_CONTRACT.md` for the web, Android, AI, and backend members.
- Implemented authenticated upload endpoint: `POST /api/v1/scans`.
- Requires a valid JWT Bearer token.
- Accepts one JPEG, PNG, or WebP image, up to 10 MB.
- Validates image content from the file signature instead of trusting only the filename or client-provided MIME type.
- Stores accepted images in `backend/uploads/images` using a generated unique filename.
- Saves upload metadata in MySQL `scans` with initial status `queued`.
- Enforces each user's active subscription scan limit.
- Added scan history endpoint: `GET /api/v1/scans`.
- Added scan status/details endpoint: `GET /api/v1/scans/:scanId`.
- Added protected image retrieval endpoint: `GET /api/v1/scans/:scanId/image`.
- Ensures users can access only their own scans and uploaded images.

## Verified Tests

| Test | Result |
| --- | --- |
| Existing automated API health test | Passed (1/1) |
| Invalid/unsupported upload | `400 Bad Request` |
| Valid PNG upload | `201 Created` |
| Image stored locally | Verified in `uploads/images` |
| Upload record saved in MySQL | Verified; status `queued` |
| User scan statistics | Verified; upload count and remaining scans updated |
| `GET /scans` history | `200 OK` |
| `GET /scans/1` details | `200 OK`; `queued`, `pending_ai_service` |
| `GET /scans/1/image` | `200 OK`; PNG returned |

## AI Integration Status

The backend deliberately does not create fake AI predictions. Until the AI member provides a working prediction API, uploaded scans remain:

```text
status: queued
analysis_status: pending_ai_service
```

The shared API contract defines the expected AI result fields: verdict, confidence scores, explanation, model version, and optional heatmap path. The next integration task is for the backend to call the AI service, save its response in `analysis_results`, and change the scan state to `completed` or `failed`.

## Handoff to Web and Android Members

Web and Android can now implement and test their upload interfaces against the documented endpoints. They should call the backend, not MySQL or the AI service directly.
