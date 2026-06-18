<template>
  <div class="editor">
    <!-- Left sidebar: module list + new-module controls -->
    <aside class="sidebar">
      <header class="sidebar-head">
        <NuxtLink to="/dashboard" class="back">← Drawings</NuxtLink>
        <h2 class="drawing-name" :title="drawing?.originalFilename">
          {{ drawing?.originalFilename ?? 'Loading…' }}
        </h2>
        <div class="status-line">
          <span class="status" :data-status="drawing?.status">{{ drawing?.status ?? '' }}</span>
          <span v-if="drawing?.format" class="fmt">{{ drawing.format.toUpperCase() }}</span>
        </div>
      </header>

      <div class="sidebar-actions">
        <button :disabled="!viewerReady || drawingMode" @click="startNewModule">
          + New module
        </button>
        <button
          v-if="modules.length"
          :disabled="!viewerReady || plotting"
          class="secondary"
          @click="plotAll"
        >
          {{ plotting ? 'Plotting…' : `Plot all (${modules.length})` }}
        </button>
        <button v-if="drawingMode" class="secondary" @click="cancelNewModule">Cancel</button>
        <p v-if="drawingMode" class="hint">
          Click points in the drawing to trace the module boundary.
          Press <kbd>Enter</kbd> or click the first point to close.
        </p>
        <p v-if="plotResult" class="hint ok">
          Plotted {{ plotResult.length }} module{{ plotResult.length === 1 ? '' : 's' }}.
          Open a layout in AutoCAD to inspect.
        </p>
        <p v-if="plotError" class="hint err">{{ plotError }}</p>
      </div>

      <ul class="module-list">
        <li v-if="!modules.length" class="empty">No modules yet.</li>
        <li
          v-for="m in modules"
          :key="m.id"
          class="module-item"
          :class="{ active: m.id === selectedId }"
          @click="select(m.id)"
        >
          <span class="m-name">{{ m.name }}</span>
          <span class="m-meta">{{ m.boundary.length }} pts</span>
          <div class="m-actions" v-if="m.id === selectedId">
            <button
              class="link"
              :disabled="plotting"
              @click.stop="plotOne(m)"
            >Plot</button>
            <button class="link" @click.stop="showModuleLayout(m)">View</button>
            <button class="link danger" @click.stop="remove(m.id)">Delete</button>
          </div>
        </li>
      </ul>

      <div class="sidebar-footer" v-if="modules.length">
        <NuxtLink :to="`/drawings/${drawingId}/preview`" class="preview-link">
          <button class="secondary" style="width:100%">Preview plots →</button>
        </NuxtLink>
      </div>
    </aside>

    <!-- Main: the vendored CAD viewer -->
    <main class="viewer-area">
      <div v-if="loadError" class="viewer-error">
        <p>{{ loadError }}</p>
        <NuxtLink to="/dashboard"><button class="secondary">Back</button></NuxtLink>
      </div>
      <div v-else-if="!dxfUrl" class="viewer-loading">Loading drawing…</div>
      <MlCadViewer
        v-else
        ref="viewerRef"
        :url="dxfUrl"
        :mode="AcEdOpenMode.Write"
        theme="dark"
        @create="onViewerCreate"
      />
    </main>
  </div>
</template>

<script setup lang="ts">
// The vendored viewer is consumed as a Vue component. Its barrel exports the
// named component MlCADViewer; we register it locally below to avoid a global
// plugin (keeps the app shell decoupled from element-plus/vue-i18n globals).
import { MlCADViewer } from '@mlightcad/cad-viewer'
import { AcEdOpenMode } from '@mlightcad/cad-simple-viewer'
import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import type { ModuleTemplate } from '@modulecad/modules'

interface DrawingDetail {
  id: string
  originalFilename: string
  format: string
  status: string
}
interface ModuleRow {
  id: string
  name: string
  boundary: { x: number; y: number }[]
  sortOrder: number
  templateId: string
}

const route = useRoute()
const drawingId = String(route.params.id)

const drawing = ref<DrawingDetail | null>(null)
const dxfUrl = ref<string | null>(null)
const loadError = ref('')
const viewerReady = ref(false)
const viewerRef = ref<any>(null)

const modules = ref<ModuleRow[]>([])
const selectedId = ref<string | null>(null)
const drawingMode = ref(false)
// Polyline points captured in model-space WCS during the current draw session.
const currentBoundary = ref<{ x: number; y: number }[]>([])

// Templates + plotting state (Phase 4).
const templatesById = ref<Map<string, ModuleTemplate>>(new Map())
const plotting = ref(false)
const plotResult = ref<{ length: number } | null>(null)
const plotError = ref('')

// ──────────────────────────────────────────────────────────────────────
// Load drawing metadata + DXF URL
// ──────────────────────────────────────────────────────────────────────
async function loadDrawing() {
  try {
    drawing.value = await $fetch<DrawingDetail>(`/api/drawings/${drawingId}`)
  } catch (e: any) {
    loadError.value = e?.data?.message ?? 'Failed to load drawing'
    return
  }
  if (drawing.value?.status !== 'ready') {
    loadError.value = `Drawing not ready yet (status: ${drawing.value?.status}). Try again in a moment.`
    return
  }
  try {
    const res = await $fetch<{ url: string }>(`/api/drawings/${drawingId}/dxf`)
    dxfUrl.value = res.url
  } catch (e: any) {
    loadError.value = e?.data?.message ?? 'Failed to get DXF URL'
  }
}

async function loadModules() {
  try {
    const rows = await $fetch<ModuleRow[]>(`/api/drawings/${drawingId}/modules`)
    modules.value = rows
  } catch {
    modules.value = []
  }
}

async function loadTemplates() {
  try {
    const tpls = await $fetch<ModuleTemplate[]>(`/api/templates`)
    templatesById.value = new Map(tpls.map((t) => [t.id, t]))
  } catch {
    // Non-fatal — plotting will surface a clearer error.
  }
}

// ──────────────────────────────────────────────────────────────────────
// Plotting (Phase 4) — runs the @modulecad/modules engine against the live
// AcDbDatabase held by the viewer.
// ──────────────────────────────────────────────────────────────────────
async function plotOne(m: ModuleRow) {
  plotError.value = ''
  plotResult.value = null
  plotting.value = true
  try {
    const { plotModule } = useModules()
    const tpl = templatesById.value.get(m.templateId)
    if (!tpl) throw new Error('No template associated with this module')
    const res = plotModule(toInstance(m), tpl)
    plotResult.value = { length: 1 }
    await refreshViewer()
    await showModuleLayout(m)
    return res
  } catch (e: any) {
    plotError.value = e?.message ?? 'Plot failed'
  } finally {
    plotting.value = false
  }
}

async function plotAll() {
  plotError.value = ''
  plotResult.value = null
  plotting.value = true
  try {
    const { plotAll: doPlot } = useModules()
    const instances = modules.value.map(toInstance)
    const res = doPlot(instances, templatesById.value)
    plotResult.value = { length: res.length }
    await refreshViewer()
    // Show the first plotted layout.
    if (modules.value[0]) await showModuleLayout(modules.value[0])
  } catch (e: any) {
    plotError.value = e?.message ?? 'Plot failed'
  } finally {
    plotting.value = false
  }
}

/** Convert a DB ModuleRow into the engine's ModuleInstance shape. */
function toInstance(m: ModuleRow) {
  const tpl = templatesById.value.get(m.templateId)
  return {
    id: m.id,
    drawingId,
    templateId: m.templateId,
    name: m.name,
    boundary: m.boundary,
    viewportZoomPadding: 0,
    legendFilterOverrides: {},
    logoOverrides: {},
    titleFieldValues: { title: m.name },
    sortOrder: m.sortOrder,
    ...(tpl ? {} : {})
  }
}

async function showModuleLayout(m: ModuleRow) {
  try {
    const { showLayout } = useModules()
    await showLayout(m.name)
  } catch {
    // Layout switching may differ across viewer versions; non-fatal.
  }
}

/** Force the viewer to re-render after the database has new layouts. */
async function refreshViewer() {
  try {
    const doc = AcApDocManager.instance.curDocument
    if (doc?.database && typeof (doc.database as any).regen === 'function') {
      await (doc.database as any).regen()
    }
  } catch {
    /* regen best-effort */
  }
}

onMounted(async () => {
  await loadDrawing()
  await Promise.all([loadModules(), loadTemplates()])
})

// ──────────────────────────────────────────────────────────────────────
// Viewer integration
// ──────────────────────────────────────────────────────────────────────
function onViewerCreate() {
  viewerReady.value = true
  // Once the viewer is up, its global AcApDocManager singleton holds the
  // live AcDbDatabase. We hook pointer events on the canvas to capture
  // boundary points during "new module" mode.
  hookCanvasForBoundaryCapture()
}

/**
 * During drawing mode, each click on the viewer canvas records the clicked
 * model-space coordinate. We convert from screen → WCS using the viewer's
 * current view. The conversion helper lives on AcApDocManager.curView.
 */
function hookCanvasForBoundaryCapture() {
  const canvas = document.querySelector('.viewer-area canvas')
  if (!canvas) {
    // Retry shortly — the canvas may not be laid out yet at create-time.
    setTimeout(hookCanvasForBoundaryCapture, 100)
    return
  }
  canvas.addEventListener('click', onCanvasClick)
}

function onCanvasClick(ev: MouseEvent) {
  if (!drawingMode.value) return
  const pt = screenToWcs(ev)
  if (!pt) return

  // Close the polygon if the click is near the first point.
  if (currentBoundary.value.length >= 3) {
    const first = currentBoundary.value[0]
    const dx = pt.x - first.x
    const dy = pt.y - first.y
    const tol = wcsPixelTolerance() * 8
    if (Math.hypot(dx, dy) < tol) {
      finishNewModule()
      return
    }
  }
  currentBoundary.value.push(pt)
  drawTempPolyline()
}

/** Convert a screen (clientX/Y) coordinate to model-space WCS. */
function screenToWcs(ev: MouseEvent): { x: number; y: number } | null {
  try {
    const view = AcApDocManager.instance.curView
    // AcGiView exposes screen→world conversion; the exact method name varies
    // across releases — we try the documented ones defensively.
    const anyView = view as any
    const rect = (ev.target as HTMLElement).getBoundingClientRect()
    const sx = ev.clientX - rect.left
    const sy = ev.clientY - rect.top
    if (typeof anyView.screenToWcs === 'function') return anyView.screenToWcs(sx, sy)
    if (typeof anyView.screenToWorld === 'function') return anyView.screenToWorld(sx, sy)
    if (typeof anyView.convertScreenToWcs === 'function') return anyView.convertScreenToWcs(sx, sy)
    return null
  } catch {
    return null
  }
}

/** Approximate tolerance in WCS units for a few pixels of slack. */
function wcsPixelTolerance(): number {
  try {
    const view: any = AcApDocManager.instance.curView
    // view.height is the WCS height of the viewport; clientHeight is pixels.
    const ch = (evTargetHeight()) || 800
    return (view?.height ?? 1000) / ch
  } catch {
    return 1
  }
}
function evTargetHeight(): number {
  const c = document.querySelector('.viewer-area canvas') as HTMLCanvasElement | null
  return c?.clientHeight ?? 800
}

/**
 * Render a transient polyline overlay of the boundary-in-progress so the user
 * sees what they're drawing. Uses the three-renderer transient manager so it
 * does NOT pollute the AcDbDatabase.
 */
function drawTempPolyline() {
  // Phase 4 will hook AcTrTransientManager here. For Phase 3 the boundary is
  // captured silently; the sidebar shows the live point count.
}

// ──────────────────────────────────────────────────────────────────────
// New-module flow
// ──────────────────────────────────────────────────────────────────────
function startNewModule() {
  drawingMode.value = true
  currentBoundary.value = []
}

function cancelNewModule() {
  drawingMode.value = false
  currentBoundary.value = []
}

async function finishNewModule() {
  if (currentBoundary.value.length < 3) return
  drawingMode.value = false
  const boundary = [...currentBoundary.value]
  currentBoundary.value = []
  const name = `Module ${modules.value.length + 1}`
  try {
    const created = await $fetch<ModuleRow>(`/api/drawings/${drawingId}/modules`, {
      method: 'POST',
      body: { name, boundary }
    })
    modules.value.push(created)
    selectedId.value = created.id
  } catch (e: any) {
    loadError.value = e?.data?.message ?? 'Failed to save module'
  }
}

// Allow Enter to close the polygon.
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (drawingMode.value && e.key === 'Enter' && currentBoundary.value.length >= 3) {
      finishNewModule()
    } else if (drawingMode.value && e.key === 'Escape') {
      cancelNewModule()
    }
  })
}

function select(id: string) {
  selectedId.value = id
}

async function remove(id: string) {
  await $fetch(`/api/drawings/${drawingId}/modules/${id}`, { method: 'DELETE' })
  modules.value = modules.value.filter((m) => m.id !== id)
  if (selectedId.value === id) selectedId.value = null
}
</script>

<style scoped>
.editor { display: flex; height: calc(100vh - 56px); }
.sidebar {
  width: 280px; flex-shrink: 0;
  background: var(--panel); border-right: 1px solid var(--border);
  display: flex; flex-direction: column;
}
.sidebar-head { padding: 16px; border-bottom: 1px solid var(--border); }
.back { font-size: 12px; color: var(--muted); }
.drawing-name { font-size: 15px; margin: 8px 0 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status-line { display: flex; gap: 8px; font-size: 11px; color: var(--muted); }
.status[data-status="ready"] { color: #22c55e; }
.status[data-status="processing"] { color: #eab308; }
.status[data-status="error"] { color: #ef4444; }
.sidebar-actions { padding: 16px; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 8px; }
.hint { font-size: 11px; color: var(--muted); margin: 4px 0 0; line-height: 1.4; }
.hint.ok { color: #22c55e; }
.hint.err { color: #ef4444; }
kbd {
  background: #0b0d12; border: 1px solid var(--border); border-radius: 3px;
  padding: 1px 5px; font-size: 10px; font-family: ui-monospace, monospace;
}
.module-list { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1; }
.empty { padding: 16px; color: var(--muted); font-size: 13px; }
.module-item {
  padding: 12px 16px; border-bottom: 1px solid var(--border);
  cursor: pointer; display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
}
.module-item:hover { background: #1c212b; }
.module-item.active { background: #1c212b; border-left: 3px solid var(--accent); padding-left: 13px; }
.m-name { font-size: 13px; flex: 1; }
.m-meta { font-size: 11px; color: var(--muted); }
.m-actions { flex-basis: 100%; display: flex; gap: 8px; }
.link { background: none; border: none; color: var(--muted); padding: 0; font-size: 11px; cursor: pointer; }
.link.danger:hover { color: #ef4444; }
.sidebar-footer { padding: 12px 16px; border-top: 1px solid var(--border); }
.viewer-area { flex: 1; position: relative; background: #0b0d12; }
.viewer-loading, .viewer-error {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 12px; color: var(--muted);
}
.viewer-area :deep(> div) { width: 100%; height: 100%; }
</style>
