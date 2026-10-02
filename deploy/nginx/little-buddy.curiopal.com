# little-buddy.curiopal.com: the parent website as static files, plus the
# backend's /api and /v1 on 127.0.0.1:3600. /admin is deliberately not
# proxied: operators call it on the host itself.
#
# Cloudflare proxies in front with Full (strict) SSL, so this serves its own
# Let's Encrypt certificate. The ACME path is answered on both ports because
# Cloudflare's Always Use HTTPS may redirect the renewal check to 443.
# No http2 on the listen lines: in nginx 1.24 that flag is per address and
# port, so it would switch on HTTP/2 for every other site on this host too.

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name little-buddy.curiopal.com;

    ssl_certificate /etc/letsencrypt/live/little-buddy.curiopal.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/little-buddy.curiopal.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    root /var/www/little-buddy/site;
    index index.html;
    client_max_body_size 1m;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/little-buddy/acme;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3600;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /v1/ {
        proxy_pass http://127.0.0.1:3600;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # The toy's WebSocket. The backend pings every 30 s; the long timeouts
    # only cover a turn whose answer is slow to come back.
    location = /v1/stream {
        proxy_pass http://127.0.0.1:3600;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 1h;
        proxy_send_timeout 1h;
    }

    # GitHub's push webhook (deploy/webhook.mjs checks the signature). A
    # delivery can be up to 25 MB.
    location = /hooks/deploy {
        proxy_pass http://127.0.0.1:9130;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        client_max_body_size 25m;
    }

    # Vite fingerprints asset names, so they never change under one URL.
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # The shell must be refetched so a deploy is picked up at once.
    location = /index.html {
        add_header Cache-Control "no-cache";
    }

    # Client-side routes (/app/...) all load the same shell.
    location / {
        try_files $uri $uri/ /index.html;
    }
}

server {
    listen 80;
    listen [::]:80;
    server_name little-buddy.curiopal.com;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/little-buddy/acme;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}
