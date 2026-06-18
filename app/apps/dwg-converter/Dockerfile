# @modulecad/dwg-converter — runtime image using the Debian libredwg-tools
# package instead of building LibreDWG from source.
#
# Why apt instead of a source build: compiling LibreDWG is memory-heavy
# (~2 GB RAM) and slow (~10-15 min), which is a poor fit for a CI/CD build
# runner like Coolify. The Debian `libredwg-tools` package ships `dwg2dxf`
# and `dxf2dwg` prebuilt for bookworm, turning the build into a seconds-long
# apt install.
#
# GPL boundary: this image bundles LibreDWG (GPL-3), so the image is
# GPL-3.0-or-later. It runs as its own container, never linked into the Nuxt
# process — the "mere aggregation" doctrine. See app/LICENSE and
# app/LICENSES/GPL-3.0-components.md.

FROM node:24-bookworm-slim AS runtime

# Install LibreDWG CLI tools (dwg2dxf, dxf2dwg) from Debian.
# Also wget for the healthcheck.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libredwg-tools wget \
    && rm -rf /var/lib/apt/lists/*

# Verify the binaries are present and fail the build early if not.
RUN dwg2dxf --version >/dev/null 2>&1 && echo "dwg2dxf OK" \
    && dxf2dwg --version >/dev/null 2>&1 && echo "dxf2dwg OK"

WORKDIR /app
RUN corepack enable
COPY apps/dwg-converter/package.json ./package.json
RUN pnpm install --prod --frozen-lockfile || pnpm install --prod
COPY apps/dwg-converter/src ./src

ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:8080/health || exit 1
CMD ["node", "src/server.js"]
