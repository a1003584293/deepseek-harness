/** Right sidebar slide and reveal-flash style contracts. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/shell/SidebarRight.module.css', import.meta.url)), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
const host = String.raw`:global\(\[data-dockkit-host='dock'\]\)`

describe('SidebarRight.module.css', () => {
  it('starts docked items mounted by an opening at the closed position', () => {
    expect(css).toMatch(new RegExp(String.raw`@starting-style\s*\{\s*\.panel\[data-sidebar-right-opening\] ${host},[^{}]*\{`
      + String.raw`\s*transform: translateX\(var\(--dsh-sidebar-width\)\);\s*}\s*}`))
  })

  it('clears the traffic lights and leading controls when a left-docked panel reaches the window edge', () => {
    expect(css).toMatch(new RegExp(String.raw`:global\(\[data-platform='darwin'\]\)\s*`
      + String.raw`:global\(\[data-editor-side='left'\]\[data-sidebar-collapsed\]\)\s*`
      + String.raw`\.panel\[data-sidebar-right-panel='push'\]\s*`
      + String.raw`:global\(\[data-dockkit-host='dock'\]\[data-dockkit-column='0'\]\)\s*\{\s*`
      + String.raw`--dsh-dockkit-strip-inline-start: var\(--dsh-frame-leading-clearance\);\s*}`))
  })

  it('removes the open slide as well as the close slide for reduced motion', () => {
    expect(css).toMatch(new RegExp(String.raw`@media \(prefers-reduced-motion: reduce\)\s*\{[^{}]*`
      + String.raw`\.panel\[data-sidebar-right-open\] ${host}[^{}]*\{\s*transition: none;\s*}`))
  })

  it('draws the reveal glow inside a docked pane above sticky code banners, and outside a floating panel over its own shadow', () => {
    const pane = String.raw`\.panel :global\(\[data-dockkit-pane\]\[data-sidebar-right-flash\]\)`
    const float = String.raw`\.panel :global\(\[data-dockkit-float\]\[data-sidebar-right-flash\]\)`
    const layer = new RegExp(String.raw`${pane}::after\s*\{([^{}]*)}`).exec(css)?.[1] ?? ''
    expect(layer).toMatch(/content: '';\s*position: absolute;\s*inset: 0;\s*z-index: 7;\s*pointer-events: none;/)
    expect(layer).toMatch(/--sidebar-right-flash-from:\s*inset /)
    expect(css).toMatch(new RegExp(String.raw`${pane}\s*\{\s*position: relative;\s*}`))
    const panel = new RegExp(String.raw`${float}\s*\{(\s*--sidebar-right-flash-from[^{}]*)}`).exec(css)?.[1] ?? ''
    expect(panel).toMatch(/--sidebar-right-flash-from:\s*var\(--dsw-elevation-prominent\),/)
    expect(panel).toMatch(/--sidebar-right-flash-to:\s*var\(--dsw-elevation-prominent\),/)
  })
})
