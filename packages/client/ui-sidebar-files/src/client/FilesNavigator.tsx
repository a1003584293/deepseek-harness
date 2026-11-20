/** The pane navigator: workspace files, or source-control changes when that mode is on. */
import type { ReactNode } from 'react'
import type { FactoryComponentPropsOf } from '@deepseek-ai/dsh-client-ui-slots'
import { FileNavigator } from './FileNavigator.tsx'
import { SourceControlNavigator } from './SourceControlNavigator.tsx'

/**
 * Render the pane's current navigator mode. The old tree stays mounted only in
 * file mode, so source-control mode does not list or watch the workspace.
 * @param props - the navigator factory props.
 * @returns the tree or the changes list.
 */
export function FilesNavigator(props: FactoryComponentPropsOf<'sidebar.files.navigator'>): ReactNode {
  const { useStore, useTabInfo } = props
  const { panel } = useTabInfo()
  const sourceControl = useStore(store => store.byPane[panel.id]?.sourceControl === true)
  return sourceControl ? <SourceControlNavigator {...props} /> : <FileNavigator {...props} />
}
