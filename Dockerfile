# =============================================================================
# HomeBase – Multi-stage Dockerfile
#
# Build stages:
#   deps     – install npm dependencies (including native rebuilds)
#   builder  – generate Prisma client + run Next.js build
#   runner   – production image
#
# Migrations are intentionally NOT run here.
# They run at container startup via entrypoint.sh so they execute against
# the live /data volume on the Synology NAS (which isn't available at build time).
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: deps – clean dependency install with native module rebuild
# -----------------------------------------------------------------------------
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npm rebuild better-sqlite3

# -----------------------------------------------------------------------------
# Stage 2: builder – generate Prisma client and compile Next.js
# -----------------------------------------------------------------------------
FROM node:22-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# Prisma needs a DATABASE_URL at generate/build time even though the real
# database isn't available until the container starts on the NAS.
ENV DATABASE_URL="file:/data/homebase.db"

# Generate the Prisma client (baked into the image, no write access needed at runtime)
RUN npx prisma generate

# Build Next.js (standalone output – configured in next.config.ts)
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 3: runner – production image
#
# We use node_modules from the builder stage (full install, includes the prisma
# CLI which is a devDependency but needed at runtime for `migrate deploy`).
# The total image / tar is ~300 MB which is acceptable for a home-server deploy.
# -----------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Runtime tools:
#   su-exec  – drop privileges from root to nextjs after startup tasks
#   dcron    – lightweight cron for scheduled DB backups
#   sqlite   – sqlite3 CLI used by entrypoint to verify DB health
COPY --from=cloudflare/cloudflared:latest /usr/local/bin/cloudflared /usr/local/bin/cloudflared
RUN apk add --no-cache su-exec dcron sqlite

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Next.js standalone output.
# This includes server.js and a trimmed node_modules for bundled dependencies.
# Packages in serverExternalPackages are excluded from this bundle — they are
# served from the full node_modules we copy below instead.
COPY --from=builder /app/public                                   ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone   ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static       ./.next/static

# package.json is required by the Prisma CLI to locate prisma/schema.prisma
COPY --from=builder /app/package.json ./package.json

# Prisma schema + ALL migration files so `prisma migrate deploy` can run at startup
COPY --from=builder /app/prisma ./prisma

# Full node_modules from builder — includes the prisma CLI (devDep) needed for
# `migrate deploy` at startup, plus all serverExternalPackages and their deps.
COPY --from=builder /app/node_modules ./node_modules

# Scripts
COPY docker/entrypoint.sh         ./entrypoint.sh
COPY scripts/backup-db.sh         ./scripts/backup-db.sh
COPY scripts/restore-db.sh        ./scripts/restore-db.sh

RUN chmod +x ./entrypoint.sh \
              ./scripts/backup-db.sh \
              ./scripts/restore-db.sh

# /data is the persistent volume mount point on the NAS
RUN mkdir -p /data && chown nextjs:nodejs /data

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "server.js"]
