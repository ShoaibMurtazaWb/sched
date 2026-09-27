# syntax=docker/dockerfile:1

# ------------------------------------------------------------------------------
# Base Stage: Alpine with OpenSSL for Prisma and Corepack for pnpm
# ------------------------------------------------------------------------------
FROM node:20-alpine AS base

RUN apk add --no-cache libc6-compat openssl
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

# ------------------------------------------------------------------------------
# Builder Stage: Install dependencies and build shared packages & NestJS API
# ------------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app

# Copy root workspace manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json ./

# Copy package manifests for workspace caching
COPY packages/api-contract/package.json ./packages/api-contract/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY apps/api/package.json ./apps/api/

# Install dependencies (frozen lockfile)
RUN pnpm install --frozen-lockfile

# Copy full source code for packages and apps/api
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

# Generate Prisma Client inside Linux container
RUN pnpm --filter @sched/api prisma:generate

# Build shared API contracts
RUN pnpm --filter @sched/api-contract build

# Build NestJS production bundle
RUN pnpm --filter @sched/api build

# ------------------------------------------------------------------------------
# Runner Stage: Minimal production image
# ------------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Copy workspace dependencies, built artifacts, and Prisma schema
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/packages ./packages
COPY --chown=node:node --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --chown=node:node --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --chown=node:node --from=builder /app/apps/api/dist ./apps/api/dist
COPY --chown=node:node --from=builder /app/apps/api/prisma ./apps/api/prisma

WORKDIR /app/apps/api

# Run as non-root user
USER node

EXPOSE 3001

CMD ["node", "dist/main.js"]
