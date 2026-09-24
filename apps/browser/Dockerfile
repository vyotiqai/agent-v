# Build from the repository root:
#   docker build -f apps/browser/Dockerfile -t agent-v-browser .
FROM node:24-bookworm-slim

ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN corepack enable
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/net/package.json packages/net/
COPY apps/browser/package.json apps/browser/
RUN pnpm install --frozen-lockfile --prod --filter @agent-v/browser...

# Chromium matching this Playwright version, plus its system libraries and fonts.
RUN pnpm --filter @agent-v/browser exec playwright-core install --with-deps chromium \
  && rm -rf /var/lib/apt/lists/*

COPY packages/net/src packages/net/src
COPY apps/browser/src apps/browser/src

RUN useradd --create-home --uid 10001 browser && mkdir -p /data && chown browser /data
USER browser
ENV BROWSER_HOST=0.0.0.0 BROWSER_PORT=8790 BROWSER_DATA_DIR=/data NODE_ENV=production
EXPOSE 8790
CMD ["node", "apps/browser/src/index.ts"]
