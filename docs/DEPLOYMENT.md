# LeadGuard OS V6 — Production Deployment Architecture

This document specifies the deployment infrastructure, container topologies, reverse proxy configurations, and environment variable requirements for LeadGuard OS V6.

---

## 1. Container Topology & Architecture

LeadGuard runs as three decoupled services communicating over private network links:

```
                  [ Internet / Clients ]
                            │
                            ▼
               [ Reverse Proxy: Nginx / Cloudflare ]
                ├── /api/*, /public/*  ──►  [ apps/api (Node.js:4000) ]
                └── /*                 ──►  [ apps/web (Static / CDN) ]
                                                    │
                                                    ▼
                                          [ PostgreSQL (5432) ]
                                          [ Redis Cluster (6379) ]
                                                    ▲
                                                    │
                                         [ apps/worker (Node.js) ]
```

---

## 2. Reverse Proxy Configuration (Nginx Example)

```nginx
server {
    listen 443 ssl http2;
    server_name api.leadguard.io;

    ssl_certificate /etc/letsencrypt/live/leadguard.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/leadguard.io/privkey.pem;

    client_max_body_size 2M;
    proxy_read_timeout 60s;
    proxy_connect_timeout 10s;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 3. Environment Variables Reference

| Variable | Description | Example |
|---|---|---|
| `NODE_ENV` | Environment mode (`production`, `development`, `test`) | `production` |
| `PORT` | API listen port | `4000` |
| `DATABASE_URL` | PostgreSQL connection pool URL | `postgresql://user:pass@host:5432/leadguard` |
| `REDIS_URL` | Redis instance URL for queues and rate limiters | `redis://host:6379` |
| `JWT_SECRET` | Secret key used for signing short-lived access tokens | `min-32-char-random-string` |
| `COOKIE_SECRET` | Secret for signing session cookies | `min-32-char-random-string` |
| `APP_URL` | Frontend origin for CORS and email links | `https://app.leadguard.io` |
| `API_URL` | Public API origin | `https://api.leadguard.io` |
| `CORS_ORIGINS` | Comma-separated list of allowed origins | `https://app.leadguard.io,https://leadguard.io` |
| `RAZORPAY_KEY_ID` | Commercial payment gateway key ID | `rzp_live_...` |
| `RAZORPAY_KEY_SECRET` | Commercial payment gateway secret | `...` |
| `RAZORPAY_WEBHOOK_SECRET` | Secret for verifying payment webhooks | `...` |
