<template>
  <div class="preview">
    <aside class="preview-grid">
      <header class="grid-head">
        <NuxtLink :to="`/drawings/${drawingId}`" class="back">← Editor</NuxtLink>
        <h2>Plot preview</h2>
        <button
          v-if="modules.length"
          :disabled="exporting"
          class="secondary"
          @click="exportAll"
        >
          {{ exporting ? 'Exporting…' : 'Export (DXF/DWG)' }}
        </button>
        <button :disabled="reordering" @click="saveOrder" v-if="dirty">
          {{ reordering ? 'Saving…' : 'Save order' }}
        </button>
      </header>

      <div v-if="exportLinks" class="export-links">
        <a v-if="exportLinks.dxfUrl" :href="exportLinks.dxfUrl" target="_blank">Download DXF</a>
        <a v-if="exportLinks.dwgUrl" :href="exportLinks.dwgUrl" target="_blank">Download DWG</a>
      </div>
      <p v-if="exportError" class="muted err">{{ exportError }}</p>

      <p v-if="!modules.length" class="muted">
        No modules. Return to the editor to draw some, then Plot.
      </p>
      <ul class="thumbs" v-else>
        <li
          v-for="(m, i) in modules"
          :key="m.id"
          class="thumb-card"
          :class="{ active: m.id === selectedId, dragover: dragOverIndex === i }"
          draggable="true"
          @dragstart="onDragStart(i)"
          @dragover.prevent="onDragOver(i)"
          @dragleave="onDragLeave"
          @drop.prevent="onDrop(i)"
          @dragend="onDragEnd"
          @click="select(m.id)"
        >
          <div class="thumb-img" v-html="m.svg || ''"></div>
          <div class="thumb-foot">
            <span class="thumb-name">{{ m.name }}</span>
            <span class="thumb-idx">#{{ i + 1 }}</span>
          </div>
        </li>
      </ul>
    </aside>

    <!-- Right panel: per-module controls -->
    <section class="right-panel" v-if="selected">
      <header class="panel-head">
        <h3>{{ selected.name }}</h3>
        <div class="panel-actions">
          <button class="secondary" :disabled="plotting" @click="replot">Re-plot</button>
        </div>
      </header>

      <div class="panel-section">
        <h4>Title fields</h4>
        <label v-for="f in titleFields" :key="f.key">
          {{ f.label }}
          <input v-model="selected.titleFieldValues[f.key]" @change="markDirty" />
        </label>
      </div>

      <div class="panel-section">
        <h4>Legend filter</h4>
        <p class="muted small">Include/exclude block names. Re-plot to apply.</p>
        <label
          v-for="b in selected.blockNames"
          :key="b"
          class="check"
        >
          <input
            type="checkbox"
            :checked="!isExcluded(b)"
            @change="toggleExclude(b)"
          />
          <span>{{ b }}</span>
        </label>
      </div>

      <div class="panel-section">
        <h4>Logos</h4>
        <p class="muted small">Logo image wiring lands in Phase 5+.</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { AcApDocManager } from '@mlightcad/cad-simple-viewer'

interface PreviewModule {
  id: string
  name: string
  boundary: { x: number; y: number }[]
  sortOrder: number
  templateId: string
  titleFieldValues: Record<string, string>
  legendFilterOverrides: { includePatterns?: string[]; excludePatterns?: string[] }
  blockNames: string[]
  svg: string
}

const route = useRoute()
const drawingId = String(route.params.id)

const modules = ref<PreviewModule[]>([])
const selectedId = ref<string | null>(null)
const titleFields = ref<{ key: string; label: string }[]>([])
const dirty = ref(false)
const reordering = ref(false)
const plotting = ref(false)
const exporting = ref(false)
const exportLinks = ref<{ dxfUrl: string; dwgUrl: string | null } | null>(null)
const exportError = ref('')

// Drag state for reordering.
const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

const selected = computed(() => modules.value.find((m) => m.id === selectedId.value) ?? null)

onMounted(async () => {
  const [mods, tpls] = await Promise.all([
    $fetch<any[]>(`/api/drawings/${drawingId}/modules`),
    $fetch<any[]>(`/api/templates`)
  ])
  titleFields.value =
    tpls[0]?.titleFields?.map((f: any) => ({ key: f.key, label: f.label })) ?? []
  modules.value = mods.map((m: any) => ({
    id: m.id,
    name: m.name,
    boundary: m.boundary,
    sortOrder: m.sortOrder,
    templateId: m.templateId,
    titleFieldValues: m.titleFieldValues ?? {},
    legendFilterOverrides: m.legendFilterOverrides ?? {},
    blockNames: [],
    svg: ''
  }))
  if (modules.value[0]) {
    selectedId.value = modules.value[0].id
    // Render thumbnails once the viewer's database is available.
    await nextTick()
    renderThumbnails()
  }
})

// ── Thumbnail rendering via cad-svg-plugin (lazy) ─────────────────────
async function renderThumbnails() {
  const doc = AcApDocManager.instance?.curDocument
  if (!doc?.database) {
    // If the editor isn't mounted in this route, thumbnails can't render
    // from the in-memory DB. Phase 5 surfaces a placeholder; Phase 6 export
    // will persist rendered SVGs to RustFS so they're available standalone.
    return
  }
  try {
    const { acdbHostApplicationServices } = await import('@mlightcad/data-model')
    const lm = (acdbHostApplicationServices as any)().layoutManager
    for (const m of modules.value) {
      const layoutName = m.name
      // Best-effort: if the layout exists, render it. cad-svg-plugin exposes
      // a renderer; we guard defensively in case the plugin API differs.
      m.svg = '' // placeholder — actual SVG render via the plugin's AcGiSvgContext
    }
  } catch {
    /* thumbnails are best-effort */
  }
}

// ── Selection ────────────────────────────────────────────────────────
function select(id: string) {
  selectedId.value = id
}

// ── Drag-to-reorder ──────────────────────────────────────────────────
function onDragStart(i: number) {
  dragIndex.value = i
}
function onDragOver(i: number) {
  dragOverIndex.value = i
}
function onDragLeave() {
  dragOverIndex.value = null
}
function onDrop(target: number) {
  const src = dragIndex.value
  dragOverIndex.value = null
  dragIndex.value = null
  if (src === null || src === target) return
  const arr = [...modules.value]
  const [moved] = arr.splice(src, 1)
  arr.splice(target, 0, moved)
  modules.value = arr
  dirty.value = true
}
function onDragEnd() {
  dragIndex.value = null
  dragOverIndex.value = null
}

async function saveOrder() {
  reordering.value = true
  try {
    await $fetch(`/api/drawings/${drawingId}/modules/reorder`, {
      method: 'POST',
      body: { order: modules.value.map((m) => m.id) }
    })
    dirty.value = false
  } finally {
    reordering.value = false
  }
}

// ── Right-panel edits ────────────────────────────────────────────────
function markDirty() {
  dirty.value = true
}
function isExcluded(block: string): boolean {
  return selected.value?.legendFilterOverrides.excludePatterns?.includes(block) ?? false
}
function toggleExclude(block: string) {
  const sel = selected.value
  if (!sel) return
  const ex = new Set(sel.legendFilterOverrides.excludePatterns ?? [])
  if (ex.has(block)) ex.delete(block)
  else ex.add(block)
  sel.legendFilterOverrides.excludePatterns = [...ex]
  markDirty()
}

async function replot() {
  const sel = selected.value
  if (!sel) return
  plotting.value = true
  try {
    // Persist the overrides first.
    await $fetch(`/api/drawings/${drawingId}/modules/${sel.id}`, {
      method: 'PATCH',
      body: {
        titleFieldValues: sel.titleFieldValues,
        legendFilterOverrides: sel.legendFilterOverrides
      }
    })
    // Re-run the engine against the live DB.
    const { plotModule } = useModules()
    const tpls = await $fetch<any[]>(`/api/templates`)
    const tpl = tpls.find((t: any) => t.id === sel.templateId)
    if (!tpl) throw new Error('template not found')
    plotModule(
      {
        id: sel.id,
        drawingId,
        templateId: sel.templateId,
        name: sel.name,
        boundary: sel.boundary,
        viewportZoomPadding: 0,
        legendFilterOverrides: sel.legendFilterOverrides,
        logoOverrides: {},
        titleFieldValues: sel.titleFieldValues,
        sortOrder: sel.sortOrder
      },
      tpl
    )
    // Refresh thumbnail for this module.
    await renderThumbnails()
  } finally {
    plotting.value = false
  }
}

// ── Export (Phase 6): DXF client-side → server → DWG (converter) ──
async function exportAll() {
  exporting.value = true
  exportError.value = ''
  exportLinks.value = null
  try {
    const layoutNames = modules.value.map((m) => m.name)
    const { exportAll: doExport } = useExport()
    const res = await doExport(drawingId, layoutNames)
    exportLinks.value = res
  } catch (e: any) {
    exportError.value = e?.message ?? 'Export failed'
  } finally {
    exporting.value = false
  }
}
</script>

<style scoped>
.preview { display: flex; height: calc(100vh - 56px); }
.preview-grid {
  width: 60%; flex-shrink: 0; display: flex; flex-direction: column;
  border-right: 1px solid var(--border);
}
.grid-head {
  display: flex; align-items: center; gap: 16px; padding: 16px;
  border-bottom: 1px solid var(--border);
}
.grid-head h2 { font-size: 16px; margin: 0; flex: 1; }
.back { font-size: 12px; color: var(--muted); }
.muted { color: var(--muted); padding: 24px; }
.muted.err { color: #ef4444; padding: 12px 16px; }
.export-links { display: flex; gap: 16px; padding: 12px 16px; border-bottom: 1px solid var(--border); }
.panel-actions { display: flex; gap: 8px; }
.small { font-size: 11px; }
.thumbs {
  list-style: none; margin: 0; padding: 16px; overflow-y: auto; flex: 1;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px; align-content: start;
}
.thumb-card {
  background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
  overflow: hidden; cursor: grab; transition: border-color 0.15s, opacity 0.15s;
}
.thumb-card.active { border-color: var(--accent); }
.thumb-card.dragover { opacity: 0.5; border-color: var(--accent); }
.thumb-img {
  height: 160px; background: #0b0d12; display: flex; align-items: center;
  justify-content: center; color: var(--muted); font-size: 11px;
}
.thumb-img :deep(svg) { width: 100%; height: 100%; }
.thumb-foot {
  display: flex; justify-content: space-between; padding: 8px 10px;
  font-size: 12px; border-top: 1px solid var(--border);
}
.thumb-idx { color: var(--muted); }

.right-panel { flex: 1; padding: 24px; overflow-y: auto; }
.panel-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 24px;
}
.panel-head h3 { font-size: 16px; margin: 0; }
.panel-section { margin-bottom: 24px; }
.panel-section h4 { font-size: 12px; text-transform: uppercase; color: var(--muted); margin: 0 0 10px; letter-spacing: 0.04em; }
.panel-section label { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; font-size: 12px; color: var(--muted); }
.panel-section label.check { flex-direction: row; align-items: center; gap: 8px; color: var(--text); }
.panel-section input[type="checkbox"] { width: auto; }
</style>
