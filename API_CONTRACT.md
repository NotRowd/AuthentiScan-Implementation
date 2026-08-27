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

## Planned AI Service Contract

The backend will later send the stored image to the AI service. The AI service should return this shape:

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
