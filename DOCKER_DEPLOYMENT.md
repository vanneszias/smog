# Docker Deployment Guide

Complete guide for deploying the Smog application using Docker Compose on both local development and production VPS.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Local Development Setup](#local-development-setup)
- [Production VPS Deployment](#production-vps-deployment)
- [Service Configuration](#service-configuration)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)
- [Maintenance](#maintenance)

---

## Architecture Overview

### Services

The application consists of the following Docker services:

1. **web** - React frontend served by Caddy (reverse proxy + static files)
2. **server** - Bun/Hono API server with authentication and payments
3. **video-worker** - FFmpeg-powered video composition service
4. **redis-session** - Redis for session storage
5. **redis-queue** - Redis for video job queue (BullMQ)
6. **prometheus** - Metrics collection
7. **grafana** - Metrics visualization
8. **node-exporter** - System metrics
9. **redis-exporter** - Redis metrics

### Network Architecture

```
Internet → Port 80/443 (Caddy)
                ├── /api → server:3000
                ├── /rpc → server:3000
                ├── /auth → server:3000
                └── /* → Static React App

server:3000 → video-worker:3002 (internal)
              → redis-session:6379 (internal)

video-worker:3002 → redis-queue:6379 (internal)
```

---

## Prerequisites

### For Local Development

- **Docker**: Version 20.10 or higher (with BuildKit support)
- **Docker Compose**: Version 2.0 or higher
- **Bun**: Version 1.0 or higher (for local testing outside Docker)
- **Git**: For cloning the repository

> **Note**: This project uses Docker BuildKit for optimized builds. BuildKit is included by default in Docker 19.03+.
> It provides 10-20x faster rebuilds through intelligent caching.

### For Production VPS

- **VPS Server**: 
  - Minimum: 2 CPU cores, 4GB RAM, 20GB storage
  - Recommended: 4 CPU cores, 8GB RAM, 50GB storage
- **OS**: Ubuntu 22.04 LTS or Debian 11+ (recommended)
- **Domain Name**: Optional but recommended for SSL
- **Docker & Docker Compose**: Will be installed during setup

---

## Local Development Setup

### Step 1: Clone Repository

```bash
git clone <your-repository-url>
cd smog
```

### Step 2: Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit the .env file with your credentials
nano .env  # or use your preferred editor
```

Required environment variables for development:

```env
# API Server
WORKOS_CLIENT_ID=your_workos_client_id
WORKOS_CLIENT_SECRET=your_workos_client_secret
MOLLIE_API_KEY=your_mollie_api_key
CORS_ORIGIN=http://localhost
CONVEX_URL=https://your-project.convex.cloud
MUX_TOKEN_ID=your_mux_token_id
MUX_TOKEN_SECRET=your_mux_token_secret

# Web App (build-time)
VITE_SERVER_URL=http://localhost:3000
VITE_WORKOS_CLIENT_ID=your_workos_client_id
VITE_WORKOS_REDIRECT_URI=http://localhost/auth/callback
VITE_CONVEX_URL=https://your-project.convex.cloud

# Video Worker
VIDEO_COMPOSITION_CONCURRENCY=2

# Monitoring
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=admin
```

### Step 3: Start Development Environment

**Option A: Using the optimized build script (Recommended)**

```bash
# Build with BuildKit optimizations
./docker-build.sh

# Start all services
docker compose up

# Or run in background
docker compose up -d
```

**Option B: Manual build with BuildKit**

```bash
# Enable BuildKit explicitly
export DOCKER_BUILDKIT=1

# Build and start services
docker compose up --build

# Or run in background
docker compose up -d
```

**Option C: Without BuildKit (slower, not recommended)**

```bash
# Start all services in development mode
docker compose up --build

# Or run in background
docker compose up -d
```

**Performance Notes:**
- First build: ~2-3 minutes (with BuildKit)
- Subsequent builds: ~10-30 seconds (with BuildKit cache)
- Without BuildKit: ~5-7 minutes every time

### Viewing Logs

```bash
# View logs for all services
docker compose logs -f

# View logs for specific service
docker compose logs -f video-worker
```

### Step 4: Access Services

- **Web Application**: http://localhost
- **API Server**: http://localhost:3000
- **Video Worker**: http://localhost:3002
- **Grafana**: http://localhost:3001 (admin/admin)
- **Prometheus**: http://localhost:9090

### Step 5: Stop Services

```bash
# Stop all services
docker-compose -f docker-compose.yml -f docker-compose.dev.yml down

# Stop and remove volumes (clean slate)
docker-compose -f docker-compose.yml -f docker-compose.dev.yml down -v
```

---

## Production VPS Deployment

### Step 1: Prepare VPS

SSH into your VPS:

```bash
ssh root@your-vps-ip
```

Update system packages:

```bash
apt update && apt upgrade -y
```

### Step 2: Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Add current user to docker group (optional, for non-root)
usermod -aG docker $USER

# Start Docker service
systemctl enable docker
systemctl start docker

# Verify installation
docker --version
docker-compose --version
```

### Step 3: Install Git and Clone Repository

```bash
apt install -y git

# Clone your repository
git clone <your-repository-url> /opt/smog
cd /opt/smog
```

### Step 4: Configure Production Environment

```bash
# Copy environment template
cp .env.example .env

# Edit with production values
nano .env
```

Production environment variables:

```env
# API Server
WORKOS_CLIENT_ID=prod_workos_client_id
WORKOS_CLIENT_SECRET=prod_workos_client_secret
MOLLIE_API_KEY=live_mollie_api_key
CORS_ORIGIN=https://yourdomain.com
CONVEX_URL=https://your-prod-project.convex.cloud
MUX_TOKEN_ID=prod_mux_token_id
MUX_TOKEN_SECRET=prod_mux_token_secret

# Web App
VITE_SERVER_URL=https://yourdomain.com
VITE_WORKOS_CLIENT_ID=prod_workos_client_id
VITE_WORKOS_REDIRECT_URI=https://yourdomain.com/auth/callback
VITE_CONVEX_URL=https://your-prod-project.convex.cloud

# Video Worker
VIDEO_COMPOSITION_CONCURRENCY=2

# Monitoring
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=<strong-password>
```

### Step 5: Configure Domain and SSL

If you have a domain, edit the Caddyfile:

```bash
nano apps/web/Caddyfile
```

Uncomment and configure the HTTPS section:

```caddyfile
yourdomain.com {
    reverse_proxy /api/* server:3000
    reverse_proxy /rpc/* server:3000
    reverse_proxy /auth/* server:3000
    reverse_proxy /webhooks/* server:3000
    
    root * /srv
    encode gzip
    try_files {path} /index.html
    file_server
}
```

Caddy will automatically provision SSL certificates from Let's Encrypt!

### Step 6: Build and Start Services

**Option A: Using the optimized build script (Recommended)**

```bash
# Build with BuildKit optimizations (faster)
./docker-build.sh

# Start all services in production mode
docker compose up -d

# View logs
docker compose logs -f

# Check service status
docker compose ps
```

**Option B: Manual build**

```bash
# Enable BuildKit for faster builds
export DOCKER_BUILDKIT=1

# Build images (first time or after code changes)
docker compose build

# Start all services
docker compose up -d

# View logs
docker compose logs -f

# Check service status
docker compose ps
```

**Build Performance:**
- With BuildKit (first build): ~2-3 minutes
- With BuildKit (subsequent builds): ~10-30 seconds  
- Without BuildKit: ~5-7 minutes every time

The BuildKit cache persists across builds, making deployments and updates much faster.

### Step 7: Verify Deployment

```bash
# Check all services are running
docker-compose ps

# Test web application
curl http://localhost

# Test API server
curl http://localhost:3000

# Test video worker
curl http://localhost:3002/health
```

### Step 8: Configure Firewall

```bash
# Install UFW if not already installed
apt install -y ufw

# Allow SSH (important - do this first!)
ufw allow 22/tcp

# Allow HTTP and HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Enable firewall
ufw enable

# Check status
ufw status
```

---

## Service Configuration

### Scaling Video Workers

To handle more concurrent video processing:

```env
# In .env file
VIDEO_COMPOSITION_CONCURRENCY=4
```

Then restart the video-worker service:

```bash
docker-compose restart video-worker
```

### Resource Limits

Edit `docker-compose.yml` to adjust resource limits:

```yaml
video-worker:
  deploy:
    resources:
      limits:
        cpus: '4.0'      # Increase for more processing power
        memory: 4G       # Increase for larger videos
      reservations:
        cpus: '1.0'
        memory: 1G
```

### Redis Persistence

Both Redis instances are configured with AOF (Append-Only File) persistence:

```bash
# View Redis session data
docker exec -it smog-redis-session-1 redis-cli

# View Redis queue data
docker exec -it smog-redis-queue-1 redis-cli

# Check persistence status
> INFO persistence
```

---

## Monitoring

### Access Grafana Dashboard

1. Navigate to `http://your-vps-ip:3001`
2. Login with credentials from `.env` (default: admin/admin)
3. Add dashboards from Grafana templates or create custom ones

### Prometheus Metrics

Access Prometheus UI at `http://your-vps-ip:9090`

Available metrics:
- System metrics (CPU, RAM, disk) via node-exporter
- Redis metrics via redis-exporter
- Application metrics (if implemented in services)

### Viewing Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f video-worker

# Last 100 lines
docker-compose logs --tail=100 server

# Follow logs with timestamps
docker-compose logs -f -t
```

---

## Troubleshooting

### Service Won't Start

```bash
# Check service status
docker-compose ps

# Check logs for errors
docker-compose logs <service-name>

# Restart specific service
docker-compose restart <service-name>

# Rebuild if code changed
docker-compose build <service-name>
docker-compose up -d <service-name>
```

### Out of Disk Space

```bash
# Check disk usage
df -h

# Clean up Docker resources
docker system prune -a

# Remove unused volumes
docker volume prune

# Remove old images
docker image prune -a
```

### Redis Connection Issues

```bash
# Check Redis is running
docker-compose ps redis-session redis-queue

# Test Redis connection
docker exec -it smog-redis-session-1 redis-cli ping
# Should return: PONG

# Check Redis logs
docker-compose logs redis-session
docker-compose logs redis-queue
```

### Video Processing Failures

```bash
# Check video worker logs
docker-compose logs -f video-worker

# Check queue status
docker exec -it smog-redis-queue-1 redis-cli
> LLEN bull:video-composition:wait
> LLEN bull:video-composition:active
> ZCARD bull:video-composition:failed

# Restart video worker
docker-compose restart video-worker
```

### SSL Certificate Issues (Caddy)

```bash
# Check Caddy logs
docker-compose logs web

# Force certificate renewal (if needed)
docker exec -it smog-web-1 caddy reload --config /etc/caddy/Caddyfile

# Verify domain points to your server
dig yourdomain.com
```

---

## Maintenance

### Updating the Application

```bash
cd /opt/smog

# Pull latest changes
git pull origin main

# Rebuild and restart services
docker-compose build
docker-compose up -d

# Check logs for issues
docker-compose logs -f
```

### Backup

#### Backup Redis Data

```bash
# Backup session data
docker exec smog-redis-session-1 redis-cli BGSAVE
docker cp smog-redis-session-1:/data/dump.rdb ./backup/redis-session-$(date +%Y%m%d).rdb

# Backup queue data
docker exec smog-redis-queue-1 redis-cli BGSAVE
docker cp smog-redis-queue-1:/data/dump.rdb ./backup/redis-queue-$(date +%Y%m%d).rdb
```

#### Backup Volumes

```bash
# Create backup directory
mkdir -p /backup/smog

# Backup all volumes
docker run --rm \
  -v smog_redis-session-data:/data \
  -v /backup/smog:/backup \
  alpine tar czf /backup/redis-session-$(date +%Y%m%d).tar.gz /data

docker run --rm \
  -v smog_redis-queue-data:/data \
  -v /backup/smog:/backup \
  alpine tar czf /backup/redis-queue-$(date +%Y%m%d).tar.gz /data
```

### Automated Backups

Create a cron job for daily backups:

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * /opt/smog/scripts/backup.sh
```

### Restore from Backup

```bash
# Stop services
docker-compose down

# Restore Redis data
docker run --rm \
  -v smog_redis-session-data:/data \
  -v /backup/smog:/backup \
  alpine tar xzf /backup/redis-session-20231213.tar.gz -C /

# Start services
docker-compose up -d
```

### Security Updates

```bash
# Update system packages
apt update && apt upgrade -y

# Update Docker images
docker-compose pull
docker-compose up -d

# Remove old images
docker image prune -a
```

---

## Performance Optimization

### Docker Build Optimization (BuildKit)

This project uses Docker BuildKit for significantly faster builds. BuildKit provides:

**Benefits:**
- **10-20x faster subsequent builds** through intelligent layer caching
- **Cache mounts** that persist node_modules between builds
- **Parallel build stages** for better CPU utilization
- **Build progress** with detailed output

**How it works:**

1. **First build**: Takes ~2-3 minutes as it downloads and installs all dependencies
2. **Code-only changes**: Takes ~1-2 minutes (only rebuilds affected layers)
3. **No changes**: Takes ~10-30 seconds (uses cached layers)

**Using BuildKit:**

```bash
# Option 1: Use the provided script (easiest)
./docker-build.sh

# Option 2: Enable manually
export DOCKER_BUILDKIT=1
docker compose build

# Option 3: Enable globally (persists across sessions)
# Add to ~/.bashrc or ~/.zshrc:
export DOCKER_BUILDKIT=1
```

**Optimizations implemented:**

1. **Cache mounts** for Bun's install cache (`/root/.bun/install/cache`)
2. **Pre-built Sharp binaries** instead of compiling from source (saves 3-5 minutes)
3. **Frozen lockfile** for reproducible builds
4. **Hardlink linker** in bunfig.toml for faster installs
5. **Multi-stage builds** to minimize final image size

**Troubleshooting slow builds:**

```bash
# View detailed build progress
BUILDKIT_PROGRESS=plain docker compose build

# Clear BuildKit cache (if having issues)
docker builder prune

# Check cache usage
docker system df

# Full cleanup (removes ALL unused data)
docker system prune -a
```

### Video Processing Optimization

### For High Traffic

1. **Increase video worker concurrency**:
   ```env
   VIDEO_COMPOSITION_CONCURRENCY=4
   ```

2. **Scale video workers horizontally**:
   ```bash
   docker-compose up -d --scale video-worker=3
   ```

3. **Increase Redis memory limits** in `docker-compose.yml`:
   ```yaml
   redis-queue:
     command: redis-server --appendonly yes --maxmemory 1gb
   ```

4. **Add CDN** (Cloudflare, AWS CloudFront) in front of Caddy

### For Low Resources

1. **Reduce concurrency**:
   ```env
   VIDEO_COMPOSITION_CONCURRENCY=1
   ```

2. **Limit container resources** in `docker-compose.yml`

3. **Use swap space**:
   ```bash
   fallocate -l 4G /swapfile
   chmod 600 /swapfile
   mkswap /swapfile
   swapon /swapfile
   ```

---

## Support

For issues or questions:

1. Check service logs: `docker-compose logs -f`
2. Review this documentation
3. Check Docker status: `docker-compose ps`
4. Open an issue on GitHub

---

## Next Steps

1. ✅ Services are running
2. 🚧 Implement video composition worker logic (see `apps/video-worker/README.md`)
3. 🚧 Configure production domain and SSL
4. 🚧 Set up monitoring alerts
5. 🚧 Configure automated backups
6. 🚧 Implement CI/CD pipeline
