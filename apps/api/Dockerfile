# Build context is the monorepo root:
#   fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile
FROM oven/bun:1.3 AS base
WORKDIR /app

# Install workspace dependencies from the lockfile.
COPY package.json bun.lock turbo.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages ./packages
RUN bun install --frozen-lockfile

# Copy the API source (Bun runs TypeScript directly, no build step needed).
COPY apps/api ./apps/api

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["bun", "apps/api/src/index.ts"]
