/** Incrementally highlighted source; the document owner supplies the accumulated text and wrap preference. */
import { useEffect, useRef, type ReactNode } from 'react'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { CodeBlock, languageForPath } from '@deepseek-ai/dsh-client-ui-primitives'
import { parseFileAddress } from '@deepseek-ai/dsh-util-workspace-path'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SidebarTextSelection } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { DocumentPreviewProps } from '../document/contract.ts'
import { selectedLineRange } from './selection.ts'
import type {} from './locales.ts'
import css from './CodeBody.module.css'

/** Selection reporting this body publishes to the right Sidebar's active-file chip. */
export interface CodeBodyInjected {
  /**
   * Publish a whole-line selection.
   * @param selection - owning Session, resource address, and 1-based inclusive range.
   */
  reportSelection(selection: SidebarTextSelection): void
  /**
   * Clear the published selection when it belongs to this body.
   * @param selection - owning Session and resource address.
   */
  clearSelection(selection: { readonly sessionId: SessionId; readonly address: string }): void
}

/** Document owner props, this renderer's localized controls, and its selection reporting. */
export type CodeBodyProps = DocumentPreviewProps & PropsLocale<'sidebarCodePreview'> & InjectFace<CodeBodyInjected>

/** @param props - accumulated document contents and framework props. @returns one stable CodeBlock, or no body for byte contents. */
export function CodeBody({
  sessionId, resourceAddress, content, wrap, scrollportRef, useTabInfo, reportSelection, clearSelection, t,
}: CodeBodyProps): ReactNode {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const address = useTabInfo().tab.navigation.address
  // Track the browser selection inside this body so the composer chip can name
  // the selected line range. A sibling body's event cannot clear this one's
  // range: clearing is address-scoped.
  useEffect(() => {
    const root = rootRef.current
    if (root === null) return
    const report = (): void => {
      const range = selectedLineRange(root)
      if (range === undefined) clearSelection({ sessionId, address })
      else reportSelection({ sessionId, address, ...range })
    }
    document.addEventListener('selectionchange', report)
    return () => {
      document.removeEventListener('selectionchange', report)
      clearSelection({ sessionId, address })
    }
  }, [sessionId, address, reportSelection, clearSelection])
  if (content.kind !== 'text') return null
  const file = parseFileAddress(resourceAddress)
  if (file === undefined) throw new Error(`ui-sidebar-documentpreview: not a file address "${resourceAddress}"`)
  const language = languageForPath(file.path)
  return (
    <div ref={rootRef} className={css.renderer} data-code-preview data-wrap={wrap}>
      <CodeBlock
        className={css.code}
        contentRef={scrollportRef}
        code={content.text}
        lang={language}
        streaming={!content.eof}
        wrap={wrap}
        lineNumbers
        copyLabel={t('copy')}
        copiedLabel={t('copied')}
        toolbarLabels={{ codeLabel: t('codeBlock.title'), wrapLabel: t('codeBlock.wrap'), unwrapLabel: t('codeBlock.unwrap') }}
      />
    </div>
  )
}
