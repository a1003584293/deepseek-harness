/**
 * Run one operator-configured command at the moments a turn blocks on a human
 * or finishes: a pending approval or question, the turn-end boundary, and a
 * turn-level failure. Commands receive one JSON payload on stdin and never
 * block the turn they report.
 * @module @deepseek-ai/dsh-notify-command
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { errorChain } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-subprocess'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-user-approval/types'
import type {} from '@deepseek-ai/dsh-user-questions/types'

/** The three notification moments. */
export type NotifyEvent = 'waiting' | 'turn-end' | 'error'

/**
 * Hook event name each moment reports, matching the Claude Code hook vocabulary
 * VS Code already writes, so one notification script can read both producers.
 */
const HOOK_EVENT_NAME: Readonly<Record<NotifyEvent, string>> = {
  waiting: 'Notification',
  'turn-end': 'Stop',
  error: 'ErrorOccurred',
}

/** Plugin config: one command line per moment plus the shared execution policy. */
export interface Config {
  /** Command for a pending approval or user question; blank disables it. */
  onWaiting: string
  /** Command for the turn-end boundary; blank disables it. */
  onTurnEnd: string
  /** Command for a turn-level failure; blank disables it. */
  onError: string
  /** Deadline after which the command's managed process is terminated. */
  timeoutMs: number
  /** Shell that runs the command line (`-c`). */
  shell: string
  /** Fallback working directory when the Session has none; blank uses the Host process directory. */
  cwd: string
}

export const Config: z<Config> = z.object({
  onWaiting: z.string().default(''),
  onTurnEnd: z.string().default(''),
  onError: z.string().default(''),
  timeoutMs: z.number().default(10_000),
  shell: z.string().default('/bin/sh'),
  cwd: z.string().default(''),
})

/** The managed subprocess service is the only required capability. */
export const inject = ['subprocess']

/** The one configured command line for an event, or undefined when disabled. */
function commandFor(config: Config, event: NotifyEvent): string | undefined {
  const command = event === 'waiting' ? config.onWaiting : event === 'turn-end' ? config.onTurnEnd : config.onError
  return command.trim() === '' ? undefined : command
}

/** The directory a notification command runs in: the Session workspace, then the configured fallback. */
function workingDirectory(config: Config, agent: Agent): string {
  if (agent.session.header.cwd !== undefined) return agent.session.header.cwd
  return config.cwd === '' ? process.cwd() : config.cwd
}

/**
 * Spawn one notification command without waiting for it.
 * @param ctx - owning plugin context (managed-process owner and logger).
 * @param config - shell, timeout, and fallback directory.
 * @param lifetime - aborted when the plugin unloads, ending running commands.
 * @param event - the reported moment.
 * @param agent - the Session whose event fired; subagent Sessions are skipped.
 * @param detail - event-specific payload fields.
 */
function notify(
  ctx: Context,
  config: Config,
  lifetime: AbortSignal,
  event: NotifyEvent,
  agent: Agent,
  detail: Record<string, unknown>,
): void {
  const command = commandFor(config, event)
  if (command === undefined) return
  if (agent.session.header.origin === 'subagent') return
  const cwd = workingDirectory(config, agent)
  const payload = {
    // Claude Code hook fields: VS Code writes these names, so a script written
    // for VS Code reads this producer without a second branch.
    hook_event_name: HOOK_EVENT_NAME[event],
    session_id: String(agent.session.id),
    cwd,
    // A producer marker for scripts that must tell this Host from VS Code:
    // VS Code's hook payload never carries it.
    ds_harness: 1,
    // DSH-native duplicates of the same facts, kept for scripts that already use them.
    event,
    sessionId: String(agent.session.id),
    time: Date.now(),
    ...detail,
  }
  let handle
  try {
    handle = ctx.subprocess.spawn({
      argv: [config.shell, '-c', command],
      cwd,
      // Output belongs to the command; a bounded tail is enough for the record.
      stdio: { stdin: { data: `${JSON.stringify(payload)}\n` }, stdout: { maxBytes: 512 }, stderr: { maxBytes: 512 } },
      graceMs: 1_000,
      signal: lifetime,
      env: { DSH_NOTIFY_EVENT: event, DSH_NOTIFY_SESSION: String(agent.session.id) },
    })
  } catch (error: unknown) {
    ctx.logger.warn(`notify-command: ${event} command could not start: ${String(error)}`)
    return
  }
  const timer = setTimeout(() => { handle.terminate() }, config.timeoutMs)
  void handle.done.then(
    (outcome) => {
      if (outcome.exitCode !== 0 && outcome.exitCode !== null) {
        ctx.logger.warn(`notify-command: ${event} command exited with code ${outcome.exitCode}`)
      }
    },
    (error: unknown) => { ctx.logger.warn(`notify-command: ${event} command failed: ${String(error)}`) },
  ).finally(() => { clearTimeout(timer) })
}

/**
 * Register the notification listeners.
 * @param ctx - Host plugin context.
 * @param config - the three command lines and their execution policy.
 * @throws when `timeoutMs` is not a positive finite number.
 */
export function apply(ctx: Context, config: Config): void {
  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs <= 0) {
    throw new Error('notify-command: timeoutMs must be a positive finite number')
  }
  const lifetime = new AbortController()
  ctx.effect(() => () => { lifetime.abort() }, 'notify-command: running commands')
  // A waiting listener must delegate: another answerer still owns the decision.
  ctx.on('approval/request', (request, next) => {
    notify(ctx, config, lifetime.signal, 'waiting', request.agent, {
      kind: 'approval',
      tool: request.toolName,
      ...request.reason === undefined ? {} : { reason: request.reason },
    })
    return next()
  })
  ctx.on('user-questions/request', (request, next) => {
    if (request.agent !== undefined) notify(ctx, config, lifetime.signal, 'waiting', request.agent, { kind: 'question' })
    return next()
  })
  ctx.on('agent/turn-stopping', ({ agent, turn }) => {
    notify(ctx, config, lifetime.signal, 'turn-end', agent, { turn })
  })
  ctx.on('agent/error', ({ agent, turn, step, error }) => {
    const message = errorChain(error)
    notify(ctx, config, lifetime.signal, 'error', agent, {
      turn,
      step,
      message,
      // The VS Code hook carries the provider message as serialized JSON.
      error: { message: JSON.stringify({ message }) },
    })
  })
}
