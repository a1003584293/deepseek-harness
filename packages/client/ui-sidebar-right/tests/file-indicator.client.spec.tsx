// @vitest-environment jsdom
/** The composer chip's visibility, label, and pin payload. */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { FileIndicator } from '../src/client/file-indicator.tsx'
import type { FileIndicatorProps } from '../src/client/file-indicator.tsx'
import type { SidebarActiveFile } from '../src/client/service.ts'

const SESSION = 's-pin' as SessionId

afterEach(cleanup)

function props(file: SidebarActiveFile | undefined, pin = vi.fn(() => true)): FileIndicatorProps {
  return {
    sessionId: SESSION,
    pin,
    useActiveFile: <T,>(selector: (snapshot: SidebarActiveFile | undefined) => T): T => selector(file),
    t: (key: string, params?: Record<string, string>) => `${key}:${params?.path ?? ''}`,
  } as unknown as FileIndicatorProps
}

describe('FileIndicator', () => {
  it('renders nothing without a focused file or for another Session', () => {
    expect(render(<FileIndicator {...props(undefined)} />).container.firstChild).toBeNull()
    expect(render(<FileIndicator {...props({
      sessionId: 'other' as SessionId, address: 'dsh-resource://file/session/other/a.py', path: 'a.py',
    })} />).container.firstChild).toBeNull()
  })

  it('shows the leaf name and range, then pins the whole path on click', () => {
    const pin = vi.fn(() => true)
    const view = render(<FileIndicator {...props({
      sessionId: SESSION,
      address: 'dsh-resource://file/session/s-pin/api/invoice.py',
      path: 'api/invoice.py',
      startLine: 100,
      endLine: 120,
    }, pin)} />)
    const chip = view.getByRole('button')
    expect(chip.textContent).toContain('invoice.py')
    expect(chip.textContent).toContain('100-120')
    fireEvent.click(chip)
    expect(pin).toHaveBeenCalledWith(SESSION, { path: 'api/invoice.py', startLine: 100, endLine: 120 })
  })

  it('pins a whole file without a range', () => {
    const pin = vi.fn(() => true)
    const view = render(<FileIndicator {...props({
      sessionId: SESSION, address: 'dsh-resource://file/session/s-pin/a.py', path: 'a.py',
    }, pin)} />)
    fireEvent.click(view.getByRole('button'))
    expect(pin).toHaveBeenCalledWith(SESSION, { path: 'a.py' })
  })
})
