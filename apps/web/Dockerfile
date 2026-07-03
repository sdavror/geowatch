# ── Stage 1: deps ───────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/shared-types ./packages/shared-types
COPY apps/web/package.json ./apps/web/package.json

RUN npm install --workspace=@geowatch/web --workspace=@geowatch/shared-types --include-workspace-root

# ── Stage 2: build ──────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY packages/shared-types ./packages/shared-types
COPY apps/web ./apps/web

WORKDIR /app/apps/web
RUN npm run build

# ── Stage 3: production runtime ────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production
RUN apk add --no-cache dumb-init

COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static

RUN addgroup -S geowatch && adduser -S geowatch -G geowatch
USER geowatch

EXPOSE 3000
ENV PORT=3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/web/server.js"]
