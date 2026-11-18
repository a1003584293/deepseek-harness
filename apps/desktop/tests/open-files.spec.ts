import { describe, expect, it, vi } from 'vitest'
import { DesktopOpenFiles } from '../src/open-files.ts'

function make(existing: readonly string[]): DesktopOpenFiles {
  return new DesktopOpenFiles({ isFile: path => existing.includes(path) })
}

describe('DesktopOpenFiles', () => {
  it('queues existing absolute files and notifies once per new path', () => {
    const files = make(['/tmp/notes.md'])
    const available = vi.fn()
    const stop = files.onAvailable(available)
    expect(files.enqueue('relative.md')).toBe(false)
    expect(files.enqueue('/tmp/missing.md')).toBe(false)
    expect(files.enqueue('/tmp/notes.md')).toBe(true)
    expect(files.enqueue('/tmp/notes.md')).toBe(false)
    expect(available).toHaveBeenCalledOnce()
    expect(files.take()).toEqual(['/tmp/notes.md'])
    expect(files.take()).toEqual([])
    stop()
    expect(files.enqueue('/tmp/notes.md')).toBe(true)
    expect(available).toHaveBeenCalledOnce()
  })

  it('reads launch arguments, ignoring option flags', () => {
    const files = make(['/tmp/a.md', '/tmp/b.md'])
    expect(files.enqueueArguments(['--no-sandbox', '', '/tmp/a.md', '--flag', '/tmp/b.md'])).toBe(2)
    expect(files.take()).toEqual(['/tmp/a.md', '/tmp/b.md'])
  })
})
