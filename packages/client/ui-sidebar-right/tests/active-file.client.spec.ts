/** The focused tab's file and the document body's published line range, as the composer reads them. */
import { describe, expect, it } from 'vitest'
import { controllerHarness, SESSION } from './controller-harness.client.ts'

const ADDRESS = 'dsh-resource://file/session/s-test/api/invoice.py'

describe('active file', () => {
  it('publishes the focused file tab and its published selection', () => {
    const h = controllerHarness()
    h.publish()
    h.controller.openResource(ADDRESS)
    expect(h.controller.activeFile.getSnapshot()).toMatchObject({
      sessionId: SESSION, address: ADDRESS, path: 'api/invoice.py',
    })
    h.controller.setTextSelection({ sessionId: SESSION, address: ADDRESS, startLine: 100, endLine: 120 })
    expect(h.controller.activeFile.getSnapshot()).toMatchObject({ startLine: 100, endLine: 120 })
    // A repeat is identity-preserving, and a sibling body cannot clear this range.
    h.controller.setTextSelection({ sessionId: SESSION, address: ADDRESS, startLine: 100, endLine: 120 })
    h.controller.clearTextSelection(SESSION, 'dsh-resource://file/absolute/elsewhere.py')
    expect(h.controller.activeFile.getSnapshot()?.startLine).toBe(100)
    h.controller.clearTextSelection(SESSION, ADDRESS)
    expect(h.controller.activeFile.getSnapshot()?.startLine).toBeUndefined()
  })

  it('follows a page editor tab through its resource param and selection', () => {
    const h = controllerHarness()
    h.tabs.register({ id: 'test/editor', kind: 'editor', priority: 'builtin', title: () => 'Editor' })
    h.publish()
    h.controller.openTab('editor' as never, { params: { path: ADDRESS } } as never)
    expect(h.controller.activeFile.getSnapshot()).toMatchObject({
      sessionId: SESSION, address: ADDRESS, path: 'api/invoice.py',
    })
    h.controller.setTextSelection({ sessionId: SESSION, address: ADDRESS, startLine: 3, endLine: 7 })
    expect(h.controller.activeFile.getSnapshot()).toMatchObject({ startLine: 3, endLine: 7 })
  })

  it('drops the file when the focused tab is not a file resource', () => {
    const h = controllerHarness()
    h.publish()
    h.controller.openResource(ADDRESS)
    expect(h.controller.activeFile.getSnapshot()).toBeDefined()
    h.controller.openTab('guide')
    expect(h.controller.activeFile.getSnapshot()).toBeUndefined()
  })
})
