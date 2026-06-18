# moduleCad

Module-based CAD plotting — an open-source fork of
[`mlightcad/cad-viewer`](https://github.com/mlightcad/cad-viewer).

Open a DWG, draw **modules** over the parts that matter, click **Plot**, and
moduleCad generates professional paper-space layouts — each with a clipped
zoomed viewport and a right vertical stack of logos and an auto-counted legend
table. Everything is real AcDb geometry that opens natively in AutoCAD.

> **Status:** Phase 0 (scaffold) complete. Auth, storage, the DWG pipeline,
> and the modules feature land in subsequent phases. See
> [`CHANGELOG.md`](./CHANGELOG.md) and [`GUIDE.md`](./GUIDE.md).

## Docs

- [`GUIDE.md`](./GUIDE.md) — architecture, service map, dev setup, license boundaries
- [`GLOSSARY.md`](./GLOSSARY.md) — what "Module", "Plot", "Layout", etc. mean here
- [`UPSTREAM.md`](./UPSTREAM.md) — fork relationship with mlightcad/cad-viewer
- [`CHANGELOG.md`](./CHANGELOG.md) — per Keep a Changelog

## Quick start

```bash
cd app
pnpm install
pnpm build
pnpm dev        # upstream viewer demo
```

## License

GPL-3.0-or-later. See [`app/LICENSE`](./app/LICENSE). Vendored upstream
portions retain their MIT origin (see
[`app/LICENSES/MIT-upstream.txt`](./app/LICENSES/MIT-upstream.txt)).
