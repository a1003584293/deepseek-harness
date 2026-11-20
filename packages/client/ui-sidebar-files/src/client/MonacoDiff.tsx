/**
 * Monaco diff for one source-control selection.
 *
 * The page's Host returns a unified patch, so this reconstructs the old and
 * new hunk texts (with blank padding for skipped lines) and hands them to the
 * shell-owned Monaco vendor. The fallback text diff stays when the shell did
 * not mount Monaco.
 */
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { GitDiffValue } from '@deepseek-ai/dsh-api-workspace-files'
import { codeFontFamily, monaco } from './monaco-api.ts'
import type { CodeAppearance } from './monaco-api.ts'
import css from './MonacoDiff.module.css'

/** The shell-owned Monaco vendor, if the Web entry mounted it. */
export function hasMonaco(): boolean {
  return monaco() !== undefined
}

/**
 * Reconstruct old and new texts from one unified patch. Lines skipped by a
 * hunk stay blank; the hunk headers keep Monaco's line numbers aligned with
 * the file.
 * @param patch - Git's unified diff text.
 * @returns the original and modified sides.
 */
export function parseUnifiedPatch(patch: string): { original: string; modified: string } {
  const original: string[] = []
  const modified: string[] = []
  let oldCursor = 0
  let newCursor = 0
  for (const raw of patch.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line)
    if (hunk !== null) {
      const oldStart = Number(hunk[1])
      const newStart = Number(hunk[3])
      while (oldCursor < oldStart - 1) { original.push(''); oldCursor += 1 }
      while (newCursor < newStart - 1) { modified.push(''); newCursor += 1 }
      continue
    }
    if (line.startsWith('\\ No newline')) continue
    if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')
      || line.startsWith('new file ') || line.startsWith('deleted file ') || line.startsWith('similarity ')
      || line.startsWith('rename ') || line.startsWith('Binary files ')) continue
    if (line.startsWith('+')) { modified.push(line.slice(1)); newCursor += 1 }
    else if (line.startsWith('-')) { original.push(line.slice(1)); oldCursor += 1 }
    else if (line.startsWith(' ')) {
      const text = line.slice(1)
      original.push(text)
      modified.push(text)
      oldCursor += 1
      newCursor += 1
    }
  }
  return { original: original.join('\n'), modified: modified.join('\n') }
}

/**
 * Render one patch as a read-only Monaco diff.
 * @param props.diff - the selected file's patch and scope.
 * @param props.appearance - the code font and palette from the theme settings.
 * @returns the editor host, or nothing for a binary patch.
 */
export function MonacoDiff({ diff, appearance, inline = false }: {
  readonly diff: GitDiffValue
  readonly appearance: CodeAppearance
  /** Use one changed column instead of side-by-side editors. */
  readonly inline?: boolean
}): ReactNode {
  const hostRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const api = monaco()
    const host = hostRef.current
    if (api === undefined || host === null || diff.binary) return
    const { original, modified } = parseUnifiedPatch(diff.patch)
    const originalModel = api.editor.createModel(original, 'plaintext')
    const modifiedModel = api.editor.createModel(modified, 'plaintext')
    const editor = api.editor.createDiffEditor(host, {
      readOnly: true,
      originalEditable: false,
      renderSideBySide: !inline,
      // Monaco otherwise collapses to one editor in a narrow dock even when
      // side-by-side was requested. The source-control layout keeps two editors.
      useInlineViewWhenSpaceIsLimited: false,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: appearance.fontSizes.code,
      fontFamily: codeFontFamily(appearance),
      scrollbar: { verticalScrollbarSize: 16, horizontalScrollbarSize: 16 },
      theme: appearance.active.colorScheme === 'dark' ? 'vs-dark' : 'vs',
    })
    editor.setModel({ original: originalModel, modified: modifiedModel })
    return () => {
      editor.dispose()
      originalModel.dispose()
      modifiedModel.dispose()
    }
  }, [diff, inline, appearance.fontSizes.code, appearance.fontFamilies.code, appearance.active.colorScheme])
  return <div ref={hostRef} className={css.host} data-monaco-diff />
}
