import type { Drawing, ModuleRow, JobStatus } from '~~/shared/types'
import { ApiException } from '~~/shared/types'

/**
 * Typed API client — single entry point for all backend communication.
 *
 * - Every method has a typed return, so the UI is statically checked against
 *   the actual server contract (shared/types.ts).
 * - Errors are normalized into ApiException with an `auth` flag (401/403) so
 *   the UI can redirect to /login vs display an inline error.
 * - On 401, the session is cleared and we navigate to /login (centralized —
 *   pages don't each need to handle it).
 *
 * Usage:
 *   const api = useApi()
 *   const drawings = await api.drawings.list()
 *   const job = await api.drawings.upload(file)
 */
export function useApi() {
  const router = useRouter()

  async function request<T>(
    url: string,
    opts: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown } = {}
  ): Promise<T> {
    try {
      return await $fetch<T>(url, {
        method: opts.method ?? 'GET',
        body: opts.body as any
      })
    } catch (e: any) {
      const status = e?.response?.status ?? e?.statusCode ?? 0
      const msg =
        e?.response?._data?.message ??
        e?.response?._data?.statusMessage ??
        e?.message ??
        'Request failed'
      const auth = status === 401 || status === 403
      // Centralized session-expiry handling: clear + redirect.
      if (auth) {
        const { signOut } = useAuth()
        await signOut().catch(() => {})
        router.push('/login')
      }
      throw new ApiException(status, msg, auth)
    }
  }

  return {
    drawings: {
      /** List the signed-in user's drawings. */
      list: () => request<Drawing[]>('/api/drawings'),

      /** Get one drawing. */
      get: (id: string) => request<Drawing>(`/api/drawings/${id}`),

      /** Get a presigned DXF URL for the viewer. */
      dxfUrl: (id: string) =>
        request<{ url: string; status: string; format: string; hash?: string }>(
          `/api/drawings/${id}/dxf`
        ),

      /** Request a presigned upload URL + create a drawing row. */
      presign: (filename: string, contentType: string, format: 'dwg' | 'dxf') =>
        request<{ uploadUrl: string; key: string; drawingId: string }>(
          '/api/uploads/presign',
          { method: 'POST', body: { filename, contentType, format } }
        ),

      /** Finalize an upload: verify, hash, promote, kick off conversion. */
      finalize: (id: string) =>
        request<{ status: string; jobId: string }>(`/api/drawings/${id}/finalize`, {
          method: 'POST'
        }),

      /** Full export: serialize DXF → server → DWG (converter) + PDF. */
      exportAll: (id: string, dxf: string, layoutNames: string[]) =>
        request<{ dxfUrl: string; dwgUrl: string | null; pdfUrl: string | null }>(
          `/api/drawings/${id}/export`,
          { method: 'POST', body: { dxf, layoutNames } }
        )
    },

    modules: {
      list: (drawingId: string) =>
        request<ModuleRow[]>(`/api/drawings/${drawingId}/modules`),
      create: (drawingId: string, body: { name: string; boundary: { x: number; y: number }[] }) =>
        request<ModuleRow>(`/api/drawings/${drawingId}/modules`, {
          method: 'POST',
          body
        }),
      update: (drawingId: string, moduleId: string, body: Partial<ModuleRow>) =>
        request<ModuleRow>(`/api/drawings/${drawingId}/modules/${moduleId}`, {
          method: 'PATCH',
          body
        }),
      remove: (drawingId: string, moduleId: string) =>
        request<{ ok: boolean }>(`/api/drawings/${drawingId}/modules/${moduleId}`, {
          method: 'DELETE'
        }),
      reorder: (drawingId: string, order: string[]) =>
        request<{ ok: boolean }>(`/api/drawings/${drawingId}/modules/reorder`, {
          method: 'POST',
          body: { order }
        })
    }
  }
}

// Re-export the status type for convenience in components.
export type { Drawing, ModuleRow, JobStatus }
