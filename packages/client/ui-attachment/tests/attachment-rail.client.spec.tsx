// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { AttachmentRail } from '../src/AttachmentRail.tsx'
import type { AttachmentRailItem, AttachmentRailLabels } from '../src/AttachmentRail.tsx'

afterEach(cleanup)

const labels: AttachmentRailLabels = { group: '待发送附件' }

function item(id: string): AttachmentRailItem {
  return { id }
}

const renderItem = (entry: AttachmentRailItem) => <span>{entry.id}</span>

describe('AttachmentRail', () => {
  it('renders every attachment in draft order inside the group', () => {
    const items = [item('a'), item('b'), item('c')]
    const view = render(<AttachmentRail items={items} labels={labels} renderItem={renderItem} />)
    const rail = view.getByRole('group', { name: '待发送附件' })
    expect([...rail.children].map(child => child.textContent)).toEqual(['a', 'b', 'c'])
  })

  it('offers no horizontal paging controls: overflow wraps into rows', () => {
    const items = [item('a'), item('b'), item('c')]
    const view = render(<AttachmentRail items={items} labels={labels} renderItem={renderItem} />)
    expect(view.queryAllByRole('button')).toHaveLength(0)
  })
})
