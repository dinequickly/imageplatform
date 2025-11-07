# Canvas Dump API Usage Guide

## Overview

FastAPI service that exposes endpoints to dump Canvas course content (files, folders, metadata) to local storage.

## Setup

### 1. Install Dependencies

```bash
pip install -r requirements-canvas-api.txt
```

### 2. Configure Environment

Create a `.env` file or export environment variables:

```bash
# Required: Canvas API token (stored in token.txt by default)
# token.txt should contain your Canvas API token

# Optional: API key for authentication (recommended for production)
export SUBJECTFOCUS_API_KEY="your-secret-key-here"
```

If `SUBJECTFOCUS_API_KEY` is not set, the API will run without authentication (dev mode only).

### 3. Start the Server

```bash
# Development mode with auto-reload
uvicorn appcanvas:app --reload --host 0.0.0.0 --port 8000

# Production mode
uvicorn appcanvas:app --host 0.0.0.0 --port 8000 --workers 4
```

The API will be available at `http://localhost:8000`

## API Endpoints

### Health Check

**GET** `/health`

Check API health and Canvas connection status.

```bash
curl http://localhost:8000/health
```

**Response:**
```json
{
  "ok": true,
  "user": "Your Name",
  "domain": "https://nulondon.instructure.com/api/v1/",
  "auth_required": true
}
```

---

### Blocking Dump (Wait for Completion)

**GET** `/dump?course_id={course_id}`

Downloads all course content and waits until finished. Best for small courses.

```bash
# Without auth
curl "http://localhost:8000/dump?course_id=12345"

# With auth
curl -H "X-API-Key: your-secret-key-here" \
     "http://localhost:8000/dump?course_id=12345"
```

**POST** `/dump`

Same as GET but accepts JSON body.

```bash
curl -X POST http://localhost:8000/dump \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key-here" \
  -d '{"course_id": 12345}'
```

**Response:**
```json
{
  "course_id": 12345,
  "course_name": "Introduction to Computer Science",
  "status": "completed",
  "output_dir": "/path/to/output/Introduction_to_Computer_Science"
}
```

---

### Non-Blocking Dump (Background Job)

**GET** `/dump/async?course_id={course_id}`

Starts a background job and returns immediately. Recommended for large courses.

```bash
curl -H "X-API-Key: your-secret-key-here" \
     "http://localhost:8000/dump/async?course_id=12345"
```

**POST** `/dump/async`

Same as GET but accepts JSON body.

```bash
curl -X POST http://localhost:8000/dump/async \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key-here" \
  -d '{"course_id": 12345}'
```

**Response:**
```json
{
  "accepted": true,
  "job_id": "job_12345_a1b2c3d4",
  "course_id": 12345,
  "message": "Job started. Check status at GET /status/job_12345_a1b2c3d4"
}
```

---

### Check Job Status

**GET** `/status/{job_id}`

Check the status of a background job.

```bash
curl -H "X-API-Key: your-secret-key-here" \
     "http://localhost:8000/status/job_12345_a1b2c3d4"
```

**Response (Running):**
```json
{
  "job_id": "job_12345_a1b2c3d4",
  "course_id": 12345,
  "status": "running",
  "started_at": "2025-11-06T10:30:00.123456"
}
```

**Response (Completed):**
```json
{
  "job_id": "job_12345_a1b2c3d4",
  "course_id": 12345,
  "status": "completed",
  "started_at": "2025-11-06T10:30:00.123456",
  "completed_at": "2025-11-06T10:35:23.789012",
  "result": {
    "course_id": 12345,
    "course_name": "Introduction to Computer Science",
    "status": "completed",
    "output_dir": "/path/to/output/Introduction_to_Computer_Science"
  }
}
```

**Response (Failed):**
```json
{
  "job_id": "job_12345_a1b2c3d4",
  "course_id": 12345,
  "status": "failed",
  "started_at": "2025-11-06T10:30:00.123456",
  "completed_at": "2025-11-06T10:31:45.678901",
  "error": "Course not found or access denied"
}
```

---

### List All Jobs

**GET** `/jobs`

List all jobs tracked in memory (lost on server restart).

```bash
curl -H "X-API-Key: your-secret-key-here" \
     "http://localhost:8000/jobs"
```

**Response:**
```json
{
  "jobs": [
    {
      "job_id": "job_12345_a1b2c3d4",
      "course_id": 12345,
      "status": "completed",
      "started_at": "2025-11-06T10:30:00.123456",
      "completed_at": "2025-11-06T10:35:23.789012"
    },
    {
      "job_id": "job_67890_e5f6g7h8",
      "course_id": 67890,
      "status": "running",
      "started_at": "2025-11-06T10:40:00.123456"
    }
  ]
}
```

---

## Integration Examples

### From n8n Webhook

1. **HTTP Request Node** configured as:
   - Method: `POST`
   - URL: `http://your-server:8000/dump/async`
   - Headers: `X-API-Key: your-secret-key-here`
   - Body (JSON):
     ```json
     {
       "course_id": {{ $json.course_id }}
     }
     ```

2. **Response** provides `job_id` for tracking

3. **Follow-up Polling** (optional):
   - Add a loop that polls `/status/{job_id}` every 10 seconds
   - Stop when `status` is `"completed"` or `"failed"`

### From JavaScript/Node.js

```javascript
const API_KEY = 'your-secret-key-here';
const BASE_URL = 'http://localhost:8000';

async function dumpCourse(courseId) {
  // Start async dump
  const response = await fetch(`${BASE_URL}/dump/async`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY
    },
    body: JSON.stringify({ course_id: courseId })
  });

  const data = await response.json();
  console.log('Job started:', data.job_id);

  // Poll for completion
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // wait 5s

    const statusResp = await fetch(`${BASE_URL}/status/${data.job_id}`, {
      headers: { 'X-API-Key': API_KEY }
    });

    const status = await statusResp.json();
    console.log('Status:', status.status);

    if (status.status === 'completed') {
      console.log('Dump completed!', status.result);
      break;
    } else if (status.status === 'failed') {
      console.error('Dump failed:', status.error);
      break;
    }
  }
}

dumpCourse(12345);
```

### From Python

```python
import requests
import time

API_KEY = 'your-secret-key-here'
BASE_URL = 'http://localhost:8000'

def dump_course(course_id: int):
    # Start async dump
    response = requests.post(
        f'{BASE_URL}/dump/async',
        headers={'X-API-Key': API_KEY},
        json={'course_id': course_id}
    )
    data = response.json()
    job_id = data['job_id']
    print(f'Job started: {job_id}')

    # Poll for completion
    while True:
        time.sleep(5)  # wait 5 seconds

        status_resp = requests.get(
            f'{BASE_URL}/status/{job_id}',
            headers={'X-API-Key': API_KEY}
        )
        status = status_resp.json()
        print(f"Status: {status['status']}")

        if status['status'] == 'completed':
            print(f"Dump completed! {status['result']}")
            break
        elif status['status'] == 'failed':
            print(f"Dump failed: {status.get('error')}")
            break

dump_course(12345)
```

---

## Output Structure

Downloaded files are organized as:

```
output/
└── Introduction_to_Computer_Science/
    ├── course_meta.json          # Course metadata
    ├── Syllabus/
    │   ├── folder_meta.json
    │   ├── syllabus.pdf
    │   └── syllabus.pdf.meta.json
    ├── Lectures/
    │   ├── folder_meta.json
    │   ├── Week_1/
    │   │   ├── folder_meta.json
    │   │   ├── lecture1.pdf
    │   │   └── lecture1.pdf.meta.json
    │   └── Week_2/
    │       └── ...
    └── Assignments/
        └── ...
```

Each file includes:
- The actual file (e.g., `syllabus.pdf`)
- Metadata file (e.g., `syllabus.pdf.meta.json`) with Canvas metadata
- Folder metadata (`folder_meta.json`) for each folder

---

## Security Notes

- **Never commit `token.txt` or `.env` files** to version control
- Use strong, random API keys in production (`SUBJECTFOCUS_API_KEY`)
- Run behind a reverse proxy (nginx, Caddy) with HTTPS in production
- Consider rate limiting if exposing to the public internet
- Job status is stored in-memory and lost on restart (consider Redis for persistence)

---

## Troubleshooting

### "Unauthorized - invalid API key"
- Check that `X-API-Key` header matches `SUBJECTFOCUS_API_KEY` environment variable
- Verify the key doesn't have extra whitespace or newlines

### "Course not found or access denied"
- Verify the course_id is correct
- Check that the Canvas token in `token.txt` has access to the course
- Ensure the token hasn't expired

### Job status shows "running" forever
- Check server logs for errors during the dump
- Verify disk space is available for downloads
- The job might have crashed - check `uvicorn` logs

### Files not downloading
- Check Canvas API permissions for the token
- Verify network connectivity to Canvas instance
- Check file URLs in the `.meta.json` files

---

## API Documentation

FastAPI automatically generates interactive API docs:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

Visit these URLs when the server is running to explore and test the API interactively.
