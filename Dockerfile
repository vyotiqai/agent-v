# The Agent V server image: the API plus the exported web app, served from one origin.
#   docker build -t agent-v .
# Behind an HTTPS-intercepting proxy, build FROM an image that trusts its CA:
#   docker build --build-arg NODE_IMAGE=<base> --build-arg NODE_EXTRA_CA_CERTS=<ca path> .
ARG NODE_IMAGE=node:24-bookworm-slim
ARG DOCKER_CLI_IMAGE=docker:28-cli

FROM ${NODE_IMAGE} AS base
ARG NODE_EXTRA_CA_CERTS
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/net/package.json packages/net/

# The web app, built to talk to the origin it is served from.
FROM base AS web
COPY apps/app/package.json apps/app/
RUN pnpm install --frozen-lockfile --filter @agent-v/app...
COPY packages/shared/src packages/shared/src
COPY apps/app apps/app
RUN cd apps/app && EXPO_PUBLIC_API_URL=/ pnpm exec expo export --platform web --output-dir dist/web --clear

# Production dependencies of the server and its workspace packages.
FROM base AS server
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile --prod --filter @agent-v/server...

# Optional: the Docker CLI, for per-user computers (COMPUTER_PROVIDER=docker).
FROM ${DOCKER_CLI_IMAGE} AS docker-cli

FROM ${NODE_IMAGE}
WORKDIR /repo
COPY --from=server /repo /repo
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY packages/shared/src packages/shared/src
COPY packages/net/src packages/net/src
COPY apps/server/src apps/server/src
COPY apps/server/drizzle apps/server/drizzle
COPY --from=web /repo/apps/app/dist/web /repo/web
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 WEB_DIR=/repo/web DATA_DIR=/data
USER node
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/api/health`).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "apps/server/src/index.ts"]
