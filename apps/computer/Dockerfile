# The per-user Linux computer. Build: docker build -t agent-v-computer:local apps/computer
ARG BASE=node:24-bookworm-slim
FROM ${BASE}

# Everyday tools for the agent. Build with --build-arg PACKAGES= for a minimal image.
ARG PACKAGES="ca-certificates file git jq less nano procps python3 python3-venv ripgrep sqlite3 tree unzip xz-utils zip"
RUN if [ -n "$PACKAGES" ]; then \
      apt-get update && apt-get install -y --no-install-recommends $PACKAGES \
      && rm -rf /var/lib/apt/lists/*; \
    fi

# An unprivileged user; /workspace is the only persistent, writable place.
RUN usermod -l agent -d /workspace node && groupmod -n agent node \
  && mkdir -p /workspace && chown 1000:1000 /workspace
COPY --chmod=0555 files.mjs /usr/local/bin/agentv-files

USER 1000:1000
WORKDIR /workspace
ENV HOME=/workspace PATH=/workspace/.local/bin:/usr/local/bin:/usr/bin:/bin LANG=C.UTF-8
CMD ["sleep", "infinity"]
