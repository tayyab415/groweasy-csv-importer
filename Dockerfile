# ---- Build stage: install deps + build the Next.js frontend ----------------
FROM node:22-slim AS build
WORKDIR /app

# Install dependencies against the lockfile for reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build the Next.js production output (.next).
COPY . .
RUN npm run build

# ---- Runtime stage: minimal image that runs the combined server ------------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Cloud Run provides PORT (defaults to 8080); the server reads it.
ENV PORT=8080

# Copy only what the runtime needs: deps, build output, and server/shared code.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
# Static assets served from /public (e.g. the header logo) — required at runtime.
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.mjs ./next.config.mjs
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/app ./app
COPY --from=build /app/tsconfig.json ./tsconfig.json

EXPOSE 8080

# tsx runs the TypeScript custom server (Next + Express) directly.
CMD ["node_modules/.bin/tsx", "server/index.ts"]
