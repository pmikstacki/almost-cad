import { test, expect, request as apiRequest } from '@playwright/test'
import { uniqueUser, signUp, userIdFor } from './helpers/auth'
import { resetDb, createDrawing } from './helpers/db'

/**
 * DXF + DWG export — POST /api/drawings/:id/export.
 *
 * Exercises A6: the response shape is { dxfUrl, dwgUrl } with NO pdfUrl.
 * The server uploads the client-provided DXF to RustFS and dispatches DWG
 * conversion; the DXF download must work immediately, the DWG may 404 until
 * the converter finishes (polled up to N seconds).
 *
 * Each test uses a fresh APIRequestContext for cookie isolation.
 */
test.describe('POST /api/drawings/:id/export', () => {
  test.beforeEach(async () => {
    await resetDb()
  })

  async function authedUser() {
    const ctx = await apiRequest.newContext()
    const { cookie } = await signUp(ctx, uniqueUser())
    const userId = await userIdFor(ctx, cookie)
    return { ctx, cookie, userId }
  }

  test('returns dxfUrl + dwgUrl, no pdfUrl (A6)', async () => {
    const { ctx, cookie, userId } = await authedUser()
    const drawing = await createDrawing(userId)
    const res = await ctx.post(`/api/drawings/${drawing.id}/export`, {
      headers: { cookie },
      data: {
        dxf: '0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n',
        layoutNames: ['Layout1']
      }
    })
    expect(res.status(), 'export must not 500').toBeLessThan(500)
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body.dxfUrl).toBeTruthy()
    expect(body.dwgUrl).toBeTruthy()
    // A6: PDF was dropped — pdfUrl must not be present.
    expect(body).not.toHaveProperty('pdfUrl')
    await ctx.dispose()
  })

  test('the presigned DXF URL fetches the uploaded bytes', async () => {
    const { ctx, cookie, userId } = await authedUser()
    const drawing = await createDrawing(userId)
    const payload = '0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n'
    const res = await ctx.post(`/api/drawings/${drawing.id}/export`, {
      headers: { cookie },
      data: { dxf: payload, layoutNames: ['Layout1'] }
    })
    const { dxfUrl } = await res.json()

    const fetched = await ctx.get(dxfUrl)
    expect(fetched.status()).toBe(200)
    const text = await fetched.text()
    expect(text).toBe(payload)
    await ctx.dispose()
  })

  test('rejects empty DXF payload (400, not 500)', async () => {
    const { ctx, cookie, userId } = await authedUser()
    const drawing = await createDrawing(userId)
    const res = await ctx.post(`/api/drawings/${drawing.id}/export`, {
      headers: { cookie },
      data: { layoutNames: ['Layout1'] }
    })
    expect(res.status()).toBe(400)
    await ctx.dispose()
  })
})
