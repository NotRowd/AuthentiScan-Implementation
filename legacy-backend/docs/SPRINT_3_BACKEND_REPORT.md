# AuthentiScan Backend - Sprint 3 Progress Report

## Scope

Sprint 3 establishes the backend foundation, relational database, and core user authentication workflow for AuthentiScan.

## Completed Work

- Created the Express API project structure and local environment template.
- Configured a MySQL connection pool for `authentiscan_db`.
- Created the database schema and seeded Free and Premium subscription plans.
- Implemented registration with bcrypt password hashing and automatic Free-plan assignment.
- Implemented login with JWT token generation.
- Implemented protected profile retrieval through `GET /api/v1/auth/me`.
- Implemented protected initial dashboard statistics through `GET /api/v1/users/stats`.

## Database Tables

`users`, `subscription_plans`, `user_subscriptions`, `payments`, `scans`, `analysis_results`, and `feedback`.

## API Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/v1/health` | API health check |
| GET | `/api/v1/database/health` | MySQL connection check |
| POST | `/api/v1/auth/register` | Register a user and assign the Free plan |
| POST | `/api/v1/auth/login` | Authenticate a user and return a JWT |
| GET | `/api/v1/auth/me` | Return the authenticated user's profile and plan |
| GET | `/api/v1/users/stats` | Return initial scan statistics for the authenticated user |

## Verification Evidence

- Automated baseline test: `npm.cmd test` passed (1/1).
- MySQL health endpoint returned `200 OK`.
- Registration returned `201 Created`.
- Login returned `200 OK`.
- Protected profile returned `200 OK` with a Bearer token and `401 Unauthorized` without one.
- Protected statistics returned `200 OK` with zero scans and five remaining Free-plan scans.

## Deferred to Later Sprints

Image upload, scan processing, EfficientNet-B0 integration, Grad-CAM output, scan history, reports, feedback submission, subscription checkout, and payment-webhook processing.
