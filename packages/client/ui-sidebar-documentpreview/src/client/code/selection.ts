/** Whole-line source range covered by a browser selection inside one rendered code block. */
export interface CodeLineRange {
  readonly startLine: number
  readonly endLine: number
}

/** Climb from a selection endpoint to the rendered line that contains it. */
function lineElement(node: Node, root: HTMLElement): HTMLElement | undefined {
  let current: Node | null = node
  while (current !== null && current !== root) {
    if (current instanceof HTMLElement && current.classList.contains('line')) return current
    current = current.parentNode
  }
  return undefined
}

/**
 * Resolve the inclusive 1-based line range the browser selection covers inside
 * one code block. Both the plain and the highlighted renderers place one
 * `.line` element per source line.
 * @param root - element containing the rendered lines.
 * @returns the selected range, or undefined outside the block or with no selection.
 */
export function selectedLineRange(root: HTMLElement): CodeLineRange | undefined {
  const selection = window.getSelection()
  if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) return undefined
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return undefined
  const startElement = lineElement(range.startContainer, root)
  const endElement = lineElement(range.endContainer, root)
  if (startElement === undefined || endElement === undefined) return undefined
  const lines = [...root.querySelectorAll<HTMLElement>('.line')]
  const startIndex = lines.indexOf(startElement)
  let endIndex = lines.indexOf(endElement)
  if (startIndex < 0 || endIndex < startIndex) return undefined
  // A selection that ends at the very start of a line stops on the line before it.
  if (endIndex > startIndex && range.endOffset === 0) endIndex -= 1
  return { startLine: startIndex + 1, endLine: endIndex + 1 }
}
