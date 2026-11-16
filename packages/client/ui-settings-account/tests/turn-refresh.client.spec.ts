/** Turn-end account re-reads and their delayed provider-settlement read. */
import { afterEach, expect, it, vi } from 'vitest'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { TURN_REREAD_DELAY_MS, watchTurnEnds } from '../src/client/turn-refresh.ts'

const sid = (id: string) => id as SessionId
const summary = (id: string, running: boolean, origin?: 'subagent'): SessionSummary => ({
  id: sid(id), displayTitle: id, running, blank: false, updatedAt: 1, retainedBy: {},
  ...(origin === undefined ? {} : { origin }),
})
const state = (items: readonly SessionSummary[]): SessionListState => ({
  ids: items.map(item => item.id),
  byId: Object.fromEntries(items.map(item => [item.id, item])),
  phase: 'ready',
  projectionsBySession: {},
})

/** Session catalog source with an explicit update driver. */
function catalog(initial: readonly SessionSummary[]) {
  let value = state(initial)
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set(items: readonly SessionSummary[]) {
      value = state(items)
      for (const listener of [...listeners]) listener()
    },
  }
}

afterEach(() => { vi.useRealTimers() })

it('re-reads after a top-level turn ends and again once the platform settles its usage', () => {
  vi.useFakeTimers()
  const list = catalog([summary('session', true)])
  const reread = vi.fn()
  const stop = watchTurnEnds(list, reread)

  list.set([summary('session', false)])
  expect(reread).toHaveBeenCalledOnce()
  vi.advanceTimersByTime(TURN_REREAD_DELAY_MS - 1)
  expect(reread).toHaveBeenCalledOnce()
  vi.advanceTimersByTime(1)
  expect(reread).toHaveBeenCalledTimes(2)
  stop()
})

it('restarts the pending follow-up when another turn ends and drops it on dispose', () => {
  vi.useFakeTimers()
  const list = catalog([summary('session', true)])
  const reread = vi.fn()
  const stop = watchTurnEnds(list, reread, 1000)

  list.set([summary('session', false)])
  vi.advanceTimersByTime(600)
  list.set([summary('session', true)])
  list.set([summary('session', false)])
  expect(reread).toHaveBeenCalledTimes(2)
  vi.advanceTimersByTime(999)
  expect(reread).toHaveBeenCalledTimes(2)
  vi.advanceTimersByTime(1)
  expect(reread).toHaveBeenCalledTimes(3)

  list.set([summary('session', true)])
  list.set([summary('session', false)])
  expect(reread).toHaveBeenCalledTimes(4)
  stop()
  vi.advanceTimersByTime(1000)
  expect(reread).toHaveBeenCalledTimes(4)
})

it('reads nothing for a subagent turn or a session first seen idle', () => {
  vi.useFakeTimers()
  const list = catalog([summary('parent', true), summary('child', true, 'subagent')])
  const reread = vi.fn()
  const stop = watchTurnEnds(list, reread)

  list.set([summary('parent', true), summary('child', false, 'subagent')])
  expect(reread).not.toHaveBeenCalled()
  // A Session already idle at first sight did not finish a turn in this Client.
  list.set([summary('parent', true), summary('child', false, 'subagent'), summary('idle', false)])
  expect(reread).not.toHaveBeenCalled()
  vi.advanceTimersByTime(TURN_REREAD_DELAY_MS)
  expect(reread).not.toHaveBeenCalled()
  stop()
})
