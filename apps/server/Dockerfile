# Use Bun base image
FROM oven/bun:1 AS base
WORKDIR /app

# Install FFmpeg and dependencies
RUN apt-get update && apt-get install -y \
  ffmpeg \
  fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json bun.lock* ./
COPY tsconfig.json ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY src ./src

# Copy fonts
COPY fonts ./fonts

# Build
RUN bun run build

# Expose port
EXPOSE 3000

# Start server
CMD ["bun", "run", "start"]
