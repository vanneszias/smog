# smog

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines React, TanStack Router, Hono, ORPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Router** - File-based routing with full type safety
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **shadcn/ui** - Reusable UI components
- **Hono** - Lightweight, performant server framework
- **oRPC** - End-to-end type-safe APIs with OpenAPI integration
- **Bun** - Runtime environment
- **Convex** - Backend platform with real-time database
- **Authentication** - Better-Auth
- **Turborepo** - Optimized monorepo build system
- **Biome** - Linting and formatting

## Getting Started

### Option 1: Docker (Recommended for Production)

🚀 **Quick Start with Docker** - Get everything running in 5 minutes:

```bash
# Copy and configure environment
cp .env.example .env
# Edit .env with your credentials

# Start all services (web, API, video-worker, Redis, monitoring)
docker-compose up -d

# View logs
docker-compose logs -f
```

Access the application:
- **Web**: http://localhost
- **API**: http://localhost:3000
- **Video Worker**: http://localhost:3002
- **Grafana**: http://localhost:3001

📖 See [QUICKSTART.md](./QUICKSTART.md) and [DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md) for complete Docker documentation.

### Option 2: Local Development (Bun)

For traditional local development without Docker:

```bash
# Install dependencies
bun install

# Start development servers
bun run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.
The API is running at [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
smog/
├── apps/
│   ├── web/              # Frontend (React + TanStack Router) + Caddy
│   ├── server/           # Backend API (Hono, ORPC)
│   ├── video-worker/     # Video composition service (FFmpeg + BullMQ) [NEW]
│   └── native/           # React Native mobile app
├── packages/
│   ├── api/              # API layer / business logic
│   ├── auth/             # Authentication configuration & logic
│   ├── convex/           # Convex database schema & queries
│   ├── ui/               # Shared UI components
│   └── ...
├── monitoring/           # Prometheus + Grafana configs [NEW]
├── docker-compose.yml    # Production Docker setup [NEW]
├── docker-compose.dev.yml # Development Docker setup [NEW]
└── DOCKER_DEPLOYMENT.md  # Complete deployment guide [NEW]
```

## Available Scripts

### Docker Commands
- `docker compose up`: Start all services (production mode)
- `docker compose -f docker-compose.yml -f docker-compose.dev.yml up`: Development mode with hot reload
- `docker compose logs -f`: View logs
- `docker compose ps`: Check service status
- `docker compose down`: Stop all services

### Bun Commands (Local Development)
- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run dev:web`: Start only the web application
- `bun run dev:server`: Start only the server
- `bun run check-types`: Check TypeScript types across all apps
- `bun run convex:dev`: Start Convex development backend
- `bun run convex:deploy`: Deploy Convex backend
- `bun run check`: Run Biome formatting and linting

## Deployment

### VPS Deployment (Production)

Deploy to any VPS with Docker:

```bash
# On your VPS
curl -fsSL https://get.docker.com | sh
git clone <your-repo> /opt/smog
cd /opt/smog
cp .env.example .env
nano .env  # Configure production credentials
docker-compose up -d
```

See [DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md) for complete instructions including:
- SSL/HTTPS with Caddy (automatic Let's Encrypt)
- Monitoring setup (Prometheus + Grafana)
- Scaling and resource optimization
- Backup and maintenance procedures
