# syntax=docker/dockerfile:1

# Bun runtime image. Debian-slim is used rather than Alpine because Prisma's
# engines link against glibc/OpenSSL.
ARG BUN_IMAGE=oven/bun:1-slim

# ── base ─────────────────────────────────────────────────────────────────────
FROM ${BUN_IMAGE} AS base
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ── deps: full dependency tree, so the Prisma CLI is available for codegen ────
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ── prod-deps: runtime dependencies only ─────────────────────────────────────
FROM base AS prod-deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ── build: generate the Prisma client into src/generated/prisma ──────────────
FROM deps AS build
# `prisma generate` only reads the schema — this placeholder is never used to
# open a connection, and no real credentials end up in any layer.
ARG DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public"
ENV DATABASE_URL=${DATABASE_URL}
COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN bunx prisma generate

# ── migrate: one-shot image for applying migrations (needs the Prisma CLI) ────
FROM build AS migrate
# Drop the codegen placeholder so a missing DATABASE_URL fails loudly instead of
# silently dialling localhost.
ENV DATABASE_URL=""
CMD ["bunx", "prisma", "migrate", "deploy"]

# ── dev: hot-reloading server; bind-mount your working tree over /app ────────
FROM build AS dev
ENV DATABASE_URL="" \
    NODE_ENV=development \
    PORT=3000
EXPOSE 3000
CMD ["bun", "run", "dev"]

# ── runtime: production image ────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY package.json tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD bun -e "const r = await fetch('http://127.0.0.1:' + (process.env.PORT ?? 3000) + '/'); process.exit(r.ok ? 0 : 1)"
CMD ["bun", "run", "start"]
