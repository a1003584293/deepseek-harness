/** Periodic account re-reads that follow whether any Session is running. */
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'

/** Re-read interval while any Session turn is running. */
export const ACTIVE_POLL_INTERVAL_MS = 60_000

/** Re-read interval while no Session turn is running. */
export const IDLE_POLL_INTERVAL_MS = 600_000

/**
 * Re-read the account while its access grant lives, so a balance another device
 * spent still reaches this window, and a long turn shows the credit it burns.
 * The interval follows the Session catalog: one minute while any turn runs, ten
 * minutes while none does. A catalog change that keeps activity unchanged does
 * not restart the pending read.
 * @param list - Session catalog source.
 * @param reread - account read to start.
 * @param activeIntervalMs - delay while a turn runs.
 * @param idleIntervalMs - delay while no turn runs.
 * @returns disposer stopping observation and the pending read.
 */
export function pollBalance(
  list: ObservableSnapshot<SessionListState>,
  reread: () => void,
  activeIntervalMs: number = ACTIVE_POLL_INTERVAL_MS,
  idleIntervalMs: number = IDLE_POLL_INTERVAL_MS,
): () => void {
  let active = isRunning(list.getSnapshot())
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = (): void => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      reread()
      schedule()
    }, active ? activeIntervalMs : idleIntervalMs)
  }
  const stop = list.subscribe(() => {
    const next = isRunning(list.getSnapshot())
    // Turn progress updates the catalog on every chunk; only a change of
    // activity may restart the interval.
    if (next === active) return
    active = next
    schedule()
  })
  schedule()
  return () => {
    stop()
    clearTimeout(timer)
    timer = undefined
  }
}

/** @param state - Session catalog. @returns whether any Session turn is running. */
function isRunning(state: SessionListState): boolean {
  return Object.values(state.byId).some(summary => summary.running)
}
