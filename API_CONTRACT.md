# AuthentiScan Shared API Contract

This document is the agreement between the web, Android, AI, and backend members. Do not change an endpoint, field name, or response field without telling the group.

## Base URLs

| Environment | Backend URL |
| --- | --- |
| Web on the backend computer | `http://localhost:5000/api/v1` |
| Android emulator | `http://10.0.2.2:5000/api/v1` |
| Physical Android phone | `http://YOUR_COMPUTER_LAN_IP:5000/api/v1` |

For a physical phone, the phone and backend computer must use the same Wi-Fi network.

## Authentication

### Register

`POST /auth/register`

```json
{
  "firstName": "Test",
  "lastName": "User",
  "email": "test@example.com",
  "password": "AtLeast8Characters"
}
```

### Login

`POST /auth/login`

```json
{
  "email": "test@example.com",
  "password": "AtLeast8Characters"
}
```

Both endpoints return `data.token`. Web and Android must save this token and include it on protected calls:

```text
Authorization: Bearer <token>
```

### Current User and Statistics

`GET /auth/me` returns the signed-in user's account data and active plan.

`GET /users/stats` returns the signed-in user's dashboard totals:

```json
{
  "success": true,
  "data": {
    "total_scans": 4,
    "queued_scans": 4,
    "ai_generated_found": 0,
    "scans_remaining": 1,
    "plan": {
      "name": "Free",
      "scan_limit": 5,
      "billing_cycle": "free"
    }
  }
}
```

## Upload a Scan

`POST /scans`

This is a protected endpoint. Set the request body type to **form-data** and use exactly this field:

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `image` | File | Yes | JPEG, PNG, or WebP; maximum 10 MB |

Initial success response (`201 Created`):

```json
{
  "success": true,
  "message": "Image uploaded and queued for analysis.",
  "data": {
    "scan_id": 1,
    "original_file_name": "example.jpg",
    "mime_type": "image/jpeg",
    "file_size_bytes": 245100,
    "status": "queued",
    "created_at": "2026-08-26T00:00:00.000Z"
  }
}
```

Possible errors:

| Status | Meaning |
| --- | --- |
| `400` | No image, unsupported image type, or image larger than 10 MB |
| `401` | Missing, invalid, or expired login token |
| `403` | The user's plan scan limit has been reached |

## Scan History and Status

All scan endpoints below require `Authorization: Bearer <token>`. A user can only retrieve their own scans.

### List a User's Scans

`GET /scans?limit=20&offset=0`

The optional `limit` is from 1 to 100. The response contains `data.scans` and `data.pagination`.

### Get One Scan and Its Analysis State

`GET /scans/:scanId`

Before AI integration, an uploaded image returns:

```json
{
  "success": true,
  "data": {
    "scan_id": 1,
    "status": "queued",
    "analysis_status": "pending_ai_service",
    "analysis": null,
    "image_url": "/api/v1/scans/1/image"
  }
}
```

### View an Uploaded Image

`GET /scans/:scanId/image`

This returns the uploaded image itself. It is protected so another user cannot view it without owning that scan.

## Planned AI Service Contract

The backend will later send the stored image to the AI service. Until the service exists, the backend keeps the scan `queued` and returns `analysis_status: "pending_ai_service"`; it does not create fake predictions. The AI service should return this shape:

```json
{
  "verdict": "ai_generated",
  "confidence_score": 0.91,
  "authentic_score": 0.09,
  "ai_generated_score": 0.91,
  "readable_explanation": "The model found patterns associated with AI-generated imagery.",
  "model_version": "v1"
}
```

Valid `verdict` values: `authentic`, `ai_generated`, `uncertain`.
