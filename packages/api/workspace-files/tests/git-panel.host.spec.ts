/** Source-control status parsing and grouping shared by the Git panel and its UI. */
import { describe, expect, it } from 'vitest'
import {
  gitEntryStaged, gitEntryUnstaged, gitEntryUntracked, parseGitStatus,
} from '../src/git-panel.ts'

describe('parseGitStatus', () => {
  it('reads ordinary, untracked, and rename records from NUL porcelain v1', () => {
    expect(parseGitStatus(' M file.ts\0?? new.ts\0M  staged.ts\0R  renamed.ts\0original.ts\0')).toEqual([
      { path: 'file.ts', index: ' ', worktree: 'M' },
      { path: 'new.ts', index: '?', worktree: '?' },
      { path: 'staged.ts', index: 'M', worktree: ' ' },
      { path: 'renamed.ts', index: 'R', worktree: ' ' },
    ])
  })

  it('classifies index and worktree states independently', () => {
    const [both, staged, working, untracked] = parseGitStatus('MM both.ts\0M  staged.ts\0 M working.ts\0?? new.ts\0')
    expect(both).toBeDefined()
    expect(staged).toBeDefined()
    expect(working).toBeDefined()
    expect(untracked).toBeDefined()
    expect(gitEntryStaged(both!)).toBe(true)
    expect(gitEntryUnstaged(both!)).toBe(true)
    expect(gitEntryStaged(staged!)).toBe(true)
    expect(gitEntryUnstaged(staged!)).toBe(false)
    expect(gitEntryStaged(working!)).toBe(false)
    expect(gitEntryUnstaged(working!)).toBe(true)
    expect(gitEntryUntracked(untracked!)).toBe(true)
  })

  it('ignores an empty tail record', () => {
    expect(parseGitStatus('')).toEqual([])
    expect(parseGitStatus('\0')).toEqual([])
  })
})
