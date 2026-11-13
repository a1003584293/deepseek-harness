/**
 * Session-scoped Git status, diff, and index operations for the desktop source
 * control panel. Commands run through the composed subprocess provider in the
 * Session workspace; the wire carries paths relative to the repository root.
 *
 * @module @deepseek-ai/dsh-api-workspace-files
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-session'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import z from '@deepseek-ai/schemastery'

import type {
  GitDiffScope, GitDiffValue, GitPanelConfig, GitStatusEntry, GitStatusValue,
} from './types.ts'

/** Read a NUL-terminated porcelain v1 status into entries. */
export function parseGitStatus(output: string): GitStatusEntry[] {
  const records = output.split('\0')
  const entries: GitStatusEntry[] = []
  for (let at = 0; at < records.length; at += 1) {
    const record = records[at]
    if (record === undefined || record.length === 0) continue
    const index = record[0] ?? ' '
    const worktree = record[1] ?? ' '
    // Rename and copy records put the source path in the next NUL field.
    const renamed = index === 'R' || index === 'C' || worktree === 'R' || worktree === 'C'
    if (renamed) at += 1
    const path = record.slice(3)
    if (path.length === 0) continue
    entries.push({ path, index, worktree })
  }
  return entries
}

/** Whether one entry has staged content. */
export function gitEntryStaged(entry: GitStatusEntry): boolean {
  return entry.index !== ' ' && entry.index !== '?'
}

/** Whether one entry has unstaged content, including an untracked file. */
export function gitEntryUnstaged(entry: GitStatusEntry): boolean {
  return entry.worktree !== ' ' || entry.index === '?'
}

/** Whether one entry is an untracked file. */
export function gitEntryUntracked(entry: GitStatusEntry): boolean {
  return entry.index === '?' && entry.worktree === '?'
}

/** Session-scoped Git Remote backing the desktop source control tab. */
export class GitPanel extends TypertRemoteService {
  static inject = ['sessions', 'subprocess']

  static Config: z<GitPanelConfig> = z.object({
    gitCommand: z.string().default('git'),
    timeoutMs: z.number().default(10_000),
    maxOutputBytes: z.number().default(4 * 1024 * 1024),
  })

  constructor(ctx: Context, private readonly config: GitPanelConfig) {
    super(ctx, 'gitPanel')
  }

  /**
   * Read the repository, branch, and changed paths of one Session workspace.
   * @param sessionId - Session whose header supplies the working directory.
   * @param signal - caller cancellation.
   * @returns repository facts and every changed path.
   * @throws RemoteError when the Session has no workspace or the directory is not a Git checkout.
   */
  @Remote
  async status(sessionId: SessionId, signal: AbortSignal): Promise<GitStatusValue> {
    const rootPath = await this.repositoryOf(sessionId, signal)
    const branch = await this.run(rootPath, ['symbolic-ref', '--short', '-q', 'HEAD'], signal, true)
    const status = await this.run(rootPath, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], signal)
    return {
      root: rootPath,
      branch: branch.code === 0 ? branch.stdout.trim() || null : null,
      entries: parseGitStatus(status.stdout),
    }
  }

  /**
   * Read one file's unified diff in the working tree or the index.
   * @param sessionId - Session whose header supplies the working directory.
   * @param path - repository-relative path.
   * @param scope - working tree versus index, or index versus HEAD.
   * @param signal - caller cancellation.
   * @returns the patch and its binary/truncation facts.
   * @throws RemoteError when the path is empty or Git cannot run.
   */
  @Remote
  async diff(sessionId: SessionId, path: string, scope: GitDiffScope, signal: AbortSignal): Promise<GitDiffValue> {
    if (path.length === 0) throw new RemoteError('git-panel/bad-request', 'Git diff path must not be empty', {})
    const root = await this.repositoryOf(sessionId, signal)
    const staged = scope === 'staged'
    let result = await this.run(root, [
      'diff', ...staged ? ['--cached'] : [], '--no-color', '--no-ext-diff', '-U3', '--', path,
    ], signal, true)
    if (!staged && result.stdout.trim().length === 0) {
      // An untracked file has no index entry; compare it with the empty tree.
      result = await this.run(root, [
        'diff', '--no-index', '--no-color', '--no-ext-diff', '-U3', '--', '/dev/null', path,
      ], signal, true)
    }
    return {
      path,
      scope,
      patch: result.stdout,
      binary: result.stdout.includes('Binary files') || result.stdout.includes('GIT binary patch'),
      truncated: result.truncated,
    }
  }

  /**
   * Stage paths with `git add -A`.
   * @param sessionId - Session whose header supplies the working directory.
   * @param paths - repository-relative paths.
   * @param signal - caller cancellation.
   */
  @Remote
  async stage(sessionId: SessionId, paths: string[], signal: AbortSignal): Promise<void> {
    await this.change(sessionId, paths, 'stage', signal)
  }

  /**
   * Unstage paths with `git reset`, or `git rm --cached` before the first commit.
   * @param sessionId - Session whose header supplies the working directory.
   * @param paths - repository-relative paths.
   * @param signal - caller cancellation.
   */
  @Remote
  async unstage(sessionId: SessionId, paths: string[], signal: AbortSignal): Promise<void> {
    await this.change(sessionId, paths, 'unstage', signal)
  }

  private async change(sessionId: SessionId, paths: string[], mode: 'stage' | 'unstage', signal: AbortSignal): Promise<void> {
    const clean = paths.filter(path => typeof path === 'string' && path.length > 0)
    if (clean.length === 0) throw new RemoteError('git-panel/bad-request', 'At least one path is required', {})
    const root = await this.repositoryOf(sessionId, signal)
    if (mode === 'stage') {
      await this.run(root, ['add', '-A', '--', ...clean], signal)
      return
    }
    const head = await this.run(root, ['rev-parse', '--verify', 'HEAD'], signal, true)
    if (head.code === 0) await this.run(root, ['reset', '-q', '--', ...clean], signal)
    else await this.run(root, ['rm', '-r', '--cached', '-q', '--', ...clean], signal)
  }

  private workspaceOf(sessionId: SessionId): string {
    const cwd = this.ctx.sessions.get(sessionId)?.header.cwd
    if (cwd === undefined || cwd === '') {
      throw new RemoteError('git-panel/no-workspace', 'The Session has no workspace directory', {})
    }
    return cwd
  }

  /** Resolve the repository root; every path on the wire is root-relative. */
  private async repositoryOf(sessionId: SessionId, signal: AbortSignal): Promise<string> {
    const cwd = this.workspaceOf(sessionId)
    const found = await this.run(cwd, ['rev-parse', '--show-toplevel'], signal)
    const root = found.stdout.trim()
    if (root.length === 0) throw new RemoteError('git-panel/not-a-repository', 'Git did not report a repository root', {})
    return root
  }

  /** Run one Git command in the Session workspace and collect its bounded output. */
  private async run(
    cwd: string, args: string[], signal: AbortSignal, allowExitOne = false,
  ): Promise<{ code: number | null; stdout: string; stderr: string; truncated: boolean }> {
    const timeout = new AbortController()
    const timer = setTimeout(() => { timeout.abort() }, this.config.timeoutMs)
    const lifetime = AbortSignal.any([signal, timeout.signal])
    try {
      const subprocess = this.ctx.get('subprocess')
      if (subprocess === undefined) throw new RemoteError('git-panel/command-failed', 'The subprocess provider is not mounted', { command: this.config.gitCommand, exitCode: null, stderr: '' })
      const handle = (subprocess).spawn({
        argv: [this.config.gitCommand, ...args],
        cwd,
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: this.config.maxOutputBytes },
          stderr: { maxBytes: 64 * 1024 },
        },
        graceMs: 1_000,
        signal: lifetime,
      })
      const outcome = await handle.done
      const stdoutRead = handle.collected.stdout?.readFrom(0)
      const stderrRead = handle.collected.stderr?.readFrom(0)
      const stdout = stdoutRead?.text ?? ''
      const stderr = stderrRead?.text ?? ''
      if (signal.aborted) throw new RemoteError('gateway/cancelled', 'Git command was aborted', {})
      if (timeout.signal.aborted) throw new RemoteError('git-panel/timeout', `Git did not finish within ${this.config.timeoutMs} ms`, { timeoutMs: this.config.timeoutMs })
      if (outcome.exitCode !== 0 && !(allowExitOne && outcome.exitCode === 1)) {
        throw new RemoteError('git-panel/command-failed', `git ${args[0] ?? ''} exited with code ${String(outcome.exitCode)}${stderr.trim().length > 0 ? `: ${stderr.trim()}` : ''}`, { command: args[0] ?? '', exitCode: outcome.exitCode, stderr })
      }
      return { code: outcome.exitCode, stdout, stderr, truncated: stdoutRead?.lossy === true }
    } finally {
      clearTimeout(timer)
    }
  }
}
