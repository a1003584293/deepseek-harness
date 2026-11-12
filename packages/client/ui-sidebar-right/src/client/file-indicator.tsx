/** Composer chip naming the file addressed by the focused Sidebar tab; a click pins it as a reference draft. */
import type { ReactNode } from 'react'
import { FileTypeIcon } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PinReference } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SidebarActiveFile } from './service.ts'
import type {} from './locales.ts'
import css from './file-indicator.module.css'

/** Hook the plugin supplies to read the focused tab's file, and the pin action. */
export interface FileIndicatorInjected {
  hooks: { activeFile: ObservableSnapshot<SidebarActiveFile | undefined> }
  /**
   * Add one pinned reference to the Session's composer.
   * @param sessionId - target Session.
   * @param reference - path with an optional line range.
   * @returns whether the composer accepted it.
   */
  pin(sessionId: SidebarActiveFile['sessionId'], reference: PinReference): boolean
}

/** Standard session props, the active-file hook, and this namespace's copy. */
export type FileIndicatorProps = PropsRuntime<'conversation.input.dock'> & PropsLocale<'sidebarRight'>
  & InjectFace<FileIndicatorInjected>

/**
 * Leaf filename shown on the chip.
 * @param path - session-workspace-relative or absolute path.
 * @returns its last segment.
 */
function leafName(path: string): string {
  return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1) || path
}

/**
 * Render the focused Sidebar tab's file above the composer. Clicking pins the
 * path, with the published line range when the body reported one, as a draft
 * reference; nothing is pinned until the click.
 * @param props - standard session props, the active-file hook, and composer actions.
 * @returns the pin chip, or null while no file tab is focused in this Session.
 */
export function FileIndicator({ sessionId, useActiveFile, pin, t }: FileIndicatorProps): ReactNode {
  const current = useActiveFile(file => file)
  if (current === undefined || current.sessionId !== sessionId) return null
  const range = current.startLine === undefined || current.endLine === undefined
    ? undefined
    : `${current.startLine}-${current.endLine}`
  return (
    <div className={css.row}>
      <button
        type="button"
        className={css.chip}
        title={t('filePin.pin', { path: current.path })}
        onClick={() => {
          pin(current.sessionId, {
            path: current.path,
            ...current.startLine === undefined ? {} : { startLine: current.startLine },
            ...current.endLine === undefined ? {} : { endLine: current.endLine },
          })
        }}
      >
        <FileTypeIcon path={current.path} size={14} />
        <span className={css.name}>{leafName(current.path)}</span>
        {range !== undefined && <span className={css.range}>{range}</span>}
      </button>
    </div>
  )
}
