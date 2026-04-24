# CreatorLens — per-creator "Lens" agent container
#
# Built once, launched per-user with environment injection:
#   CREATORLENS_USER_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
#   ANTHROPIC_API_KEY, TOKEN_BUDGET
#
# Persistent memory: mount /data as a volume per container for SQLite memory +
# periodic sync to Supabase.

# ---------- stage 1: deps ----------
FROM node:20-alpine AS deps
WORKDIR /app

# System deps for playwright / ffmpeg / better-sqlite3 native build
RUN apk add --no-cache \
    python3 make g++ \
    ffmpeg \
    chromium \
    nss freetype harfbuzz ca-certificates ttf-freefont

ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Install workspace manifests only for efficient layer caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/agent/package.json apps/agent/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --filter @creatorlens/agent... --frozen-lockfile || \
    pnpm install --filter @creatorlens/agent...

# ---------- stage 2: build ----------
FROM deps AS build
COPY . .
RUN pnpm --filter @creatorlens/agent build

# ---------- stage 3: runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache ffmpeg chromium nss freetype harfbuzz ca-certificates ttf-freefont

ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Non-root user for the container runtime
RUN addgroup -S lens && adduser -S lens -G lens
RUN mkdir -p /data && chown -R lens:lens /data

COPY --from=build --chown=lens:lens /app /app

USER lens
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "apps/agent/dist/index.js"]
