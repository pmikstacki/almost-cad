<template>
  <section class="dashboard">
    <header class="dash-head">
      <h1>Your drawings</h1>
      <UploadButton @uploaded="refresh" />
    </header>

    <p v-if="pending" class="muted">Loading…</p>
    <p v-else-if="!drawings.length" class="muted">
      No drawings yet. Upload a DWG or DXF to get started.
    </p>
    <ul v-else class="drawing-grid">
      <li
        v-for="d in drawings"
        :key="d.id"
        class="drawing-card"
        @click="open(d.id)"
      >
        <div class="thumb">[ {{ d.format.toUpperCase() }} ]</div>
        <div class="meta">
          <div class="name">{{ d.originalFilename }}</div>
          <div class="sub">
            <span class="status" :data-status="d.status">{{ d.status }}</span>
            <span class="mtime">{{ new Date(d.createdAt).toLocaleString() }}</span>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
interface Drawing {
  id: string
  originalFilename: string
  format: string
  status: string
  createdAt: string
}

const drawings = ref<Drawing[]>([])
const pending = ref(true)
const router = useRouter()

function open(id: string) {
  router.push(`/drawings/${id}`)
}

async function refresh() {
  pending.value = true
  try {
    drawings.value = await $fetch<Drawing[]>('/api/drawings')
  } catch {
    drawings.value = []
  } finally {
    pending.value = false
  }
}

onMounted(refresh)
</script>

<style scoped>
.dashboard { max-width: 960px; margin: 0 auto; }
.dash-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 24px;
}
.dash-head h1 { font-size: 22px; margin: 0; }
.muted { color: var(--muted); }
.drawing-grid {
  list-style: none; padding: 0; margin: 0;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}
.drawing-card {
  background: var(--panel); border: 1px solid var(--border);
  border-radius: 8px; overflow: hidden; cursor: pointer;
  transition: border-color 0.15s;
}
.drawing-card:hover { border-color: var(--accent); }
.thumb {
  height: 140px; display: flex; align-items: center; justify-content: center;
  background: #0b0d12; color: var(--muted); font-family: ui-monospace, monospace;
}
.meta { padding: 12px; }
.name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub { display: flex; justify-content: space-between; color: var(--muted); font-size: 12px; margin-top: 6px; }
.status[data-status="ready"] { color: #22c55e; }
.status[data-status="processing"] { color: #eab308; }
.status[data-status="error"] { color: #ef4444; }
</style>
