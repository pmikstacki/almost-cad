# syntax=docker/dockerfile:1
# @modulecad/dwg-converter — builds LibreDWG once (cached), ships binaries.
#
# Debian stable (bookworm) does NOT ship libredwg-tools in apt, and LibreDWG
# GitHub releases have no .deb artifacts. So we compile LibreDWG in a builder
# stage — this is a one-time cost: the layer is cached and reused on every
# subsequent deploy. Only the resulting binaries (dwg2dxf, dxf2dwg + libs)
# are copied to the slim runtime image.
#
# To keep the build off the Coolify host's memory, this stage is split from
# the runtime: the builder can be heavy, the runner stays small (~150MB).
#
# GPL boundary: bundles LibreDWG (GPL-3) → image is GPL-3.0-or-later. Runs
# as its own container, never linked into the Nuxt process. See app/LICENSE.

# ── Stage 1: build LibreDWG from the release tarball (cached layer) ────
FROM debian:bookworm-slim AS libredwg-builder
ARG LIBREDWG_VERSION=0.13.4
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential wget ca-certificates \
      pkg-config \
      libpcre2-dev \
      python3 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt
# Use the release tarball (stable, no autogen needed) instead of git HEAD.
RUN wget -q "https://github.com/LibreDWG/libredwg/releases/download/${LIBREDWG_VERSION}/libredwg-${LIBREDWG_VERSION}.tar.gz" \
    && tar xzf "libredwg-${LIBREDWG_VERSION}.tar.gz" \
    && cd "libredwg-${LIBREDWG_VERSION}" \
    && ./configure --disable-bindings --prefix=/usr/local \
    && make -j"$(nproc)" \
    && make install \
    && ldconfig

# ── Stage 2: minimal runtime — Node + the built LibreDWG binaries ─────
FROM node:24-bookworm-slim AS runtime
# Copy the compiled binaries and their shared libs from the builder.
COPY --from=libredwg-builder /usr/local/bin/dwg2dxf /usr/local/bin/dwg2dxf
COPY --from=libredwg-builder /usr/local/bin/dxf2dwg /usr/local/bin/dxf2dwg
COPY --from=libredwg-builder /usr/local/lib /usr/local/lib
RUN ldconfig

# wget for the healthcheck.
RUN apt-get update && apt-get install -y --no-install-recommends wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN corepack enable
COPY apps/dwg-converter/package.json ./package.json
RUN pnpm install --prod --no-frozen-lockfile
COPY apps/dwg-converter/src ./src

ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:8080/health || exit 1
CMD ["node", "src/server.js"]
