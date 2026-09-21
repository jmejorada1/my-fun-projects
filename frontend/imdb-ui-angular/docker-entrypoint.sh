#!/bin/sh
# Generates config.json at container *startup* (not `ng build` time) from
# the API_BASE_URL env var, so the same built image can point at any
# backend URL (local docker-compose, AWS, ...) without a rebuild — the
# frontend's Angular app fetches this before bootstrapping; see
# src/app/core/api-config.ts's loadApiConfig().
set -eu

: "${API_BASE_URL:=http://localhost:8080}"

cat > /usr/share/nginx/html/config.json <<JSON
{"apiBaseUrl": "${API_BASE_URL}"}
JSON

exec nginx -g 'daemon off;'
