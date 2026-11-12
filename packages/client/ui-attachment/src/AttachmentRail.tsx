/** Draft-attachment rail: wraps every draft item onto new rows above the composer. */

import type { ReactNode } from 'react'
import css from './AttachmentRail.module.css'

/** One ordered draft attachment rendered by the rail owner. */
export interface AttachmentRailItem {
  /** Stable identity for the React key. */
  id: string
}

/** Rail-level strings the owner resolves from its own locale namespace. */
export interface AttachmentRailLabels {
  /** Accessible name of the rail group. */
  group: string
}

/**
 * Wrapping rail over the caller's ordered draft attachments.
 *
 * Items keep their intrinsic width and wrap onto additional rows instead of
 * scrolling horizontally, so a pinned reference is never hidden behind a
 * paging control. The owner renders each item and decides mounting; it
 * renders the rail only while items exist.
 *
 * @param props.items - attachments in draft order.
 * @param props.labels - rail-level strings (the group name).
 * @param props.renderItem - render one attachment card in draft order.
 * @returns the rail group.
 */
export function AttachmentRail<T extends AttachmentRailItem>({ items, labels, renderItem }: {
  items: readonly T[]
  labels: AttachmentRailLabels
  renderItem: (item: T) => ReactNode
}) {
  return (
    <div className={css.rail} role="group" aria-label={labels.group}>
      {items.map(item => (
        <div key={item.id} className={css.item}>{renderItem(item)}</div>
      ))}
    </div>
  )
}
