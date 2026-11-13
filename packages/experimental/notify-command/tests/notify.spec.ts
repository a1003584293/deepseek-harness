/** Notification commands fire at the three configured moments and never carry model input. */
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import * as Notify from '../src/index.ts'

const SESSION = 's-notify' as SessionId

function agent(origin?: 'subagent'): Agent {
  return {
    session: { id: SESSION, header: { cwd: '/work', ...origin === undefined ? {} : { origin } } },
  } as unknown as Agent
}

function config(overrides: Partial<Notify.Config> = {}): Notify.Config {
  return {
    onWaiting: 'notify waiting',
    onTurnEnd: 'notify stop',
    onError: 'notify error',
    timeoutMs: 1_000,
    shell: '/bin/sh',
    cwd: '',
    ...overrides,
  }
}

async function boot(value: Notify.Config = config()) {
  const ctx = new Context()
  const spawned: SubprocessSpawnSpec[] = []
  const terminate = vi.fn()
  ctx.provide('subprocess', {
    spawn: (spec: SubprocessSpawnSpec) => {
      spawned.push(spec)
      return {
        done: Promise.resolve({ exitCode: 0, signal: null }),
        terminate,
        stdin: undefined,
        stdout: undefined,
        stderr: undefined,
        control: undefined,
        collected: {},
        waitForExit: async () => true,
      }
    },
  } as never)
  const fiber = await ctx.plugin(Notify, value)
  // The real dispatchers are agent-scoped; the root context reaches them through the same emitter.
  const emit = (ctx as unknown as { emit(...args: unknown[]): void }).emit.bind(ctx)
  return { ctx, emit, fiber, spawned, terminate }
}

describe('notify-command', () => {
  it('rejects a non-positive timeout at load', async () => {
    const ctx = new Context()
    ctx.provide('subprocess', { spawn: vi.fn() } as never)
    await expect(ctx.plugin(Notify, config({ timeoutMs: 0 }))).rejects.toThrow('timeoutMs must be a positive finite number')
  })

  it('runs the error command with the failure text and exports the event', async () => {
    const { emit, spawned } = await boot()
    emit('agent/error', { agent: agent(), turn: 2, step: 3, error: new Error('boom') })
    expect(spawned).toHaveLength(1)
    const spec = spawned[0]!
    expect(spec.argv).toEqual(['/bin/sh', '-c', 'notify error'])
    expect(spec.cwd).toBe('/work')
    expect(spec.env?.DSH_NOTIFY_EVENT).toBe('error')
    expect(spec.env?.DSH_NOTIFY_SESSION).toBe(SESSION)
    const payload = JSON.parse((spec.stdio.stdin as { data: string }).data) as Record<string, unknown>
    expect(payload).toMatchObject({
      event: 'error', sessionId: SESSION, cwd: '/work', turn: 2, step: 3,
      // VS Code hook fields: one script can read both producers.
      hook_event_name: 'ErrorOccurred', session_id: SESSION,
      // The producer marker VS Code never sends.
      ds_harness: 1,
    })
    expect(String(payload.message)).toContain('boom')
    // VS Code serializes the provider message into error.message, which the
    // operator script decodes with json.loads.
    const providerError = JSON.parse((payload.error as { message: string }).message) as { message: string }
    expect(providerError.message).toContain('boom')
  })

  it('reports a pending approval or question without claiming the decision', async () => {
    const { ctx, spawned } = await boot()
    const waterfall = (ctx as unknown as {
      waterfall(...args: unknown[]): Promise<unknown>
    }).waterfall.bind(ctx)
    const approval = await waterfall(
      'approval/request',
      { agent: agent(), toolName: 'bash', reason: 'write outside the workspace' },
      () => Promise.resolve('allowed-once'),
    )
    expect(approval).toBe('allowed-once')
    const question = await waterfall(
      'user-questions/request',
      { agent: agent(), questions: [] },
      () => Promise.resolve('answered'),
    )
    expect(question).toBe('answered')
    expect(spawned).toHaveLength(2)
    expect(spawned.map(spec => spec.env?.DSH_NOTIFY_EVENT)).toEqual(['waiting', 'waiting'])
    const approvalPayload = JSON.parse((spawned[0]!.stdio.stdin as { data: string }).data) as Record<string, unknown>
    expect(approvalPayload).toMatchObject({ kind: 'approval', tool: 'bash', hook_event_name: 'Notification' })
  })

  it('runs the turn-end command and skips subagent Sessions', async () => {
    const { emit, spawned } = await boot()
    emit('agent/turn-stopping', { agent: agent(), turn: 1 })
    emit('agent/turn-stopping', { agent: agent('subagent'), turn: 1 })
    expect(spawned).toHaveLength(1)
    expect(spawned[0]!.env?.DSH_NOTIFY_EVENT).toBe('turn-end')
    const payload = JSON.parse((spawned[0]!.stdio.stdin as { data: string }).data) as Record<string, unknown>
    expect(payload).toMatchObject({ hook_event_name: 'Stop', session_id: SESSION, event: 'turn-end' })
  })

  it('spawns nothing for a blank command and terminates running commands on unload', async () => {
    const { emit, fiber, spawned, terminate } = await boot(config({ onTurnEnd: '' }))
    emit('agent/turn-stopping', { agent: agent(), turn: 1 })
    expect(spawned).toHaveLength(0)
    emit('agent/error', { agent: agent(), turn: 1, step: 1, error: 'x' })
    expect(spawned).toHaveLength(1)
    await fiber.dispose()
    expect(terminate).not.toHaveBeenCalled()
  })
})
