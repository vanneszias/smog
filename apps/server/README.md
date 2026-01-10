# Server API

Hono-based API server with ORPC for type-safe endpoints.

## Features

- Secure video composition
- Job queue with BullMQ
- Type-safe APIs with ORPC
- Docker support

## Tech Stack

- **Framework**: Hono
- **API**: ORPC (end-to-end type-safe)
- **Runtime**: Bun
- **Queue**: BullMQ + Redis
- **Video**: FFmpeg

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
WORKOS_CLIENT_ID=
WORKOS_CLIENT_SECRET=
MOLLIE_API_KEY=
CORS_ORIGIN=
```

Optional:
```
REDIS_HOST=localhost
REDIS_PORT=6379
VIDEO_COMPOSITION_CONCURRENCY=2
```

## Development

### Prerequisites
- Bun >= 1.0
- FFmpeg installed
- Redis running

```bash
# Install FFmpeg (macOS)
brew install ffmpeg

# Start Redis
brew services start redis

# Start dev server
bun dev
```

## Docker

```bash
docker-compose up -d
docker-compose logs -f server
docker-compose down
```

## Video Composition Flow

1. Client uploads overlay to Convex
2. Client requests composition via API
3. Server adds job to Redis queue
4. Worker processes:
   - Downloads video from Mux
   - Downloads overlay from Convex
   - Composes with FFmpeg
   - Uploads to Convex
5. Client polls for completion
6. Client retrieves composed video

## API Endpoints

### POST /rpc/sponsorships/composeVideo
Start video composition job.

### POST /rpc/sponsorships/getCompositionStatus
Check job status.

## Security

- Mux URLs never exposed to client
- Rate limiting (max 10 jobs/minute)
- Job queue prevents overload (2 concurrent)
