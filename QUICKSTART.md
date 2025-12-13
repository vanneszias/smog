# Quick Start Guide - Docker Deployment

Get the Smog application running in 5 minutes!

## For Local Development

```bash
# 1. Clone and enter directory
git clone <your-repo>
cd smog

# 2. Copy and configure environment
cp .env.example .env
# Edit .env with your credentials (WORKOS, MOLLIE, CONVEX, MUX)

# 3. Start all services
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# 4. Access the application
# Web: http://localhost
# API: http://localhost:3000
# Video Worker: http://localhost:3002
# Grafana: http://localhost:3001
```

## For Production VPS

```bash
# 1. Install Docker on your VPS
curl -fsSL https://get.docker.com | sh

# 2. Clone repository
git clone <your-repo> /opt/smog
cd /opt/smog

# 3. Configure production environment
cp .env.example .env
nano .env  # Add production credentials

# 4. (Optional) Configure domain for SSL
nano apps/web/Caddyfile
# Uncomment and set your domain

# 5. Start production services
docker-compose up -d

# 6. View logs
docker-compose logs -f

# 7. Configure firewall
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable
```

That's it! Your application is now running.

## Available Services

| Service | Port | Description |
|---------|------|-------------|
| Web App | 80, 443 | React frontend with Caddy |
| API Server | 3000 | Bun/Hono API |
| Video Worker | 3002 | FFmpeg video processing |
| Grafana | 3001 | Monitoring dashboard |
| Prometheus | 9090 | Metrics collection |

## Common Commands

```bash
# View all service status
docker-compose ps

# View logs
docker-compose logs -f [service-name]

# Restart a service
docker-compose restart [service-name]

# Stop all services
docker-compose down

# Update and rebuild
git pull && docker-compose build && docker-compose up -d
```

## Need Help?

See the full [DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md) for:
- Detailed architecture
- Troubleshooting guide
- Production configuration
- Monitoring setup
- Backup and maintenance
