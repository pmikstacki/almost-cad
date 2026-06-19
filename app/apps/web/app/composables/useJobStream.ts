import type { JobEvent, JobStatus } from '~~/shared/types'
import { TERMINAL_JOB_STATES } from '~~/shared/types'

/**
 * Reactive SSE subscription to a conversion job's progress.
 *
 * Usage:
 *   const job = useJobStream(jobId)
 *   // job.status.value  -> 'connecting' | 'queued' | 'converting' | 'ready' | 'error'
 *   // job.progress.value -> 0..1
 *   // job.message.value  -> human-readable status line
 *   await job.open()    // start streaming
 *   job.close()         // stop (auto-called on terminal status + unmount)
 *
 * Backend contract (server/api/jobs/[id]/events.get.ts):
 *   event: 'job'
 *   data:  JSON.stringify(JobEvent)
 *   The stream closes itself on a terminal status (ready|error).
 */
export function useJobStream(jobId: Ref<string | null> | string) {
  const idRef = typeof jobId === 'string' ? ref(jobId) : jobId

  const status = ref<JobStatus | 'connecting' | 'idle'>('idle')
  const progress = ref<number>(0)
  const message = ref<string>('')
  const events = ref<JobEvent[]>([])
  const error = ref<string | null>(null)
  const isTerminal = computed(
    () => status.value === 'ready' || status.value === 'error'
  )

  let es: EventSource | null = null

  function open() {
    close()
    const id = idRef.value
    if (!id || import.meta.server) return
    status.value = 'connecting'
    error.value = null

    es = new EventSource(`/api/jobs/${id}/events`)

    es.addEventListener('job', (e: MessageEvent) => {
      try {
        const evt: JobEvent = JSON.parse(e.data)
        status.value = evt.status
        progress.value = evt.progress ?? progress.value
        message.value = evt.message ?? message.value
        events.value = [...events.value, evt]
        if (TERMINAL_JOB_STATES.has(evt.status)) {
          close()
        }
      } catch {
        // ignore malformed payload
      }
    })

    es.onerror = () => {
      // EventSource auto-reconnects; only flag error if we never connected.
      if (status.value === 'connecting') {
        status.value = 'error'
        error.value = 'Could not connect to job stream'
        close()
      }
    }
  }

  function close() {
    if (es) {
      es.close()
      es = null
    }
    if (status.value === 'connecting') status.value = 'idle'
  }

  function reset() {
    close()
    status.value = 'idle'
    progress.value = 0
    message.value = ''
    events.value = []
    error.value = null
  }

  // Auto-close on unmount.
  if (import.meta.client) {
    onScopeDispose?.(() => close())
  }

  return {
    status: readonly(status),
    progress: readonly(progress),
    message: readonly(message),
    events: readonly(events),
    error: readonly(error),
    isTerminal,
    open,
    close,
    reset
  }
}
