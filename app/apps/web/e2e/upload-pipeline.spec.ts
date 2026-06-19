import { test, expect, request as apiRequest } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { uniqueUser, signUp } from './helpers/auth'
import { resetDb } from './helpers/db'

const here = dirname(fileURLToPath(import.meta.url))
const sampleDxf = readFileSync(join(here, 'fixtures', 'sample.dxf'))

/**
 * The full upload → finalize → convert pipeline.
 *
 *   presign → browser PUT to RustFS → /finalize (HEAD/hash/copy/dispatch)
 *   → for DXF: status flips to 'ready' immediately
 *   → for DWG: converter callback flips 'processing' → 'ready'
 *
 * The DXF path is deterministic and exercises the entire storage + DB + SSE
 * emit machinery. The DWG path additionally exercises the converter callback
 * (A2: WEB_INTERNAL_URL) — but LibreDWG's fidelity on the tiny test fixture
 * varies, so we assert the pipeline *progressed* rather than hard-failing on
 * a conversion quirk.
 *
 * Each test uses a fresh APIRequestContext for cookie isolation.
 */
test.describe('upload → finalize → convert', () => {
  test.beforeEach(async () => {
    await resetDb()
  })

  async function authedCtx() {
    const ctx = await apiRequest.newContext()
    const { cookie } = await signUp(ctx, uniqueUser())
    return { ctx, cookie }
  }

  test('DXF upload finalizes to status=ready', async () => {
    const { ctx, cookie } = await authedCtx()
    // 1. Presign.
    const presign = await ctx.post('/api/uploads/presign', {
      headers: { cookie },
      data: { filename: 'sample.dxf', contentType: 'application/dxf', format: 'dxf' }
    })
    expect(presign.status(), 'presign must not 500').toBeLessThan(500)
    expect(presign.status()).toBe(200)
    const { uploadUrl, drawingId } = await presign.json()
    expect(uploadUrl).toBeTruthy()
    expect(drawingId).toBeTruthy()

    // 2. PUT the file directly to RustFS via the presigned URL (bypasses Nuxt).
    //    Use a bare context so the auth cookie doesn't get sent to RustFS.
    const putCtx = await apiRequest.newContext()
    const put = await putCtx.put(uploadUrl, {
      data: sampleDxf,
      headers: { 'content-type': 'application/dxf' }
    })
    expect(put.status()).toBe(200)
    await putCtx.dispose()

    // 3. Finalize.
    const finalize = await ctx.post(`/api/drawings/${drawingId}/finalize`, {
      headers: { cookie }
    })
    expect(finalize.status(), 'finalize must not 500').toBeLessThan(500)
    const finalizeBody = await finalize.json()
    expect(finalizeBody.status).toBe('ready')

    // 4. The drawing row reflects ready.
    const detail = await ctx.get(`/api/drawings/${drawingId}`, { headers: { cookie } })
    const drawing = await detail.json()
    expect(drawing.status).toBe('ready')

    // 5. GET /dxf returns a presigned URL that fetches the original bytes.
    const dxf = await ctx.get(`/api/drawings/${drawingId}/dxf`, { headers: { cookie } })
    expect(dxf.status()).toBe(200)
    const { url } = await dxf.json()
    const fetchCtx = await apiRequest.newContext()
    const fetchedOk = await fetchCtx.get(url)
    expect(fetchedOk.status()).toBe(200)
    await fetchCtx.dispose()
    await ctx.dispose()
  })

  test('finalize without uploading the object fails cleanly (422, not 500)', async () => {
    const { ctx, cookie } = await authedCtx()
    const presign = await ctx.post('/api/uploads/presign', {
      headers: { cookie },
      data: { filename: 'missing.dxf', contentType: 'application/dxf', format: 'dxf' }
    })
    const { drawingId } = await presign.json()

    // Don't PUT anything — finalize should find no object and 422.
    const finalize = await ctx.post(`/api/drawings/${drawingId}/finalize`, {
      headers: { cookie }
    })
    expect(finalize.status()).toBe(422)
    await ctx.dispose()
  })

  test('DWG upload dispatches the converter callback path', async () => {
    const { ctx, cookie } = await authedCtx()
    // Presign a DWG (we send the DXF bytes; the converter will attempt
    // dwg2dxf on them — it may succeed or fail depending on LibreDWG's
    // tolerance. The point is to exercise the dispatch + callback wiring).
    const presign = await ctx.post('/api/uploads/presign', {
      headers: { cookie },
      data: { filename: 'sample.dwg', contentType: 'application/octet-stream', format: 'dwg' }
    })
    const { uploadUrl, drawingId } = await presign.json()

    const putCtx = await apiRequest.newContext()
    await putCtx.put(uploadUrl, {
      data: sampleDxf, // bytes; format flag is what matters for routing
      headers: { 'content-type': 'application/octet-stream' }
    })
    await putCtx.dispose()

    const finalize = await ctx.post(`/api/drawings/${drawingId}/finalize`, {
      headers: { cookie }
    })
    expect(finalize.status(), 'finalize must not 500').toBeLessThan(500)
    const body = await finalize.json()
    // DWG path returns 'processing' — the converter will call back.
    expect(body.status).toBe('processing')

    // Poll the drawing until it leaves 'processing' (converter callback fires).
    // Cap at ~40s; LibreDWG on a non-DWG payload may error, which is fine —
    // we just need to confirm the callback wiring moved the status.
    let status = 'processing'
    for (let i = 0; i < 40 && status === 'processing'; i++) {
      await new Promise((r) => setTimeout(r, 1000))
      const detail = await ctx.get(`/api/drawings/${drawingId}`, { headers: { cookie } })
      status = (await detail.json()).status
    }
    // 'ready' = converter succeeded; 'error' = converter ran but failed.
    // Either proves the WEB_INTERNAL_URL callback reached us.
    expect(['ready', 'error']).toContain(status)
    expect(status, 'converter callback never fired (check WEB_INTERNAL_URL)').not.toBe('processing')
    await ctx.dispose()
  })
})
