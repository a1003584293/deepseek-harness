/** Git panel Remote commands over a fake subprocess and Session workspace. */
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { GitPanel } from '../src/git-panel.ts'

const SESSION = 'session-git' as SessionId
const signal = new AbortController().signal

function output(text: string): { readFrom: () => { text: string; nextOffset: number; lossy: boolean } } {
  return { readFrom: () => ({ text, nextOffset: text.length, lossy: false }) }
}

async function boot(): Promise<{ panel: GitPanel; spawns: SubprocessSpawnSpec[] }> {
  const ctx = new Context()
  ctx.provide('sessions', { get: () => ({ header: { cwd: '/repo' } }) } as never)
  const spawns: SubprocessSpawnSpec[] = []
  ctx.provide('subprocess', {
    spawn: (spec: SubprocessSpawnSpec) => {
      spawns.push(spec)
      const args = spec.argv.slice(1)
      const command = args[0]
      let stdout = ''
      let exitCode = 0
      if (command === 'rev-parse' && args[1] === '--show-toplevel') stdout = '/repo\n'
      else if (command === 'rev-parse' && args[1] === '--verify') stdout = 'abc123\n'
      else if (command === 'symbolic-ref') stdout = 'main\n'
      else if (command === 'status') stdout = ' M file.ts\0?? new.ts\0'
      else if (command === 'diff') stdout = 'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new\n'
      else if (command === 'reset' || command === 'add' || command === 'rm') stdout = ''
      else exitCode = 1
      return {
        done: Promise.resolve({ exitCode, signal: null }),
        terminate: vi.fn(),
        stdin: undefined,
        stdout: undefined,
        stderr: undefined,
        control: undefined,
        collected: { stdout: output(stdout), stderr: output('') },
        waitForExit: async () => true,
      }
    },
  } as never)
  await ctx.plugin(GitPanel)
  return { panel: ctx.get('gitPanel') as GitPanel, spawns }
}

describe('GitPanel', () => {
  it('reads repository status and groups entries', async () => {
    const { panel } = await boot()
    await expect(panel.status(SESSION, signal)).resolves.toMatchObject({
      root: '/repo', branch: 'main',
      entries: [{ path: 'file.ts', index: ' ', worktree: 'M' }, { path: 'new.ts', index: '?', worktree: '?' }],
    })
  })

  it('runs stage and unstage as argument-only Git commands', async () => {
    const { panel, spawns } = await boot()
    await panel.stage(SESSION, ['file.ts', 'new.ts'], signal)
    expect(spawns.at(-1)?.argv).toEqual(['git', 'add', '-A', '--', 'file.ts', 'new.ts'])
    await panel.unstage(SESSION, ['file.ts'], signal)
    expect(spawns.at(-1)?.argv).toEqual(['git', 'reset', '-q', '--', 'file.ts'])
  })

  it('reads one unified diff', async () => {
    const { panel } = await boot()
    await expect(panel.diff(SESSION, 'file.ts', 'working', signal)).resolves.toMatchObject({
      path: 'file.ts', scope: 'working', binary: false,
    })
  })
})
