<template>
  <div class="upload">
    <input
      ref="fileInput"
      type="file"
      accept=".dwg,.dxf"
      @change="onChange"
      hidden
    />
    <button @click="pick" :disabled="busy">
      {{ busy ? 'Uploading…' : 'Upload DWG/DXF' }}
    </button>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
const emit = defineEmits<{ uploaded: [] }>()

const fileInput = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const error = ref('')

function pick() {
  error.value = ''
  fileInput.value?.click()
}

async function onChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  busy.value = true
  error.value = ''
  try {
    // Phase 2 flow: ask the server for a presigned PUT, then upload directly
    // to RustFS. The server records the drawing row. Until Phase 2 lands,
    // this endpoint will 501 and we surface a clear message.
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const format = ext === 'dwg' ? 'dwg' : 'dxf'

    const presign = await $fetch<{
      uploadUrl: string
      key: string
      drawingId: string
    }>('/api/uploads/presign', {
      method: 'POST',
      body: {
        filename: file.name,
        contentType: 'application/octet-stream',
        format
      }
    })

    await $fetch(presign.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': 'application/octet-stream' }
    })

    await $fetch(`/api/drawings/${presign.drawingId}/finalize`, {
      method: 'POST'
    })

    emit('uploaded')
    input.value = ''
  } catch (e: any) {
    error.value =
      e?.data?.message ??
      e?.message ??
      'Upload failed (storage pipeline lands in Phase 2)'
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.upload { display: inline-flex; flex-direction: column; gap: 4px; }
.error { color: #ef4444; font-size: 12px; margin: 0; }
</style>
