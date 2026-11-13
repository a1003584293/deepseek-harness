/** The complete-document reader and guarded writer used by the editor. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { failureOf, openWorkspace, signal, type Harness } from './harness.ts'

let harness: Harness

beforeEach(async () => {
  harness = await openWorkspace('dsh-workspace-files-document-')
})

afterEach(async () => {
  await harness.dispose()
})

describe('workspaceFiles.readDocument', () => {
  it('returns the complete text, version, and byte size', async () => {
    await writeFile(join(harness.workspace, 'notes.md'), '# title\n\nbody\n', 'utf8')
    const result = await harness.endpoint().readDocument(harness.scope, 'notes.md', signal())
    expect(result.text).toBe('# title\n\nbody\n')
    expect(result.bytes).toBe(14)
    expect(result.version.length).toBeGreaterThan(0)
    expect(result.absolutePath.endsWith('notes.md')).toBe(true)
  })

  it('refuses a document beyond the editor byte cap', async () => {
    await writeFile(join(harness.workspace, 'large.txt'), 'x'.repeat(64), 'utf8')
    const failure = await failureOf(harness.endpoint({ maxFileBytes: 16 }).readDocument(harness.scope, 'large.txt', signal()))
    expect(failure.code).toBe('workspace-file/too-large')
  })

  it('refuses a non-UTF-8 document', async () => {
    await writeFile(join(harness.workspace, 'nul.bin'), Buffer.from([0x61, 0x00, 0x62]))
    const failure = await failureOf(harness.endpoint().readDocument(harness.scope, 'nul.bin', signal()))
    expect(failure.code).toBe('workspace-file/not-text')
  })
})

describe('workspaceFiles.writeDocument', () => {
  it('replaces the document and returns the new version', async () => {
    await writeFile(join(harness.workspace, 'notes.md'), 'old\n', 'utf8')
    const service = harness.endpoint()
    const loaded = await service.readDocument(harness.scope, 'notes.md', signal())
    const saved = await service.writeDocument(harness.scope, 'notes.md', 'new\n', loaded.version, signal())
    expect(saved.operation).toBe('update')
    expect(saved.version).not.toBe(loaded.version)
    expect(await readFile(join(harness.workspace, 'notes.md'), 'utf8')).toBe('new\n')
    const again = await service.readDocument(harness.scope, 'notes.md', signal())
    expect(again.text).toBe('new\n')
    expect(again.version).toBe(saved.version)
  })

  it('reports a stale version instead of overwriting a changed file', async () => {
    await writeFile(join(harness.workspace, 'notes.md'), 'v1\n', 'utf8')
    const service = harness.endpoint()
    const loaded = await service.readDocument(harness.scope, 'notes.md', signal())
    await service.writeDocument(harness.scope, 'notes.md', 'v2\n', loaded.version, signal())
    const failure = await failureOf(service.writeDocument(harness.scope, 'notes.md', 'v3\n', loaded.version, signal()))
    expect(failure.code).toBe('workspace-file/stale-version')
    expect(await readFile(join(harness.workspace, 'notes.md'), 'utf8')).toBe('v2\n')
  })

  it('refuses a replacement beyond the editor byte cap', async () => {
    await writeFile(join(harness.workspace, 'notes.md'), 'small\n', 'utf8')
    const service = harness.endpoint({ maxFileBytes: 8 })
    const failure = await failureOf(service.writeDocument(harness.scope, 'notes.md', 'x'.repeat(9), undefined, signal()))
    expect(failure.code).toBe('workspace-file/too-large')
  })
})
