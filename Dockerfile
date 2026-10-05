FROM node:24.17.0-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@11.21.0
WORKDIR /workspace
COPY . .
RUN pnpm install --frozen-lockfile

FROM base AS api-build
RUN POSTGRES_DB=build POSTGRES_USER=build POSTGRES_PASSWORD=build-only-placeholder-password SESSION_SECRET=build-only-placeholder-session-secret OWNER_PASSWORD=build-only-placeholder-owner-password pnpm db:generate
RUN pnpm --filter @jobhunt/api build

FROM api-build AS api
RUN mkdir -p /workspace/storage/resumes && chown -R node:node /workspace/storage
USER node
WORKDIR /workspace/apps/api
CMD ["node", "dist/main.js"]

FROM base AS web-build
ENV API_INTERNAL_URL=http://api:43171
RUN pnpm --filter @jobhunt/web build

FROM web-build AS web
RUN chown -R node:node /workspace/apps/web/.next
USER node
WORKDIR /workspace/apps/web
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "43170"]
