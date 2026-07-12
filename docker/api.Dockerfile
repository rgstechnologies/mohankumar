# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# Install all workspace deps with a single lockfile-driven install
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci

# Build shared package, generate Prisma client, build API
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w packages/shared \
  && npx -w apps/api prisma generate \
  && npm run build -w apps/api

# Remove dev dependencies, keep generated Prisma client.
# npm workspaces hoist deps to the root node_modules, so apps/api/node_modules
# may not exist — ensure it does so the runtime COPY below never fails.
RUN npm prune --omit=dev \
  && mkdir -p apps/api/node_modules

# ---- Runtime stage ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/assets ./apps/api/assets
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules

# Run DB migrations, then start. Idempotent — safe on every boot.
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
