# Video Composition Feature - Integration Guide

## Overview

The video composition feature allows sponsors to overlay their branding (image + text) onto gesture videos. The system downloads original videos from Mux, applies overlays using FFmpeg, and uploads the composed video back to Mux.

## Architecture

```
┌─────────────┐      ┌─────────────┐      ┌──────────────┐      ┌─────────┐
│   Web App   │─────>│  API Server │─────>│Video Worker  │─────>│   Mux   │
│  (Client)   │      │   (oRPC)    │      │   (FFmpeg)   │      │ (Video) │
└─────────────┘      └─────────────┘      └──────────────┘      └─────────┘
                            │                     │
                            │                     │
                            ↓                     ↓
                      ┌──────────┐          ┌─────────┐
                      │  Convex  │          │  Redis  │
                      │(Database)│          │ (Queue) │
                      └──────────┘          └─────────┘
```

## Implementation Details

### 1. Video Processing Pipeline

**Location**: `apps/video-worker/src/processor.ts`

The processing pipeline consists of 5 main steps:

#### Step 1: Download Original Video (0-30% progress)
- Downloads video from Mux using playback ID
- Mux provides MP4 download at: `https://stream.mux.com/{playbackId}/high.mp4`
- Saves to temporary directory: `/tmp/video-processing/{uuid}/original.mp4`

#### Step 2: Process Overlay Image (30-40% progress)
- Downloads overlay image from Convex storage URL
- Uses Sharp to:
  - Convert any format (PNG/JPG/SVG/WebP) to PNG
  - Resize to max 400px width (maintains aspect ratio)
  - Preserve transparency
- Saves to: `/tmp/video-processing/{uuid}/overlay.png`

#### Step 3: Compose Video with FFmpeg (40-80% progress)
- Uses `fluent-ffmpeg` library
- Applies complex filter:
  ```
  [0:v][1:v]overlay=(W-w)/2:H-h-20[v1]
  [v1]drawtext=text='Sponsored by X':fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=h-40[v]
  ```
- **Overlay positioning**: Bottom-center, 20px from bottom
- **Text positioning**: Center-aligned, 40px from bottom
- **Quality settings**:
  - Codec: H.264 (libx264)
  - Preset: medium (balanced speed/quality)
  - CRF: 18 (visually lossless)
  - Audio: copy (no re-encoding)
- Saves to: `/tmp/video-processing/{uuid}/composed.mp4`

#### Step 4: Upload to Mux (80-100% progress)
- Uses Mux Direct Upload API
- Creates upload, uploads file, waits for asset to be ready
- Returns new Mux playback ID
- Original video quality is maintained

#### Step 5: Cleanup
- Deletes entire working directory `/tmp/video-processing/{uuid}`
- Runs even if processing fails (finally block)

### 2. Queue Management

**Location**: `apps/video-worker/src/queue.ts`

- **Queue System**: BullMQ + Redis
- **Concurrency**: Configurable via `VIDEO_COMPOSITION_CONCURRENCY` env var (default: 2)
- **Rate Limiting**: Max 10 jobs per minute
- **Retry Policy**: 
  - 2 attempts per job
  - Exponential backoff (5 seconds initial delay)
- **Job Retention**:
  - Completed jobs: 1 hour (max 100 jobs)
  - Failed jobs: 24 hours
- **Progress Updates**: Real-time updates at each pipeline step

### 3. API Endpoints

**Location**: `apps/video-worker/src/index.ts`

#### POST `/api/compose`
Start a new video composition job.

**Request:**
```json
{
  "playbackId": "mux_playback_id",
  "overlayImageUrl": "https://convex.dev/image.png",
  "overlayText": "Sponsored by Company X"
}
```

**Response:**
```json
{
  "success": true,
  "jobId": "123",
  "message": "Video composition job queued"
}
```

#### GET `/api/compose/status/:jobId`
Check job status and progress.

**Response:**
```json
{
  "jobId": "123",
  "state": "completed",
  "progress": 100,
  "result": {
    "success": true,
    "composedVideoPlaybackId": "new_mux_playback_id"
  }
}
```

**States**: `waiting`, `active`, `completed`, `failed`

#### GET `/api/queue/metrics`
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

### 4. API Router Integration

**Location**: `packages/api/src/routers/sponsorships.ts`

The API server provides two endpoints that proxy to the video-worker service:

- `composeVideo`: Starts a composition job
- `getCompositionStatus`: Polls job status

These use the `VIDEO_WORKER_URL` environment variable to connect to the video-worker service (default: `http://video-worker:3002` in Docker, `http://localhost:3002` locally).

## Sponsorship Flow (with Video Preview)

### Current Flow

1. **User selects gesture** and enters sponsorship details
2. **User uploads overlay image** (stored in Convex)
3. **User enters overlay text** (max 100 characters)
4. **System starts video composition** via `composeVideo` API
5. **System polls for completion** via `getCompositionStatus`
6. **User previews composed video** (using temporary Mux playback ID)
7. **User confirms and proceeds to payment**
8. **After payment confirmation**:
   - Sponsorship status → `active`
   - Gesture's playbackId → `sponsoredVideoPlaybackId`
   - Original playbackId stored as backup
9. **On expiration** (cron job):
   - Gesture's playbackId → `originalVideoPlaybackId`
   - Sponsored video deleted from Mux (cost savings)
   - Sponsorship status → `expired`

### Preview Before Payment Flow

This allows users to see the composed video before paying:

```javascript
// 1. Start composition
const { jobId } = await api.sponsorships.composeVideo({
  playbackId: gesture.playbackId,
  overlayImageUrl: uploadedImageUrl,
  overlayText: "Sponsored by Company X"
});

// 2. Poll for completion
let status;
do {
  await sleep(2000); // Poll every 2 seconds
  status = await api.sponsorships.getCompositionStatus({ jobId });
} while (status.state === 'waiting' || status.state === 'active');

// 3. Display preview
if (status.state === 'completed') {
  const composedPlaybackId = status.result.composedVideoPlaybackId;
  // Show video player with composedPlaybackId
  // User can review and confirm
}

// 4. Create sponsorship (after user confirms)
const sponsorshipId = await convex.mutation(api.sponsorships.create, {
  gestureId,
  sponsorName,
  sponsorEmail,
  overlayImageStorageId,
  overlayText,
  sponsoredVideoPlaybackId: composedPlaybackId,
  durationWeeks,
  paymentAmount,
});

// 5. Create payment
const { checkoutUrl } = await api.sponsorships.createPayment({
  sponsorshipId,
  amount: paymentAmount,
  description: `Sponsorship for ${gesture.name}`,
  redirectUrl: `${window.location.origin}/sponsors/success`,
});

// 6. Redirect to payment
window.location.href = checkoutUrl;
```

## Environment Variables

### Required for All Services

```bash
# Mux credentials (shared by server and video-worker)
MUX_TOKEN_ID=your_mux_token_id
MUX_TOKEN_SECRET=your_mux_token_secret

# Convex URL
CONVEX_URL=https://your-project.convex.cloud
```

### Video Worker Specific

```bash
# Redis connection (for queue)
REDIS_HOST=localhost
REDIS_PORT=6379

# Processing concurrency
VIDEO_COMPOSITION_CONCURRENCY=2
```

### API Server Specific

```bash
# Video worker service URL
VIDEO_WORKER_URL=http://localhost:3002  # or http://video-worker:3002 in Docker
```

## Docker Deployment

The video-worker service is included in the docker-compose stack:

```yaml
video-worker:
  build:
    context: .
    dockerfile: apps/video-worker/Dockerfile
  environment:
    - MUX_TOKEN_ID=${MUX_TOKEN_ID}
    - MUX_TOKEN_SECRET=${MUX_TOKEN_SECRET}
    - REDIS_HOST=redis-queue
    - VIDEO_COMPOSITION_CONCURRENCY=2
  volumes:
    - video-temp:/tmp/video-processing
  deploy:
    resources:
      limits:
        cpus: "2.0"
        memory: 2G
```

**Note**: The Dockerfile includes FFmpeg and required fonts for text rendering.

## Testing

### Manual Testing

1. **Start services**:
   ```bash
   # Local development
   bun run dev
   
   # Or with Docker
   docker-compose up --build
   ```

2. **Test video composition**:
   ```bash
   curl -X POST http://localhost:3002/api/compose \
     -H "Content-Type: application/json" \
     -d '{
       "playbackId": "YOUR_MUX_PLAYBACK_ID",
       "overlayImageUrl": "https://example.com/logo.png",
       "overlayText": "Sponsored by Test Company"
     }'
   ```

3. **Check job status**:
   ```bash
   curl http://localhost:3002/api/compose/status/JOB_ID
   ```

4. **View the composed video**:
   - Use the returned `composedVideoPlaybackId`
   - Play at: `https://stream.mux.com/{playbackId}.m3u8`

### Integration Testing

See the web app sponsorship flow for end-to-end testing.

## Monitoring

### Metrics Exposed

The video-worker exposes Prometheus metrics at `/metrics`:

- `http_requests_total` - Total HTTP requests
- `http_request_duration_seconds` - Request duration histogram
- `video_jobs_total` - Total video jobs by status
- `video_jobs_active` - Currently active jobs
- Plus default Node.js metrics (CPU, memory, etc.)

### Health Checks

- **Endpoint**: `GET /health`
- **Returns**: Service status, Redis connection, concurrency config
- **Used by**: Docker healthcheck, load balancers

### Logs

All processing steps are logged with `[Processor]` prefix:
- Video download progress
- Image processing details
- FFmpeg progress percentage
- Mux upload status
- Error details

## Troubleshooting

### Common Issues

#### 1. Job stays in "waiting" state
- Check Redis connection: `REDIS_HOST` and `REDIS_PORT`
- Verify worker is running: `docker-compose ps video-worker`
- Check worker logs: `docker-compose logs video-worker`

#### 2. FFmpeg composition fails
- Verify video is downloadable from Mux
- Check overlay image URL is accessible
- Ensure text doesn't contain special characters (or they're escaped)
- Check Docker container has FFmpeg: `docker exec video-worker ffmpeg -version`

#### 3. Mux upload fails
- Verify Mux credentials are correct
- Check network connectivity
- Ensure composed video file exists and is valid MP4
- Check Mux dashboard for failed uploads

#### 4. Out of memory
- Reduce `VIDEO_COMPOSITION_CONCURRENCY`
- Increase Docker memory limit
- Check for video files not being cleaned up

### Debug Mode

Enable verbose logging:
```bash
NODE_ENV=development VIDEO_COMPOSITION_CONCURRENCY=1
```

## Performance Optimization

### Current Performance

- Small video (1-2 min, 720p): ~2-3 minutes
- Medium video (5 min, 1080p): ~5-7 minutes
- Large video (10+ min, 1080p): ~10-15 minutes

### Optimization Options

1. **Increase concurrency**: Process multiple jobs in parallel
   ```bash
   VIDEO_COMPOSITION_CONCURRENCY=4
   ```

2. **GPU acceleration**: Use FFmpeg with NVIDIA/AMD GPU support
   - Requires GPU-enabled Docker image
   - Can reduce processing time by 3-5x

3. **Lower quality preset**: Trade speed for quality
   ```javascript
   // In processor.ts, change:
   "-preset medium" // current
   "-preset fast"   // 1.5x faster
   "-preset veryfast" // 2x faster
   ```

4. **Horizontal scaling**: Run multiple worker instances
   - Multiple containers connecting to same Redis queue
   - Kubernetes/Docker Swarm for orchestration

## Future Enhancements

1. **Batch processing**: Handle multiple videos simultaneously
2. **Priority queue**: VIP sponsors processed first
3. **Webhook notifications**: Notify on job completion
4. **Video preview thumbnails**: Generate preview images
5. **Custom overlay positions**: Let sponsors choose position
6. **Animation effects**: Fade in/out overlays
7. **Multiple overlays**: Support multiple sponsor logos
8. **Video templates**: Pre-designed overlay templates

## API Reference

See the [video-worker README](./apps/video-worker/README.md) for detailed API documentation.

## Support

For issues or questions:
1. Check logs: `docker-compose logs video-worker`
2. Verify queue metrics: `curl http://localhost:3002/api/queue/metrics`
3. Test with sample video first
4. Report issues with:
   - Job ID
   - Input parameters
   - Error logs
   - Video specifications
