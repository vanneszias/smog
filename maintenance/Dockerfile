# syntax=docker/dockerfile:1.4
# Maintenance page — static HTML served by Caddy

FROM caddy:2-alpine

COPY index.html /srv/index.html
COPY assets/logo.svg /srv/assets/logo.svg
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 80 443

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
