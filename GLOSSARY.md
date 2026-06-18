# GLOSSARY — moduleCad

Terms established with the user for this project. Update as new terms are
agreed. Cross-references use `→`.

## Module

A named closed **boundary** drawn over model space that becomes a **plot
target**. Drawing a module declares "this region matters"; plotting it
auto-generates a paper-space **Layout** for that region. The module itself is
*metadata* (a polygon + a name + settings); the **Layout** it produces is *real
AcDb geometry* inside the drawing.

See also: **Module Template**, **Module Instance**, **Boundary**, **Plot**.

## Module Template

A reusable sheet standard — paper size, orientation, margins, viewport ratio,
title-block field definitions, **logo slots**, legend column schema, and
default legend filters. Stored in Postgres and applied to many drawings.
Example: "A1 Landscape — Company Title Block".

See also: **Logo Slot**, **Legend Stack**, **Right Vertical Stack**.

## Module Instance

A specific module drawn on a specific drawing. Stores the boundary polygon
(in model-space WCS), per-instance overrides (legend filters, logo images,
title field values), and sort order. Linked to the generated **Layout** by
name inside the drawing file.

## Boundary

The closed polygon (a `BoundaryPolygon = {x,y}[]` in model-space WCS) that
defines which part of the drawing a **Module** covers. Used both to clip the
generated **AcDbViewport** and to scope the **Block Count** for the legend.

## Plot

The act of generating a paper-space **AcDbLayout** from a **Module Instance**
plus its **Module Template**. Produces real AcDb geometry (viewport, title
block, logos, legend table) that opens natively in AutoCAD. "Plot All"
generates one Layout per Module Instance in the drawing.

## Layout (AcDbLayout)

The AutoCAD ObjectARX paper-space concept (vendored from
`@mlightcad/data-model`). Each **Module Instance** maps to exactly one
`AcDbLayout` inside the drawing. The layout holds the title-block border,
the clipped viewport, the logos, and the legend table.

## Right Vertical Stack

The right-hand portion of a generated **Layout** (width = sheet width ×
(1 − viewportRatio.width)). Contains, top to bottom: title-block fields,
**Logo Slots**, and the **Legend Stack**. The left portion is the zoomed
**AcDbViewport**.

## Logo Slot

A reserved rectangle in the **Right Vertical Stack** for a logotype image,
rendered as a real `AcDbRasterImage` + `AcDbRasterImageDef` pair. Backed by
a RustFS object key (e.g. `logos/<hash>.png`).

## Legend Stack

The `AcDbTable` entity placed in the **Right Vertical Stack** that lists each
distinct block type found inside the module **Boundary**. Default columns:
thumbnail | block name | count. Each thumbnail cell contains a scaled native
`AcDbBlockReference` insert — the block itself is the thumbnail, so it is
always accurate and round-trips through DWG/DXF perfectly.

## Block Count

The tally of `AcDbBlockReference` insertions whose insertion point falls
inside a module **Boundary** (point-in-polygon test), grouped by
`AcDbBlockTableRecord.name`. Feeds the **Legend Stack**. Filterable via the
template's default filters and per-instance overrides.

## dwg-converter

A separate GPL-3-licensed HTTP microservice (in `app/apps/dwg-converter/`)
that wraps native LibreDWG CLI tools (`dwg2dxf`, `dxf2dwg`). Reads from and
writes to RustFS directly. Kept as its own process so the GPL code is isolated
(the "mere aggregation" doctrine), even though the fork is GPL-3 anyway.

## RustFS origin

The S3-compatible object store (Apache-2.0, beta) that holds uploaded
drawings, converted DXF/DWG/PDF outputs, SVG preview thumbnails, and
logotype images. Addressed by the `web` service over the internal Docker
network, and by browsers via presigned URLs against its public FQDN.

## Coolify

The self-hosted PaaS used to deploy the whole stack. Uses Docker Compose as
its build pack and Traefik as its reverse proxy with automatic Let's Encrypt
SSL. `SERVICE_FQDN_WEB` and `SERVICE_FQDN_RUSTFS` are the two public
services; `postgres` and `dwg-converter` are internal-only.
