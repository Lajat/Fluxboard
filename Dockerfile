# Multi-stage build for apps/api, run from the REPO ROOT (not apps/api) as
# the Docker build context — this is required because apps/api depends on
# packages/shared-types via a pnpm workspace link, so the build needs
# visibility into the whole monorepo, not just the api folder alone.

FROM node:22-alpine AS builder
RUN npm install -g pnpm@11.17.0
WORKDIR /repo

# Copy just the manifests first, so Docker can cache the install step and
# skip re-running it on every build unless a dependency actually changed.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/package.json
COPY apps/api/package.json ./apps/api/package.json

RUN pnpm install --frozen-lockfile

# Now copy the actual source and build.
COPY packages/shared-types ./packages/shared-types
COPY apps/api ./apps/api

RUN pnpm --filter @fluxboard/shared-types build
RUN pnpm --filter @fluxboard/api build

# `pnpm deploy` resolves workspace:* dependencies (like shared-types) into
# real, hard-copied files — not symlinks — producing a folder that works
# standalone, outside the monorepo/pnpm-workspace context entirely. This
# is what makes the final image runnable without pnpm or the rest of the
# repo present at all.
RUN pnpm --filter @fluxboard/api deploy --prod /out/api

# --- Runtime image: small, only what's needed to actually run the server ---
FROM node:22-alpine

# Baked into the image itself, not left as an Elastic Beanstalk console
# setting — a manually-set env var is easy to forget on a new environment
# or a config reset, and this one is load-bearing: authController's
# `isProd` check (which decides whether auth cookies use the cross-site-
# safe sameSite="none" or the same-site-only "lax") depends entirely on
# NODE_ENV="production". Losing it silently reintroduces the exact
# "refresh returns 401" bug from before, with no error pointing at why.
ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder /out/api ./
COPY --from=builder /repo/apps/api/dist ./dist

EXPOSE 80

CMD ["node", "dist/index.js"]
