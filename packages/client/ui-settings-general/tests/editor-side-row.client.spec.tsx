// @vitest-environment jsdom
/** The file-dock side row: it shows the current side and writes the chosen one. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { EditorSideRow } from '../src/client/EditorSideRow.tsx'

afterEach(cleanup)

const t = ((key: string) => key) as never

/** Render the row over one side and return its writer. */
function row(side: 'left' | 'right') {
  const store = createSnapshotStore<'left' | 'right'>(side)
  const setEditorSide = vi.fn()
  const props = {
    useEditorSide: (selector: (value: 'left' | 'right') => unknown) => selector(store.getSnapshot()),
    setEditorSide,
    t,
  } as unknown as Parameters<typeof EditorSideRow>[0]
  render(<EditorSideRow {...props} />)
  return { setEditorSide }
}

describe('EditorSideRow', () => {
  it('writes the side the reader clicks', () => {
    const { setEditorSide } = row('right')
    expect(screen.getByText('editorSide.title')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'editorSide.left' }))
    expect(setEditorSide).toHaveBeenLastCalledWith('left')
    fireEvent.click(screen.getByRole('button', { name: 'editorSide.right' }))
    expect(setEditorSide).toHaveBeenLastCalledWith('right')
  })
})
