# SellEasy production image. Works on any Docker host (Railway, Render, Fly.io, a VPS, ECS, …).
# On start it applies database migrations, runs the safe bootstrap (never deletes data), then serves on $PORT.

FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build && npm prune --omit=dev

FROM base AS run
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    UPLOAD_DIR=/data/uploads \
    PRIVATE_UPLOAD_DIR=/data/private-uploads
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json /app/next.config.ts ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/prisma ./prisma
RUN mkdir -p /data/uploads /data/private-uploads && chown -R node:node /data
USER node
# Mount a persistent volume here: listing photos and private seller documents live in /data.
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "run", "start:prod"]
