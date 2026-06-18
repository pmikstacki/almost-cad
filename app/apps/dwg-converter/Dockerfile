# Multi-stage build for @modulecad/dwg-converter.
#
# Two things make this image GPL-isolated from the rest of the stack:
#   1. It bundles native LibreDWG (dwg2dxf / dxf2dwg) — GPL-3.
#   2. It runs as its own container, never linked into the Nuxt process.
# The image is therefore GPL-3.0-or-later; see app/LICENSE.

# Stage 1: build LibreDWG from source on a Debian base (Alpine's musl build
# is fragile; Debian's glibc build is the well-trodden path).
FROM debian:bookworm-slim AS libredwg-builder
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential autoconf automake libtool git texinfo \
      swig pkg-config libpcre2-dev && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /opt
RUN git clone --depth 1 https://gitlab.com/LibreDWG/libredwg.git && \
    cd libredwg && \
    sh autogen.sh && \
    ./configure --disable-bindings --prefix=/usr/local && \
    make -j"$(nproc)" && \
    make install && \
    ldconfig

# Stage 2: runtime — Node + the built LibreDWG binaries.
FROM node:24-bookworm-slim AS runtime
# Copy LibreDWG binaries (dwg2dxf, dxf2dwg) and shared libs from the builder.
COPY --from=libredwg-builder /usr/local/bin/dwg2dxf /usr/local/bin/dwg2dxf
COPY --from=libredwg-builder /usr/local/bin/dxf2dwg /usr/local/bin/dxf2dwg
COPY --from=libredwg-builder /usr/local/lib /usr/local/lib
RUN ldconfig

WORKDIR /app
RUN corepack enable
COPY apps/dwg-converter/package.json ./package.json
RUN pnpm install --prod --frozen-lockfile || pnpm install --prod
COPY apps/dwg-converter/src ./src

ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://localhost:8080/health || exit 1
CMD ["node", "src/server.js"]
