import { describe, expect, it, vi } from 'vitest'
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import { SettingsDescribeMirror } from '@deepseek-ai/dsh-client-ui-settings/src/client/settings-mirror.ts'
import { SettingsDocumentStore } from '../src/client/settings-document-store.ts'

/** Store over a real mirror derived from the same scripted context. */
function derivedDocumentStore(remote: object, openEditor = vi.fn()) {
  const ctx = { remote } as never
  return new SettingsDocumentStore(ctx, new SettingsDescribeMirror(ctx), openEditor)
}

function response(hasDocument = false) {
  return { ok: true, value: { writable: true, hasDocument, namespaces: [] } }
}

function prepared(path = '/repo/.dsh/cordis.patch.yml'): RemoteResult<{ path: string }> {
  return { ok: true, value: { path } }
}

function describeFailed(message: string) {
  return { ok: false as const, error: new RemoteError('gateway/internal', message, {}) }
}

describe('SettingsDocumentStore', () => {
  it('loads provider metadata and asks the settings domain to open its document', async () => {
    const describe = vi.fn(() => Promise.resolve(response(true)))
    const openDocument = vi.fn(() => Promise.resolve(prepared()))
    const openEditor = vi.fn()
    const controller = derivedDocumentStore({ settings: { describe, prepareSettingsDocument: openDocument } }, openEditor)
    await controller.load()
    expect(controller.store.getSnapshot()).toEqual({
      status: 'ready', opening: false, error: null,
    })
    await controller.open()
    expect(openDocument).toHaveBeenCalledWith()
    expect(openEditor).toHaveBeenCalledWith('/repo/.dsh/cordis.patch.yml')
  })

  it('marks absent or failed metadata unavailable without opening anything', async () => {
    const openDocument = vi.fn(() => Promise.resolve(prepared()))
    const absent = derivedDocumentStore({
      settings: { describe: () => Promise.resolve(response()), prepareSettingsDocument: openDocument },
    })
    await absent.load()
    await absent.open()
    expect(absent.store.getSnapshot().status).toBe('unavailable')
    expect(openDocument).not.toHaveBeenCalled()

    const failed = derivedDocumentStore({
      settings: { describe: () => Promise.reject(new Error('offline')), prepareSettingsDocument: openDocument },
    })
    await failed.load()
    expect(failed.store.getSnapshot()).toMatchObject({ status: 'unavailable', error: 'offline' })

    const rejected = derivedDocumentStore({
      settings: { describe: () => Promise.resolve(describeFailed('provider failed')), prepareSettingsDocument: openDocument },
    })
    await rejected.load()
    expect(rejected.store.getSnapshot()).toMatchObject({
      status: 'unavailable', error: 'provider failed',
    })
  })

  it('collapses concurrent open gestures and recovers after a failure', async () => {
    let resolveOpen!: (response: RemoteResult<{ path: string }>) => void
    const openDocument = vi.fn(() => new Promise<RemoteResult<{ path: string }>>((resolve) => { resolveOpen = resolve }))
    const controller = derivedDocumentStore({
      settings: { describe: () => Promise.resolve(response(true)), prepareSettingsDocument: openDocument },
    })
    await controller.load()
    const first = controller.open()
    const second = controller.open()
    expect(openDocument).toHaveBeenCalledOnce()
    resolveOpen({ ok: false, error: new RemoteError('gateway/internal', 'no default editor', {}) })
    await Promise.all([first, second])
    expect(controller.store.getSnapshot()).toMatchObject({
      status: 'ready', opening: false, error: 'no default editor',
    })
  })

  it('recovers availability via a mirror refresh after a failed first read', async () => {
    // A first read that failed leaves the action unavailable with the miss
    // recorded; the mirror's next refresh (a commit or reconnect) recovers it.
    const ctx = {
      remote: {
        settings: {
          describe: vi.fn()
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce(response(true)),
          prepareSettingsDocument: vi.fn(),
        },
      },
    } as never
    const mirror = new SettingsDescribeMirror(ctx)
    const caught = new SettingsDocumentStore(ctx, mirror, vi.fn())
    await caught.load()
    expect(caught.store.getSnapshot()).toMatchObject({ status: 'unavailable', error: 'offline' })
    await mirror.load()
    expect(caught.store.getSnapshot()).toMatchObject({ status: 'ready', error: null })
  })
})
