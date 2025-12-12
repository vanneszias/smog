# Server Application - Video Composition System

This server handles secure video composition for sponsor overlays using FFmpeg.

## Features

- **Secure Video Processing**: Videos are processed server-side only. Client never has access to original Mux videos.
- **Job Queue System**: Uses BullMQ with Redis for robust job processing and rate limiting.
- **FFmpeg Integration**: Native FFmpeg for fast, reliable video composition.
- **Docker Support**: Fully containerized with all dependencies.

## Architecture

### Video Composition Flow

1. Client uploads overlay image to Convex storage
2. Client requests video composition via API
3. Server adds job to Redis queue
4. Worker processes job:
   - Downloads video from Mux (server-only)
   - Downloads overlay image from Convex
   - Converts SVG to PNG if needed
   - Composes video using FFmpeg
   - Uploads result to Convex storage
5. Client polls for job completion
6. Client retrieves composed video from Convex

### Security

- ✅ Mux video URLs never exposed to client
- ✅ All video processing happens server-side
- ✅ Rate limiting prevents abuse (max 10 jobs/minute)
- ✅ Job queue prevents system overload (2 concurrent jobs)

## Environment Variables

### Required

- `CONVEX_URL` - Convex deployment URL
- `MUX_TOKEN_ID` - Mux API token ID
- `MUX_TOKEN_SECRET` - Mux API token secret
- `WORKOS_CLIENT_ID` - WorkOS client ID for auth
- `WORKOS_CLIENT_SECRET` - WorkOS client secret
- `MOLLIE_API_KEY` - Mollie payment API key
- `CORS_ORIGIN` - Allowed CORS origin (e.g., https://yourdomain.com)

### Optional

- `REDIS_HOST` - Redis hostname (default: localhost)
- `REDIS_PORT` - Redis port (default: 6379)
- `VIDEO_COMPOSITION_CONCURRENCY` - Max concurrent jobs (default: 2)

## Development

### Prerequisites

- Bun >= 1.0
- FFmpeg installed locally
- Redis running locally

```bash
# Install FFmpeg (macOS)
brew install ffmpeg

# Start Redis (macOS)
brew services start redis

# Or use Docker
docker run -d -p 6379:6379 redis:7-alpine
```

### Running Locally

```bash
# Install dependencies
bun install

# Copy environment file
cp .env.example .env
# Fill in your environment variables

# Start development server
bun run dev
```

## Docker Deployment

### Using Docker Compose (Recommended)

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f server

# Stop services
docker-compose down
```

### Manual Docker Build

```bash
# Build image
docker build -t smog-server .

# Run with Redis
docker run -d --name redis redis:7-alpine
docker run -d \
  --name smog-server \
  --link redis:redis \
  -p 3000:3000 \
  -e REDIS_HOST=redis \
  -e CONVEX_URL=your_convex_url \
  -e MUX_TOKEN_ID=your_mux_token \
  -e MUX_TOKEN_SECRET=your_mux_secret \
  smog-server
```

## VPS Deployment

### Setup on Ubuntu/Debian

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
sudo apt-get update
sudo apt-get install docker-compose-plugin

# Clone repository
git clone your-repo-url
cd smog/apps/server

# Configure environment
cp .env.example .env
nano .env  # Edit with your values

# Start services
docker-compose up -d

# Setup automatic restarts
docker-compose restart server
```

### Nginx Reverse Proxy (Optional)

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Monitoring

### Check Job Queue Status

```bash
# Connect to Redis CLI
docker exec -it server-redis-1 redis-cli

# Check queue length
LLEN bull:video-composition:wait

# Check active jobs
LLEN bull:video-composition:active

# Check completed jobs
ZCARD bull:video-composition:completed

# Check failed jobs
ZCARD bull:video-composition:failed
```

### Logs

```bash
# View server logs
docker-compose logs -f server

# View Redis logs
docker-compose logs -f redis
```

## Troubleshooting

### FFmpeg Not Found

If you see "FFmpeg not found" errors:

```bash
# In Docker, FFmpeg is automatically installed
# For local development:
brew install ffmpeg  # macOS
sudo apt install ffmpeg  # Ubuntu/Debian
```

### Redis Connection Failed

```bash
# Check Redis is running
redis-cli ping  # Should return "PONG"

# In Docker
docker-compose ps  # Check redis service is up
```

### Video Composition Timeout

- Check server resources (CPU/RAM)
- Increase timeout in environment: `VIDEO_COMPOSITION_TIMEOUT=600000` (10 minutes)
- Reduce concurrency: `VIDEO_COMPOSITION_CONCURRENCY=1`

### Storage Issues

Videos are temporarily stored in `/tmp` during processing. Ensure adequate disk space:

```bash
# Check disk space
df -h /tmp

# Clean old temp files
find /tmp/video-composition-* -mtime +1 -delete
```

## Performance Tuning

### For High Traffic

```env
VIDEO_COMPOSITION_CONCURRENCY=4  # Increase if you have CPU cores
```

### For Low Resources

```env
VIDEO_COMPOSITION_CONCURRENCY=1  # Process one at a time
```

### Redis Persistence

For production, enable Redis persistence in docker-compose.yml (already configured).

## API Endpoints

### POST /rpc/sponsorships/composeVideo

Start video composition job.

**Request:**
```json
{
  "playbackId": "string",
  "overlayImageStorageId": "string",
  "overlayText": "string"
}
```

**Response:**
```json
{
  "success": true,
  "jobId": "uuid"
}
```

### POST /rpc/sponsorships/getCompositionStatus

Check job status.

**Request:**
```json
{
  "jobId": "uuid"
}
```

**Response:**
```json
{
  "state": "completed",
  "progress": 100,
  "result": {
    "success": true,
    "storageId": "convex_storage_id"
  }
}
```

## License

See main project LICENSE file.
