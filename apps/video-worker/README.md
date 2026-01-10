# Video Worker

Video composition service using FFmpeg and BullMQ.

## Purpose

Processes sponsor overlay videos:
1. Downloads from Mux
2. Applies overlays (image + text)
3. Composes with FFmpeg
4. Uploads to Convex

## Tech Stack

- **Queue**: BullMQ + Redis
- **Processing**: FFmpeg
- **Images**: Sharp
- **Runtime**: Bun

## Commands

```bash
bun dev            # Start dev server
bun build          # Build with tsdown
bun check-types    # Typecheck
```

## Environment

Required:
```
CONVEX_URL=
MUX_TOKEN_ID=
MUX_TOKEN_SECRET=
REDIS_HOST=
REDIS_PORT=
VIDEO_COMPOSITION_CONCURRENCY=
```

## API Endpoints

### POST /api/compose
Start composition job.

### GET /api/compose/status/:jobId
Check job status.

### GET /api/queue/metrics
Queue statistics.

### GET /health
Health check.

## Features

- Mux video download
- Sharp image processing
- FFmpeg video composition
- Progress tracking
- Queue integration
- Job status tracking

## Docker

```bash
docker-compose up --build
docker-compose logs -f video-worker
```

## Requirements

- CPU: 1-2 cores
- RAM: 512MB-2GB
- FFmpeg with codecs
