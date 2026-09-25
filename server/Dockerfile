# The server image: one image for the API, the workers, the egress gateway and the migrate job;
# each is started with its own command (stage 6, section 23). Build from the repository root:
#   docker build -f server/Dockerfile -t agent-v-server .
# The base is pinned by digest, so a build uses exactly this image until we change it on purpose.
FROM node:24.21.0-trixie-slim@sha256:8ec5d7557396cfe32d21c3f9c13072355ceab22b584578ca4bb28af31120cffe AS deps
WORKDIR /srv
COPY package.json package-lock.json ./
COPY server/package.json server/
RUN npm ci --omit=dev --workspace server --ignore-scripts --no-audit --no-fund

FROM node:24.21.0-trixie-slim@sha256:8ec5d7557396cfe32d21c3f9c13072355ceab22b584578ca4bb28af31120cffe
ENV NODE_ENV=production
WORKDIR /srv
COPY --from=deps /srv/node_modules node_modules
COPY package.json ./
COPY server/package.json server/
COPY server/src server/src
COPY server/migrations server/migrations
WORKDIR /srv/server
USER node
# The API by default; the others run `node src/egress/main.ts` or `node src/migrate/main.ts`.
CMD ["node", "src/api/main.ts"]
