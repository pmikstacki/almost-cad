/**
 * In-memory job tracker for DWG conversion progress.
 *
 * Phase 2 keeps this simple: a per-job event emitter that the SSE route
 * (`/api/jobs/[id]/events`) subscribes to, and the converter callback
 * (`/api/jobs/[id]/update`) pushes events onto. Phase 7 may swap this for
 * Redis Pub/Sub if we run multiple `web` replicas behind Coolify.
 *
 * Each job also persists status to the drawings row, so a refresh doesn't
 * lose state even if the emitter is gone (e.g. after a redeploy).
 */
import type { H3Event } from 'h3'

export interface JobEvent {
  status: 'queued' | 'converting' | 'ready' | 'error'
  message?: string
  progress?: number // 0..1
  ts: string
}

type Listener = (event: JobEvent) => void

const jobs = new Map<string, Set<Listener>>()

export function subscribe(jobId: string, fn: Listener): () => void {
  if (!jobs.has(jobId)) jobs.set(jobId, new Set())
  jobs.get(jobId)!.add(fn)
  return () => {
    jobs.get(jobId)?.delete(fn)
  }
}

export function emit(jobId: string, event: JobEvent): void {
  jobs.get(jobId)?.forEach((fn) => fn(event))
}

/** Stream job events to an SSE client until the job reaches a terminal state. */
export async function streamJobEvents(event: H3Event, jobId: string): Promise<void> {
  // h3 / Nitro provide createEventStream for SSE. We push our JobEvents onto it.
  // Lazy-import to avoid pulling nitro internals at module load.
  const { createEventStream } = await import('h3')
  const stream = createEventStream(event)

  const unsubscribe = subscribe(jobId, (je) => {
    stream.push({ event: 'job', data: JSON.stringify(je) })
    if (je.status === 'ready' || je.status === 'error') {
      stream.close()
    }
  })

  // When the client disconnects, clean up.
  stream.onClosed(() => {
    unsubscribe()
  })

  // Initiate the stream response: sets 200 + text/event-stream headers and
  // pipes the underlying ReadableStream to the response. WITHOUT this call h3
  // returns 204 No Content and the client never receives events — the SSE
  // route was silently broken (returned 204) before this was added.
  await stream.send()
}
