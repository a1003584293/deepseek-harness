/** Account re-reads around a finished top-level turn. */
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/**
 * Delay before the follow-up read, covering a platform balance that the first
 * read can precede: the platform records a turn's usage after it completes.
 */
export const TURN_REREAD_DELAY_MS = 20_000

/**
 * Re-read account details when a top-level Session turn ends, then once more
 * after the platform settles the usage that turn consumed. A later turn
 * restarts the pending follow-up instead of queueing one read per turn.
 * Subagent turns belong to their parent turn and read nothing.
 * @param list - Session catalog source.
 * @param reread - account read to start.
 * @param delayMs - delay before the follow-up read.
 * @returns disposer stopping observation and any pending follow-up read.
 */
export function watchTurnEnds(
  list: ObservableSnapshot<SessionListState>,
  reread: () => void,
  delayMs: number = TURN_REREAD_DELAY_MS,
): () => void {
  // Seed from the catalog so a turn already running at subscription time still
  // reports its end; a Session first seen idle has nothing to report.
  let running = new Map<SessionId, boolean>(
    Object.values(list.getSnapshot().byId).map(summary => [summary.id, summary.running]),
  )
  let followUp: ReturnType<typeof setTimeout> | undefined
  const stop = list.subscribe(() => {
    const { byId } = list.getSnapshot()
    const previous = running
    const next = new Map<SessionId, boolean>()
    let finished = false
    for (const summary of Object.values(byId)) {
      next.set(summary.id, summary.running)
      if (previous.get(summary.id) === true && !summary.running && summary.origin !== 'subagent') finished = true
    }
    running = next
    if (!finished) return
    reread()
    clearTimeout(followUp)
    followUp = setTimeout(() => {
      followUp = undefined
      reread()
    }, delayMs)
  })
  return () => {
    stop()
    clearTimeout(followUp)
    followUp = undefined
  }
}
