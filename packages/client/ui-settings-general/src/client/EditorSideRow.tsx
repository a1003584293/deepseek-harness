/** General Settings control for the file dock's side of the conversation. */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './EditorSideRow.module.css'

/** Accepted side and its writer, supplied by the layout owner. */
export interface EditorSideRowInjected {
  hooks: { editorSide: ObservableSnapshot<'left' | 'right'> }
  setEditorSide(side: 'left' | 'right'): void
}

/**
 * Render the file-dock side choice.
 * @param props - current side, writer, and localized copy.
 * @returns the General Settings row.
 */
export function EditorSideRow({ useEditorSide, setEditorSide, t }:
  PropsRuntime<'settings.general.item'> & PropsLocale<'settings'> & InjectFace<EditorSideRowInjected>) {
  const side = useEditorSide(value => value)
  return <div className={css.row}>
    <div>
      <div className={css.title}>{t('editorSide.title')}</div>
      <div className={css.description}>{t('editorSide.description')}</div>
    </div>
    <div className={css.choices} role="group" aria-label={t('editorSide.title')}>
      <Button size="sm" variant={side === 'left' ? 'primary' : 'outline'} onClick={() => { setEditorSide('left') }}>
        {t('editorSide.left')}
      </Button>
      <Button size="sm" variant={side === 'right' ? 'primary' : 'outline'} onClick={() => { setEditorSide('right') }}>
        {t('editorSide.right')}
      </Button>
    </div>
  </div>
}
