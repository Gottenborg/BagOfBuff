# Build context is the monorepo root:
#   fly deploy --config apps/shop/fly.toml --dockerfile apps/shop/Dockerfile
FROM oven/bun:1.3 AS build
WORKDIR /app

# Install all workspace dependencies (needed to build the app).
COPY package.json bun.lock turbo.json ./
COPY apps/shop/package.json ./apps/shop/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/admin/package.json ./apps/admin/package.json
COPY packages ./packages
RUN bun install --frozen-lockfile

# Build the storefront (Nitro node-server output → apps/shop/.output).
COPY apps/shop ./apps/shop
ENV VITE_API_URL=https://api.bagofbuff.com
RUN cd apps/shop && bun run build

# ---- Runtime: the Nitro output is self-contained ----
FROM oven/bun:1.3 AS runtime
WORKDIR /app
COPY --from=build /app/apps/shop/.output ./.output

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["bun", ".output/server/index.mjs"]
