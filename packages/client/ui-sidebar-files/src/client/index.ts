import type {} from '@deepseek-ai/dsh-client-ui-context-menu/client'
/**
 * Browser half: register `files` as a right-Sidebar tab type, and the
 * workspace navigator beside every file preview. The navigator, the page body,
 * and the toggle share one store and one face per store instance. The package
 * README lists the registrations. Search lives in `search-workspace.ts`, which
 * binds the Host's workspace search, `search-rules.ts`, `search-tree.ts`,
 * `search-preferences.ts`, and `SearchSettings.tsx`.
 */
import type { ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { createSnapshotStore, type BoundActions } from '@deepseek-ai/dsh-client-store'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { isAbsoluteWorkspacePath, parseFileAddress, sessionFileAddress } from '@deepseek-ai/dsh-util-workspace-path'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { FILES_ID, FILES_KIND, filesDefinition } from './definition.tsx'
import { canOpenOf, createList, createWatch, filesFace, type FilesInjected } from './face.ts'
import { createSearch } from './search-workspace.ts'
import { FileTree } from './FileTree.tsx'
import { FileNavigator } from './FileNavigator.tsx'
import { FilesBody } from './FilesBody.tsx'
import { FilesTitle } from './FilesTitle.tsx'
import { en, ja, es, fr, de, ru, pt, zh } from './locales.ts'
import { NavigatorToggle } from './NavigatorToggle.tsx'
import { QuickOpen, type QuickOpenInjected } from './QuickOpen.tsx'
import { quickOpenEntry, RECENT_FILES_KEY, rememberRecent, type RecentFiles } from './quick-open.ts'
import { createSearchPreferenceBook, SEARCH_PREFERENCES_KEY } from './search-preferences.ts'
import { createFilesStore } from './store.ts'

export type { SidebarFilesKey } from './locales.ts'
export type { DirLevel, FilesPaneState, FilesSearchResult, FilesSearchState, FilesState, FilesTreeState, LevelState } from './store.ts'
export type { FilesInjected, ListWorkspaceDirectory, WorkspaceFilesListRemote } from './face.ts'
export type { SearchWorkspace, WorkspaceFilesSearchRemote, WorkspaceSearchAnswer, WorkspaceSearchRequest } from './search-workspace.ts'
export type { SearchMatch } from './search-tree.ts'
export type { ExclusionRule, WorkspaceSearchPreferences } from './search-rules.ts'
export type { FilesBodyProps } from './FilesBody.tsx'
// Also keeps the Factory declaration in this entry's emitted types, which an `import type {}` would not.
export type { TreeEntry, TreeEntryMeta, TreeEntryKind, TreeDirectoryState, FileTreeInput } from './FileTree.tsx'
export type { FileNavigatorInput } from './FileNavigator.tsx'
export type { NavigatorToggleInput } from './NavigatorToggle.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Workspace directory actions after the `files` page's reload control. */
    'sidebar.right.tab.files.actions': {
      kind: 'list'
      scope: 'session'
      owner: {
        /** Absolute directory path displayed by the file tree. */
        readonly absolutePath: string
      }
    }
  }
}

/** This package's copy namespace. */
const NS = 'sidebarFiles'

/**
 * Required browser services: the tab registry, the keyed seat, the Remote
 * carrier and its namespace, and copy.
 */
export const inject = ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight', 'remote', 'remote.workspaceFiles', 'layout']

/**
 * Client plugin body: register the type, its shortcut, its dictionaries, the
 * navigator and toggle Factories, the page body, and its
 * chip title.
 * @param ctx - client root context carrying the registry, the slots, and the Remote face.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  const handle = createFilesStore()
  // One book for the plugin, not per Session: Sessions rooted at the same workspace share its preferences.
  const preferences = createSearchPreferenceBook(createSnapshotStore<unknown>({}, { persist: { name: SEARCH_PREFERENCES_KEY } }))
  const workspaceSearch = createSearch(ctx.remote)
  const face = filesFace(createList(ctx.remote), createWatch(ctx.remote), canOpenOf(ctx.sidebarRightTabs), (sessionId, tabId) => {
    const source = ctx.sidebarRight.tabDomain.occurrence(sessionId, { id: tabId }).navigation
    return {
      getSnapshot: () => source.getSnapshot(),
      subscribe: listener => ctx.effect(() => {
        let active = true
        const unsubscribe = source.subscribe(() => {
          // The tab's navigation is recorded inside the layout operation; observe its committed drawing.
          queueMicrotask(() => { if (active) listener() })
        })
        return () => { active = false; unsubscribe() }
      }, 'ui-sidebar-files: tab navigation'),
    }
  }, workspaceSearch, preferences, ctx.layout.editorSide)
  // A Factory runs its inject per occurrence, so each store instance gets its
  // one face when it is minted. The shortcut, which acts outside any body, finds
  // the face placed beside the target tab; a tab's loading and loaded drawings
  // each place it, so placements are counted, and the latest face placed wins.
  const faces = new WeakMap<object, FilesInjected>()
  const beside = new Map<SessionId, Map<TabId, { readonly face: FilesInjected; placed: number }>>()
  const place = (sessionId: SessionId) => (tabId: TabId, bound: FilesInjected): () => void => {
    const tabs = beside.get(sessionId) ?? new Map<TabId, { readonly face: FilesInjected; placed: number }>()
    beside.set(sessionId, tabs)
    const held = tabs.get(tabId)
    const entry = held?.face === bound ? held : { face: bound, placed: 0 }
    entry.placed += 1
    tabs.set(tabId, entry)
    let placed = true
    return () => {
      if (!placed) return
      placed = false
      entry.placed -= 1
      if (entry.placed > 0 || tabs.get(tabId) !== entry) return
      tabs.delete(tabId)
      if (tabs.size === 0) beside.delete(sessionId)
    }
  }
  const store: typeof handle = {
    ...handle,
    create: (scopeKey) => {
      const instance = handle.create(scopeKey)
      if (scopeKey === undefined) return instance
      const sessionId = scopeKey as SessionId
      faces.set(instance.actions, face(sessionId, instance, place(sessionId)))
      return instance
    },
  }
  const injectFace = (sessionId: SessionId, actions: BoundActions<typeof handle>): FilesInjected => {
    const bound = faces.get(actions)
    if (bound === undefined) throw new Error(`ui-sidebar-files: Session "${sessionId}" has no files store instance`)
    return bound
  }

  ctx.inject(['shortcuts'], (ctx) => {
    ctx.effect(() => ctx.shortcuts.register({
      id: 'workspace.files' as ShortcutCommandId, label: () => t('guide.title'), aliases: ['workspace files', 'files'],
      defaults: {
        'desktop:macos': { code: 'KeyE', modifiers: ['primary', 'shift'] },
        'desktop:windows': { code: 'KeyE', modifiers: ['primary', 'shift'] },
        'desktop:linux': { code: 'KeyE', modifiers: ['primary', 'shift'] },
        'web:macos': { code: 'KeyE', modifiers: ['primary', 'shift'] },
        'web:windows': { code: 'KeyE', modifiers: ['primary', 'shift'] },
      },
      // Each tab plugin owns its command's availability, localized refusal, and tab kind.
      /* jscpd:ignore-start */
      regions: ['page', 'editable', 'terminal'], modals: [],
      resolve: ({ target: element }) => {
        const target = ctx.sidebarRight.commandTarget(element)
        if (target === undefined) return { status: 'blocked', reason: t('shortcut.noSession') }
        /* jscpd:ignore-end */
        return { status: 'handled', run: () => {
          // A second press on the files page closes it, so the shortcut toggles
          // instead of only ever revealing the tree.
          const active = ctx.sidebarRight.active()
          if (active !== undefined && active.kind === FILES_KIND) {
            ctx.sidebarRight.close(active.id)
            return
          }
          // A docked tab with a navigator beside its content that can draw a tree keeps it:
          // the navigator is shown and its search field takes the keyboard; a second
          // press hides it again, like the files page it shares its state with.
          const placed = target.tabId === undefined ? undefined : beside.get(target.sessionId)?.get(target.tabId)
          if (target.host === 'dock' && placed !== undefined) {
            if (!ctx.sidebarRight.isExpanded()) {
              ctx.sidebarRight.toggleExpanded()
              placed.face.focus(target.paneId)
              return
            }
            if (placed.face.isShown(target.paneId)) {
              placed.face.hide(target.paneId)
              return
            }
            placed.face.focus(target.paneId)
            return
          }
          // Elsewhere the files page opens or is revealed and focused; its tree always shows.
          ctx.sidebarRight.openTabFromTarget(FILES_KIND, target)
        } }
      },
    }), 'ui-sidebar-files: shortcut')
  })
  ctx.effect(() => ctx.sidebarRightTabs.register(filesDefinition(t)), 'ui-sidebar-files: files type')
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-sidebar-files: dictionaries')

  ctx.effect(() => ctx.slots.registerFactory({
    name: 'sidebar.files.tree', scope: 'root', locale: NS, slots: { accessory: { scope: 'root' } },
  }, FileTree), 'ui-sidebar-files: tree factory')
  ctx.effect(() => ctx.slots.registerFactory({
    name: 'sidebar.files.navigator', scope: 'session', locale: NS, store, inject: injectFace,
  }, FileNavigator), 'ui-sidebar-files: navigator factory')
  ctx.effect(() => ctx.slots.registerFactory({
    name: 'sidebar.files.navigator.toggle', scope: 'session', locale: NS, store, inject: injectFace,
  }, NavigatorToggle), 'ui-sidebar-files: navigator toggle factory')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    {
      name: 'sidebar.right.pane.tab', key: FILES_ID, locale: NS, store, inject: injectFace,
      children: { 'sidebar.right.tab.files.actions': { kind: 'list', scope: 'session' } },
    },
    FilesBody,
  )), 'ui-sidebar-files: files tab body')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab.title', key: FILES_ID },
    FilesTitle,
  )), 'ui-sidebar-files: files tab title')

  // Quick open: a VS Code-style palette over recent files and the workspace.
  // The sequence value only says "opened again", so one entry resets its query.
  const quickOpen = createSnapshotStore<number | null>(null)
  const recentFiles = createSnapshotStore<RecentFiles>({}, { persist: { name: RECENT_FILES_KEY } })
  // A file tab records its path once per Session, whichever surface opened it.
  ctx.effect(() => {
    const seen = new Set<string>()
    const sync = (): void => {
      let next = recentFiles.getSnapshot()
      for (const tab of ctx.sidebarRight.openTabs.getSnapshot()) {
        const address = parseFileAddress(tab.contentId)
        if (address === undefined) continue
        const key = `${tab.sessionId}\u0000${address.path}`
        if (seen.has(key)) continue
        seen.add(key)
        next = rememberRecent(next, tab.sessionId, address.path)
      }
      if (next !== recentFiles.getSnapshot()) recentFiles.set(next)
    }
    const unsubscribe = ctx.sidebarRight.openTabs.subscribe(sync)
    sync()
    return unsubscribe
  }, 'ui-sidebar-files: recent files')
  let quickOpenSequence = 0
  ctx.inject(['shortcuts'], (ctx) => {
    ctx.effect(() => ctx.shortcuts.register({
      id: 'workspace.quickOpen' as ShortcutCommandId,
      label: () => t('quickOpen.command'), aliases: ['quick open', 'go to file'],
      defaults: {
        'desktop:macos': { code: 'KeyP', modifiers: ['primary'] },
        'desktop:windows': { code: 'KeyP', modifiers: ['primary'] },
        'desktop:linux': { code: 'KeyP', modifiers: ['primary'] },
        'web:macos': { code: 'KeyP', modifiers: ['primary', 'alt'] },
        'web:windows': { code: 'KeyP', modifiers: ['primary', 'alt'] },
      },
      regions: ['page', 'editable', 'terminal'], modals: ['quickOpen'],
      resolve: () => ctx.sidebarRight.mounted.getSnapshot() === undefined
        ? { status: 'blocked', reason: t('shortcut.noSession') }
        : {
          status: 'handled',
          run: () => {
            if (quickOpen.getSnapshot() !== null) { quickOpen.set(null); return }
            quickOpenSequence += 1
            quickOpen.set(quickOpenSequence)
          },
        },
    }), 'ui-sidebar-files: quick open shortcut')
  })
  const quickOpenInjected = (): QuickOpenInjected => ({
    hooks: { open: quickOpen, recent: recentFiles, mounted: ctx.sidebarRight.mounted },
    close: () => { quickOpen.set(null) },
    openFile: (path) => {
      const sessionId = ctx.sidebarRight.mounted.getSnapshot()
      if (sessionId === undefined) return
      ctx.sidebarRight.openResource(sessionFileAddress(sessionId, path))
    },
    search: async (query, signal) => {
      const sessionId = ctx.sidebarRight.mounted.getSnapshot()
      if (sessionId === undefined) return []
      // An absolute path names exactly one file: show it only when a regular
      // file exists there, and never substitute a workspace name search.
      if (isAbsoluteWorkspacePath(query)) {
        const path = query.replace(/\\/g, '/')
        try {
          const stat = await ctx.remote.workspaceFiles.stat(sessionId, path, signal)
          return stat.ok ? [quickOpenEntry(path)] : []
        } catch (_error) {
          // A failed stat leaves the palette empty, like a missing file.
          return []
        }
      }
      try {
        const result = await workspaceSearch(
          sessionId,
          { query, excludedPaths: [], includeHidden: false, respectGitignore: true },
          signal,
        )
        if (!result.ok) return []
        return result.value.matches.filter(match => match.type === 'file').map(match => quickOpenEntry(match.path))
      } catch (_error) {
        // A failed search leaves the palette empty; the tree's own search
        // reports the Host failure where the user asked for it.
        return []
      }
    },
  })
  ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'files.quick-open', locale: NS, inject: quickOpenInjected,
  }, QuickOpen)), 'ui-sidebar-files: quick open entry')
}
