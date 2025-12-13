# Security Guide for Smog Production Deployment

## Overview

This guide explains the security measures implemented in the Smog application and how to securely access internal services.

## Security Architecture

### Publicly Exposed Endpoints

Only the following endpoints are accessible from the internet:

- `https://smog.zias.be/` - Web application (static files)
- `https://smog.zias.be/api/*` - Public API endpoints
- `https://smog.zias.be/rpc/*` - RPC endpoints
- `https://smog.zias.be/auth/workos/*` - Authentication endpoints
- `https://smog.zias.be/webhooks/*` - Webhook endpoints (Mollie)
- `https://smog.zias.be/health` - Health check endpoint

### Internal Services (Not Exposed)

The following services are **NOT** accessible from the internet:

- **Grafana** (Monitoring dashboard)
- **Prometheus** (Metrics collection)
- **Redis** (Session & Queue storage)
- **Video Worker** (Internal video processing)
- **Server** (Internal API - only exposed through Caddy)

## Accessing Internal Services

### Prerequisites

1. SSH access to your production server
2. SSH key configured and working
3. Docker and Docker Compose running on the server

### Accessing Grafana (Monitoring Dashboard)

**Step 1: Create SSH Tunnel**
```bash
ssh -L 3001:grafana:3000 user@smog.zias.be
```

Replace `user` with your SSH username.

**Step 2: Access in Browser**
```
http://localhost:3001
```

**Step 3: Login**
- Username: Set in `GRAFANA_ADMIN_USER` (default: `admin`)
- Password: Set in `GRAFANA_ADMIN_PASSWORD` in your `.env` file

**Important:** Keep the SSH connection open while using Grafana. Closing it will disconnect the tunnel.

### Accessing Prometheus (Metrics)

**Step 1: Create SSH Tunnel**
```bash
ssh -L 9090:prometheus:9090 user@smog.zias.be
```

**Step 2: Access in Browser**
```
http://localhost:9090
```

### Accessing Multiple Services Simultaneously

You can create multiple tunnels in one SSH command:

```bash
ssh -L 3001:grafana:3000 -L 9090:prometheus:9090 user@smog.zias.be
```

Or create separate SSH connections in different terminals.

### Using Docker Exec (Alternative)

If you're already SSH'd into the server, you can access services using Docker:

```bash
# View Grafana logs
docker compose logs grafana -f

# Execute commands in Grafana container
docker compose exec grafana /bin/sh

# View Prometheus status
docker compose exec prometheus promtool check config /etc/prometheus/prometheus.yml

# Access Redis session store
docker compose exec redis-session redis-cli

# Access Redis queue
docker compose exec redis-queue redis-cli
```

## Security Best Practices

### 1. Change Default Credentials

**Immediately after deployment**, update your `.env` file:

```bash
# Generate a strong password
openssl rand -base64 32

# Update .env file
GRAFANA_ADMIN_PASSWORD=your_generated_password_here
```

Then restart Grafana:
```bash
docker compose restart grafana
```

### 2. Use Strong SSH Keys

Ensure your SSH key is secure:

```bash
# Generate a strong SSH key (if needed)
ssh-keygen -t ed25519 -C "your_email@example.com"

# Add to your server's authorized_keys
ssh-copy-id user@smog.zias.be
```

### 3. Configure SSH Config

For convenience and security, add to `~/.ssh/config`:

```
Host smog-prod
    HostName smog.zias.be
    User your_username
    IdentityFile ~/.ssh/id_ed25519
    ServerAliveInterval 60
    ServerAliveCountMax 3
    
    # Grafana tunnel
    LocalForward 3001 grafana:3000
    
    # Prometheus tunnel
    LocalForward 9090 prometheus:9090
```

Then connect simply with:
```bash
ssh smog-prod
```

### 4. Enable SSH 2FA (Recommended)

For production servers, enable two-factor authentication:

```bash
# On your server
sudo apt-get install libpam-google-authenticator
google-authenticator
```

Follow the prompts and update your SSH configuration.

### 5. Firewall Configuration

Ensure your firewall only allows necessary ports:

```bash
# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS (handled by Cloudflare Tunnel)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable
```

### 6. Regular Security Updates

Keep your system updated:

```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Update Docker images
docker compose pull
docker compose up -d
```

## Security Headers

The following security headers are automatically applied by Caddy:

- `X-Frame-Options: DENY` - Prevents clickjacking
- `X-Content-Type-Options: nosniff` - Prevents MIME sniffing
- `X-XSS-Protection: 1; mode=block` - XSS protection
- `Referrer-Policy: strict-origin-when-cross-origin` - Limits referrer information
- `Content-Security-Policy` - Controls resource loading
- `Permissions-Policy` - Disables unnecessary browser features

## Monitoring Access Logs

Monitor who's accessing your services:

```bash
# View Caddy access logs
docker compose logs web -f | grep -i "monitoring\|api-reference"

# View authentication attempts
docker compose logs server -f | grep -i "auth"

# View failed login attempts in Grafana
docker compose logs grafana -f | grep -i "failed"
```

## Incident Response

If you suspect a security breach:

1. **Immediately change all passwords**:
   ```bash
   # Update .env with new passwords
   # Restart affected services
   docker compose restart grafana server
   ```

2. **Check for unauthorized access**:
   ```bash
   # Review all logs
   docker compose logs --since 24h > security-audit.log
   
   # Check SSH login attempts
   sudo grep "Failed password" /var/log/auth.log
   ```

3. **Rotate API keys**:
   - WorkOS credentials
   - Mollie API keys
   - Mux tokens
   - Convex deployment key

4. **Review Docker container status**:
   ```bash
   docker compose ps
   docker stats
   ```

## Rate Limiting

Rate limiting is configured in Cloudflare (recommended) or can be added to Caddy.

For Cloudflare:
1. Go to Security > WAF
2. Create rate limiting rules
3. Recommended limits:
   - API endpoints: 100 requests/minute
   - Auth endpoints: 10 requests/minute
   - Webhooks: 30 requests/minute

## Webhook Security

The Mollie webhook endpoint (`/webhooks/mollie`) should verify signatures in application code.

To add IP allowlist in Caddyfile (if Mollie provides static IPs):

```caddy
@mollie_webhook {
    path /webhooks/mollie
    remote_ip 1.2.3.4 5.6.7.8  # Mollie's IPs
}

handle @mollie_webhook {
    reverse_proxy server:3000
}

# Block all other webhook attempts
handle /webhooks/* {
    respond "Forbidden" 403
}
```

## Backup and Recovery

Regular backups of persistent data:

```bash
# Backup Grafana dashboards
docker compose exec grafana tar czf /tmp/grafana-backup.tar.gz /var/lib/grafana
docker cp $(docker compose ps -q grafana):/tmp/grafana-backup.tar.gz ./backups/

# Backup Prometheus data
docker compose exec prometheus tar czf /tmp/prometheus-backup.tar.gz /prometheus
docker cp $(docker compose ps -q prometheus):/tmp/prometheus-backup.tar.gz ./backups/

# Backup Redis data
docker compose exec redis-session redis-cli SAVE
docker compose exec redis-queue redis-cli SAVE
```

## Contact & Support

For security concerns or questions:
- Email: admin@zias.be
- Review logs: `docker compose logs`
- Check health: `https://smog.zias.be/health`

## Audit Log

Keep a record of security changes:

| Date | Change | Who | Reason |
|------|--------|-----|--------|
| 2025-12-13 | Removed public monitoring endpoints | Initial security hardening | Production readiness |
| | Added SSH tunnel access | Initial security hardening | Secure internal access |
| | Enhanced security headers | Initial security hardening | Defense in depth |

---

**Last Updated**: December 13, 2025
**Version**: 1.0
**Reviewed By**: Security Team
