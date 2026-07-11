# ── Stage 1: deps + build ───────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# Prisma needs OpenSSL present at generate-time too, to pick the correct
# musl-compatible query engine binary for this platform.
RUN apk add --no-cache openssl

# Copy the whole monorepo manifest set first for correct workspace resolution
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY packages/shared-types ./packages/shared-types
COPY apps/api ./apps/api

RUN npm config set fetch-retries 5 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm config set maxsockets 3 \
  && npm install --include-workspace-root

WORKDIR /app/apps/api
RUN npx prisma generate
RUN npm run build

# ── Stage 2: production runtime ────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

# Prisma's query engine needs a real OpenSSL present to detect the libssl
# version at runtime — without it, it fails with "failed to detect the
# libssl/openssl version to use".
RUN apk add --no-cache openssl

# npm workspaces hoist shared deps to the root node_modules — copy that whole
# tree rather than guessing whether a nested apps/api/node_modules exists.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/tsconfig.seed.json ./apps/api/tsconfig.seed.json
COPY --from=build /app/tsconfig.base.json ./tsconfig.base.json

WORKDIR /app/apps/api

# Create the uploads dir at build time and own it before it becomes a
# mount point. A named volume mounted here initializes from the image, so
# this is what gives the non-root user write access to uploaded images.
RUN mkdir -p /app/apps/api/uploads \
  && addgroup -S geowatch && adduser -S geowatch -G geowatch \
  && chown -R geowatch:geowatch /app
USER geowatch

EXPOSE 4000

# rootDir=./src + preserveSymlinks=true keeps @geowatch/shared-types resolution
# (via the real npm workspace symlink in node_modules) from affecting the
# computed output structure — verified locally with an isolated tsc run that
# reproduces the actual symlink layout. Entrypoint is dist/main.js.
CMD ["node", "dist/main.js"]
