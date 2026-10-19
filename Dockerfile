# syntax=docker/dockerfile:1

FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN npm install -g pnpm@12.14.0
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .

# Pushes convex/ to the self-hosted backend, then exits.
FROM deps AS convex-deploy
ENTRYPOINT ["sh", "docker/convex-deploy.sh"]

FROM deps AS build
# Vite inlines these into the client bundle, so they are needed at build time.
ARG VITE_CONVEX_URL
ARG VITE_LOGTO_ENDPOINT
ARG VITE_LOGTO_APP_ID
RUN test -n "$VITE_CONVEX_URL" && test -n "$VITE_LOGTO_ENDPOINT" && test -n "$VITE_LOGTO_APP_ID" \
  || (echo "Set VITE_CONVEX_URL, VITE_LOGTO_ENDPOINT and VITE_LOGTO_APP_ID build args" && exit 1)
RUN pnpm build

FROM node:24-slim AS app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/.output ./.output
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
