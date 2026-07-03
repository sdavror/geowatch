# ── Stage 1: deps + build ───────────────────────────────────
# node:20-slim (Debian/glibc) instead of alpine — Next.js' SWC compiler
# binary is built against glibc and fails to load on musl-based Alpine.
FROM node:20-slim AS build
WORKDIR /app

# ── Layer 1: package manifests only (cached until deps change) ──────────
# Copy ONLY the files npm needs for install — not the source code.
# This layer is invalidated only when package.json/lock changes,
# so npm install is NOT re-run every time we change a .tsx file.
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY packages/shared-types/package.json ./packages/shared-types/package.json
COPY apps/web/package.json ./apps/web/package.json

# Cache-busting escape hatch: pass --build-arg CACHEBUST=<new value> to
# force npm install to genuinely re-run rather than reusing a cached
# layer. Kept here because npm has, at least once, installed the wrong
# platform-specific @next/swc binary (musl instead of gnu) despite this
# being a correctly-detected glibc/Debian environment — re-running the
# install from scratch resolved it, with no other change needed.
ARG CACHEBUST=2
RUN echo "cachebust: ${CACHEBUST}"

RUN npm config set fetch-retries 5 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm config set maxsockets 3 \
  && npm install --include-workspace-root

# ── Layer 2: source code (invalidated on any file change) ───────────────
# Now copy the actual source — this layer rebuilds fast (no npm install).
COPY packages/shared-types ./packages/shared-types
COPY apps/web ./apps/web

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app/apps/web
RUN npm run build

# ── Stage 2: production runtime ────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static

RUN addgroup -S geowatch && adduser -S geowatch -G geowatch
USER geowatch

EXPOSE 3000
ENV PORT=3000

CMD ["node", "apps/web/server.js"]
