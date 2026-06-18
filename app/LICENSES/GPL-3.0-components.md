# License Inventory for GPL-licensed Components

moduleCad as a whole is licensed under GPL-3.0-or-later (see `/LICENSE`).
The DWG read/write path additionally depends on the following GPL-licensed
upstream components. These are used either in-browser (web workers) or in the
separate `dwg-converter` microservice. The fork's GPL-3.0 license is
compatible with all of these.

## Components

| Component | License | Used by | Upstream |
|---|---|---|---|
| `@mlightcad/libredwg-web` | GPL-3.0 | viewer (web worker, DWG parse) | https://github.com/mlightcad/libredwg-web |
| `@mlightcad/libredwg-converter` | GPL-3.0 | viewer (web worker, DWG→data-model) | https://github.com/mlightcad/realdwg-web |
| `@mlightcad/dxf-json-converter` | GPL-3.0 | viewer (web worker, DXF→JSON) | https://github.com/mlightcad/realdwg-web |
| `@mlightcad/libdxfrw-converter` | GPL-2.0 | viewer (web worker, DXF parse) | https://github.com/mlightcad/realdwg-web |
| `@mlightcad/libdxfrw-web` | GPL-2.0-only | viewer (web worker) | https://github.com/mlight-lee/libdxfrw |
| LibreDWG (`dwg2dxf`, `dxf2dwg`) | GPL-3.0 | `dwg-converter` service | https://gitlab.com/LibreDWG/libredwg |
| libdxfrw | GPL-2.0+ | `dwg-converter` service | https://github.com/LibreDWG/libdxfrw |

## MIT-licensed dependencies (compatible, no copyleft obligation)

| Component | License | Upstream |
|---|---|---|
| `@mlightcad/cad-viewer` | MIT | https://github.com/mlightcad/cad-viewer |
| `@mlightcad/cad-simple-viewer` | MIT | https://github.com/mlightcad/cad-viewer |
| `@mlightcad/three-renderer` | MIT | https://github.com/mlightcad/cad-viewer |
| `@mlightcad/data-model` | MIT | https://github.com/mlightcad/realdwg-web |
| `@mlightcad/geometry-engine` | MIT | https://github.com/mlightcad/realdwg-web |
| `@mlightcad/graphic-interface` | MIT | https://github.com/mlightcad/realdwg-web |
| `@mlightcad/common` | MIT | https://github.com/mlightcad/realdwg-web |

## License boundary note

The upstream maintainer deliberately runs GPL parsers in separate web-worker
bundles to keep them isolated from the main application bundle. moduleCad
preserves this pattern. For server-side conversion, LibreDWG runs in the
dedicated `dwg-converter` container as an independent process boundary — the
"mere aggregation" doctrine — so the GPL obligation is satisfied by the
GPL-3.0 licensing of that service (and the whole repo).
