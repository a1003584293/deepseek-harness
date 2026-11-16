/** Periodic account re-reads that follow whether any Session is running. */
import { afterEach, expect, it, vi } from 'vitest'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ACTIVE_POLL_INTERVAL_MS, IDLE_POLL_INTERVAL_MS, pollBalance } from '../src/client/balance-poll.ts'

const summary = (id: string, running: boolean): SessionSummary => ({
  id: id as SessionId, displayTitle: id, running, blank: false, updatedAt: 1, retainedBy: {},
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

it('reads every ten minutes while no turn runs and every minute once one starts', () => {
  vi.useFakeTimers()
  const list = catalog([])
  const read = vi.fn()
  const stop = pollBalance(list, read)

  vi.advanceTimersByTime(IDLE_POLL_INTERVAL_MS - 1)
  expect(read).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(read).toHaveBeenCalledOnce()
  vi.advanceTimersByTime(IDLE_POLL_INTERVAL_MS)
  expect(read).toHaveBeenCalledTimes(2)

  // A newly running turn shortens the next interval without an immediate read.
  list.set([summary('session', true)])
  expect(read).toHaveBeenCalledTimes(2)
  vi.advanceTimersByTime(ACTIVE_POLL_INTERVAL_MS - 1)
  expect(read).toHaveBeenCalledTimes(2)
  vi.advanceTimersByTime(1)
  expect(read).toHaveBeenCalledTimes(3)

  // A finished turn restores the idle interval for the next read.
  list.set([summary('session', false)])
  vi.advanceTimersByTime(IDLE_POLL_INTERVAL_MS - 1)
  expect(read).toHaveBeenCalledTimes(3)
  vi.advanceTimersByTime(1)
  expect(read).toHaveBeenCalledTimes(4)
  stop()
})

it('keeps the pending read when a catalog change leaves activity unchanged', () => {
  vi.useFakeTimers()
  const list = catalog([summary('session', true)])
  const read = vi.fn()
  const stop = pollBalance(list, read, 1000, 5000)

  vi.advanceTimersByTime(600)
  // Streaming updates the catalog continuously; they must not push the timer back.
  list.set([{ ...summary('session', true), updatedAt: 2 }])
  list.set([{ ...summary('session', true), updatedAt: 3 }])
  vi.advanceTimersByTime(399)
  expect(read).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(read).toHaveBeenCalledOnce()
  stop()
})

it('treats any running Session as active, and clears the timer on dispose', () => {
  vi.useFakeTimers()
  const list = catalog([summary('idle', false), summary('running', true)])
  const read = vi.fn()
  const stop = pollBalance(list, read, 2000, 9000)

  vi.advanceTimersByTime(2000)
  expect(read).toHaveBeenCalledOnce()
  list.set([summary('idle', false), summary('running', false)])
  vi.advanceTimersByTime(1999)
  expect(read).toHaveBeenCalledOnce()
  stop()
  vi.advanceTimersByTime(60_000)
  expect(read).toHaveBeenCalledOnce()
})
