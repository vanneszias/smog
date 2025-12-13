# Video Worker Service

Handles video composition with FFmpeg and manages job queue using Redis/BullMQ.

## Purpose

This service processes video composition jobs:

1. Downloads original videos from Mux
2. Applies sponsor overlays (images + text)
3. Composes final video with FFmpeg
4. Uploads to Convex storage

## Architecture

- **Queue System**: BullMQ + Redis for job management
- **Video Processing**: FFmpeg for video composition
- **Image Processing**: Sharp for overlay image handling
- **Storage**: Convex for final video storage

## Development

```bash
# Install dependencies
bun install

# Run in development mode
bun run dev

# Build for production
bun run build

# Run production build
bun run start
```

## Environment Variables

```env
NODE_ENV=production
CONVEX_URL=your_convex_url
MUX_TOKEN_ID=your_mux_token_id
MUX_TOKEN_SECRET=your_mux_token_secret
REDIS_HOST=localhost
REDIS_PORT=6379
VIDEO_COMPOSITION_CONCURRENCY=2
```

## API Endpoints

### POST /api/compose

Start a video composition job.

**Request Body:**
```json
{
  "playbackId": "mux_playback_id",
  "overlayImageUrl": "https://convex.dev/image.png",
  "overlayText": "Sponsored by Company"
}
```

**Response:**
```json
{
  "success": true,
  "jobId": "job-1234567890",
  "message": "Video composition job queued"
}
```

### GET /api/compose/status/:jobId

Check the status of a composition job.

**Response:**
```json
{
  "jobId": "job-1234567890",
  "state": "completed",
  "progress": 100,
  "result": {
    "composedVideoUrl": "https://convex.dev/composed.mp4"
  }
}
```

### GET /api/queue/metrics

Get queue statistics.

**Response:**
```json
{
  "waiting": 5,
  "active": 2,
  "completed": 100,
  "failed": 3
}
```

### GET /health

Health check endpoint.

## Implementation Status

### ✅ Completed
- Basic service structure
- Queue setup with BullMQ
- API endpoints scaffolding
- Docker configuration
- Health checks

### 🚧 TODO
- [ ] Implement Mux video download
- [ ] Implement Sharp image processing
- [ ] Implement FFmpeg video composition
- [ ] Implement Convex upload
- [ ] Add progress tracking
- [ ] Error handling and retries
- [ ] Queue metrics implementation
- [ ] Job status tracking

## Docker Deployment

This service is automatically included in the docker-compose stack:

```bash
# Build and start all services
docker-compose up --build

# View logs
docker-compose logs -f video-worker
```

## Resource Requirements

- **CPU**: 1-2 cores (more for higher concurrency)
- **RAM**: 512MB-2GB depending on video size
- **Disk**: Temporary space for video processing
- **FFmpeg**: Full installation with codecs

## Monitoring

The service exposes metrics that can be scraped by Prometheus:

- Queue depth and processing times
- Job success/failure rates
- FFmpeg processing duration
- Redis connection status

## Future Enhancements

1. **GPU Acceleration**: Use FFmpeg with NVIDIA/AMD GPU support
2. **Horizontal Scaling**: Multiple worker instances
3. **Priority Queue**: VIP sponsor videos processed first
4. **Webhook Notifications**: Notify on job completion
5. **Video Preview**: Generate preview thumbnails
6. **Batch Processing**: Handle multiple videos simultaneously
