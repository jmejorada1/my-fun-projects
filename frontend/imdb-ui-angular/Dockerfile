# Multi-stage build: compile the Angular app with Node, serve the static
# output with nginx.
FROM node:22-alpine AS build
WORKDIR /app

# Copy just the lockfile first so `npm ci` is cached across builds and only
# re-runs when dependencies actually change.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist/imdb-ui-angular/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]
