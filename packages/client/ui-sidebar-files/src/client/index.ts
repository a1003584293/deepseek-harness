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
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { createSnapshotStore, type BoundActions } from '@deepseek-ai/dsh-client-store'
import type { PaneId, TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { fileAddressFor, isAbsoluteWorkspacePath, isEditableFileAddress, parseFileAddress, resolveWorkspacePath, sessionFileAddress } from '@deepseek-ai/dsh-util-workspace-path'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { FILES_ID, FILES_KIND, filesDefinition } from './definition.tsx'
import { canOpenOf, createList, createWatch, filesFace, type FilesInjected, type SourceControlFace } from './face.ts'
import { createSearch } from './search-workspace.ts'
import { FileTree } from './FileTree.tsx'
import { FilesNavigator } from './FilesNavigator.tsx'
import { FilesBody } from './FilesBody.tsx'
import { FilesTitle } from './FilesTitle.tsx'
import { en, ja, es, fr, de, ru, pt, zh } from './locales.ts'
import { NavigatorToggle } from './NavigatorToggle.tsx'
import { QuickOpen, type QuickOpenInjected } from './QuickOpen.tsx'
import { expandQuickOpenPath, quickOpenEntry, RECENT_FILES_KEY, rememberRecent, type RecentFiles } from './quick-open.ts'
import { createSearchPreferenceBook, SEARCH_PREFERENCES_KEY } from './search-preferences.ts'
import {
  GIT_DIFF_ID, GIT_DIFF_KIND, GIT_ID, GIT_KIND, SourceControlDiffBody, SourceControlDiffTitle, SourceControlPage, SourceControlTitle,
  gitDiffDefinition, sourceControlDefinition, type GitInjected,
} from './SourceControlBody.tsx'
import {
  EDITOR_ID, EDITOR_KIND, EditFileAction, EditorBody, EditorTitle, editorDefinition, type EditFileActionInjected, type EditorInjected,
} from './EditorBody.tsx'
import { SessionFacts } from './SessionFacts.tsx'
import type { SessionFactsInjected } from './SessionFacts.tsx'
import { createFilesStore } from './store.ts'
import type { MonacoViewState } from './monaco-api.ts'

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

/** The Desktop shell's queue of files the operating system asked to open. */
interface DesktopOpenFiles {
  subscribe(listener: (paths: readonly string[]) => void): () => void
}

/**
 * Required browser services: the tab registry, the keyed seat, the Remote
 * carrier and its namespace, and copy.
 */
export const inject = ['slots', 'locale', 'sessions', 'sidebarRightTabs', 'sidebarRight', 'remote', 'remote.workspaceFiles', 'remote.gitPanel', 'layout', 'theme']

/**
 * Client plugin body: register the type, its shortcut, its dictionaries, the
 * navigator and toggle Factories, the page body, and its
 * chip title.
 * @param ctx - client root context carrying the registry, the slots, and the Remote face.
 */
/** The two account display facts the editor status line renders. */
interface AccountDisplay {
  getSnapshot(): {
    readonly displayName?: string | undefined
    readonly balanceText?: string | undefined
  }
  subscribe(listener: () => void): () => void
}

export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  const handle = createFilesStore()
  // One book for the plugin, not per Session: Sessions rooted at the same workspace share its preferences.
  const preferences = createSearchPreferenceBook(createSnapshotStore<unknown>({}, { persist: { name: SEARCH_PREFERENCES_KEY } }))
  // Restored page tabs lose navigation params but keep their content identity;
  // remember the address per content so the editor can reload its file.
  const editorPaths = createSnapshotStore<Record<string, string>>({}, { persist: { name: 'sidebarEditorPaths' } })
  // Scroll and cursor state per Session path; a reopened editor returns to where
  // the reader left it, including across an application restart.
  const editorViewStates = createSnapshotStore<Record<string, MonacoViewState>>({}, { persist: { name: 'sidebarEditorViewStates' } })
  // Sessions whose active right-sidebar tab is a file editor. The composer hides
  // its facts row only then, because that editor's footer owns them; a preview
  // tab leaves the composer row visible even when an editor is open behind it.
  const editorSessions = createSnapshotStore<ReadonlySet<SessionId>>(new Set())
  const themeSource = {
    getSnapshot: () => ctx.theme.getTheme(),
    subscribe: (listener: () => void) => ctx.on('theme/change', listener),
  }
  const accountName = createSnapshotStore<string | undefined>(undefined)
  const accountBalance = createSnapshotStore<string | undefined>(undefined)
  ctx.effect(() => {
    const sync = (): void => {
      const next = new Set<SessionId>()
      const sessionId = ctx.sidebarRight.mounted.getSnapshot()
      const active = ctx.sidebarRight.active()
      if (sessionId !== undefined && active?.kind === EDITOR_KIND) next.add(sessionId)
      const current = editorSessions.getSnapshot()
      if (current.size === next.size && [...next].every(id => current.has(id))) return
      editorSessions.set(next)
    }
    const stops = [
      ctx.sidebarRight.openTabs.subscribe(sync),
      ctx.sidebarRight.mounted.subscribe(sync),
      ctx.sidebarRight.activeFile.subscribe(sync),
    ]
    sync()
    return () => { for (const stop of stops) stop() }
  }, 'ui-sidebar-files: active editor sessions')
  // The account plugin owns the profile and balance presentation; the status
  // line renders its display text unchanged so cents truncate exactly as the
  // Account settings rows do. The account package cannot be a type dependency
  // here: it reaches this package through the Chat and preview project chain.
  ctx.inject(['accountUi'], (accountCtx) => {
    const account = accountCtx.get('accountUi') as AccountDisplay
    const sync = (): void => {
      const state = account.getSnapshot()
      accountName.set(state.displayName)
      accountBalance.set(state.balanceText)
    }
    sync()
    accountCtx.effect(() => account.subscribe(sync), 'ui-sidebar-files: account status')
  })
  // Every file open, from a tree row, the editor navigator, a preview action,
  // the composer, or the Desktop shell, reaches this one path. It canonicalizes
  // the Session address and focuses an already-open editor instead of adding a
  // second tab for the same absolute file.
  const openEditor = (
    sessionId: SessionId,
    pathOrAddress: string,
    pane?: { readonly id: PaneId; readonly floating: boolean },
  ): void => {
    const cwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
    const path = parseFileAddress(pathOrAddress)?.path ?? pathOrAddress
    const address = fileAddressFor(sessionId, cwd, path)
    const wanted = resolveWorkspacePath(cwd, path).replace(/\\/g, '/')
    for (const tab of ctx.sidebarRight.openTabs.getSnapshot()) {
      if (tab.sessionId !== sessionId || tab.kind !== EDITOR_KIND) continue
      const known = editorPaths.getSnapshot()[tab.contentId]
      if (known === undefined) continue
      const knownPath = parseFileAddress(known)?.path ?? known
      if (resolveWorkspacePath(cwd, knownPath).replace(/\\/g, '/') !== wanted) continue
      ctx.sidebarRight.focus(tab.tabId)
      return
    }
    ctx.sidebarRight.openTabIn(sessionId, EDITOR_KIND, {
      params: { path: address },
      ...pane === undefined || pane.floating ? {} : { paneId: pane.id },
    })
  }
  const gitPanel = (): NonNullable<typeof ctx.remote.gitPanel> => {
    const panel = Reflect.get(ctx.remote, 'gitPanel') as (typeof ctx.remote.gitPanel) | undefined
    if (panel === undefined) throw new Error('source control is unavailable: the gitPanel Remote is not mounted')
    return panel
  }
  const SOURCE_CONTROL_DIFF_KEY = 'sidebarSourceControlDiff'
  const readDiffTarget = (): { readonly path: string; readonly scope: 'working' | 'staged' } | undefined => {
    if (typeof localStorage === 'undefined') return undefined
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(SOURCE_CONTROL_DIFF_KEY) ?? 'null')
      if (parsed === null || typeof parsed !== 'object') return undefined
      const path = Reflect.get(parsed, 'path')
      const scope = Reflect.get(parsed, 'scope')
      return typeof path === 'string' && (scope === 'working' || scope === 'staged') ? { path, scope } : undefined
    } catch (error: unknown) {
      console.warn('sidebar source-control diff target could not be read:', error)
      return undefined
    }
  }
  const sourceControlFace = (sessionId: SessionId): SourceControlFace => {
    return {
      readStatus: signal => gitPanel().status(sessionId, signal),
      stage: (paths, signal) => gitPanel().stage(sessionId, [...paths], signal),
      unstage: (paths, signal) => gitPanel().unstage(sessionId, [...paths], signal),
      openDiff: (path, scope) => {
        try { localStorage.setItem(SOURCE_CONTROL_DIFF_KEY, JSON.stringify({ path, scope })) } catch (error: unknown) {
          console.warn('sidebar source-control diff target could not be saved:', error)
        }
        ctx.sidebarRight.openTabIn(sessionId, GIT_DIFF_KIND, { params: { path, scope } })
      },
      lastDiff: readDiffTarget,
      openFile: (address, pane, edit) => {
        if (edit || isEditableFileAddress(address)) {
          openEditor(sessionId, address, { id: pane.id, floating: pane.floating })
          return
        }
        ctx.sidebarRight.openResourceIn(sessionId, address)
      },
    }
  }
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
  }, workspaceSearch, preferences, ctx.layout.editorSide, openEditor, sourceControlFace)
  // A Factory runs its inject per occurrence, so each store instance gets its
  // one face when it is minted. The shortcut, which acts outside any body, finds
  // the face placed beside the target tab; a tab's loading and loaded drawings
  // each place it, so placements are counted, and the latest face placed wins.
  const faces = new WeakMap<object, FilesInjected>()
  const instances = new Map<SessionId, ReturnType<typeof handle.create>>()
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
      instances.set(sessionId, instance)
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
          // The files shortcut always returns the pane's navigator to the tree,
          // including when source-control changes currently fill it.
          const instance = instances.get(target.sessionId)
          const active = ctx.sidebarRight.active()
          if (active?.kind === GIT_DIFF_KIND) {
            // The diff body draws the file tree in its own left column; keep the
            // diff tab and switch that column instead of opening another tab.
            instance?.actions.sourceControlShown(target.paneId, false)
            return
          }
          if (instance?.getSnapshot().byPane[target.paneId]?.sourceControl === true) {
            instance.actions.sourceControlShown(target.paneId, false)
            instance.actions.shown(target.paneId, true)
            return
          }
          // A second press on the files page closes it, so the shortcut toggles
          // instead of only ever revealing the tree.
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
  ctx.effect(() => ctx.sidebarRightTabs.register(sourceControlDefinition(t)), 'ui-sidebar-files: source control type')
  // Configurable counterpart to the header button: Cmd/Ctrl+Shift+G shows the
  // source-control page. Reopening focuses it instead of adding another tab.
  ctx.inject(['shortcuts'], (ctx) => {
    ctx.effect(() => ctx.shortcuts.register({
      id: 'workspace.sourceControl' as ShortcutCommandId,
      label: () => t('git.title'), aliases: ['source control', 'git', 'changes'],
      defaults: {
        'desktop:macos': { code: 'KeyG', modifiers: ['primary', 'shift'] },
        'desktop:windows': { code: 'KeyG', modifiers: ['primary', 'shift'] },
        'desktop:linux': { code: 'KeyG', modifiers: ['primary', 'shift'] },
      },
      regions: ['page', 'editable', 'terminal'], modals: [],
      resolve: ({ target: element }) => {
        const target = ctx.sidebarRight.commandTarget(element)
        if (target === undefined) return { status: 'blocked', reason: t('shortcut.noSession') }
        return { status: 'handled', run: () => {
          const instance = instances.get(target.sessionId)
          if (instance === undefined) {
            // No file navigator is mounted yet: open the source-control page as
            // the fallback that still exposes the changes list.
            ctx.sidebarRight.openTab(GIT_KIND)
            return
          }
          const shown = instance.getSnapshot().byPane[target.paneId]?.sourceControl === true
          instance.actions.sourceControlShown(target.paneId, !shown)
          if (!shown) instance.actions.shown(target.paneId, true)
        } }
      },
    }), 'ui-sidebar-files: source control shortcut')
  })
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-sidebar-files: dictionaries')

  ctx.effect(() => ctx.slots.registerFactory({
    name: 'sidebar.files.tree', scope: 'root', locale: NS, slots: { accessory: { scope: 'root' } },
  }, FileTree), 'ui-sidebar-files: tree factory')
  ctx.effect(() => ctx.slots.registerFactory({
    name: 'sidebar.files.navigator', scope: 'session', locale: NS, store, inject: injectFace,
  }, FilesNavigator), 'ui-sidebar-files: navigator factory')
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
  // Source control is a page in the same dock: the tab body renders the status
  // groups and the selected patch; Git execution stays behind the Remote.
  const gitInjected = (sessionId: SessionId): GitInjected => {
    return {
      hooks: { theme: themeSource },
      readStatus: signal => gitPanel().status(sessionId, signal),
      readDiff: (path, scope, signal) => gitPanel().diff(sessionId, path, scope, signal),
      stage: (paths, signal) => gitPanel().stage(sessionId, [...paths], signal),
      unstage: (paths, signal) => gitPanel().unstage(sessionId, [...paths], signal),
    }
  }
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: GIT_ID, locale: NS, inject: gitInjected },
    SourceControlPage,
  )), 'ui-sidebar-files: source control tab body')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab.title', key: GIT_ID },
    SourceControlTitle,
  )), 'ui-sidebar-files: source control tab title')
  // A selected patch is its own tab, so opening a diff never replaces the file
  // tab it was reviewed from.
  ctx.effect(() => ctx.sidebarRightTabs.register(gitDiffDefinition(t)), 'ui-sidebar-files: source control diff type')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: GIT_DIFF_ID, locale: NS, store,
    inject: (sessionId: SessionId) => ({
      ...gitInjected(sessionId), sourceControl: sourceControlFace(sessionId),
    }),
  }, SourceControlDiffBody)), 'ui-sidebar-files: source control diff body')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab.title', key: GIT_DIFF_ID, locale: NS,
    inject: (sessionId: SessionId) => ({ sourceControl: sourceControlFace(sessionId) }),
  }, SourceControlDiffTitle)), 'ui-sidebar-files: source control diff title')
  const readBranch = async (sessionId: SessionId, signal: AbortSignal): Promise<string | null> => {
    const panel = Reflect.get(ctx.remote, 'gitPanel') as typeof ctx.remote.gitPanel | undefined
    if (panel === undefined) return null
    try {
      const result = await panel.status(sessionId, signal)
      return result.ok ? result.value.branch : null
    } catch {
      return null
    }
  }
  // Editable files open as their own page. The document preview stays
  // read-only; a double-click (or the preview's edit action) asks for this tab.
  const editorInjected = (sessionId: SessionId): EditorInjected => ({
    readDocument: (path, signal) => ctx.remote.workspaceFiles.readDocument(sessionId, path, signal),
    writeDocument: (path, text, expectedVersion, signal) =>
      ctx.remote.workspaceFiles.writeDocument(sessionId, path, text, expectedVersion, signal),
    pathFor: contentId => editorPaths.getSnapshot()[contentId],
    rememberPath: (contentId, path) => {
      const current = editorPaths.getSnapshot()
      if (current[contentId] !== path) editorPaths.set({ ...current, [contentId]: path })
    },
    viewStateFor: path => editorViewStates.getSnapshot()[`${sessionId}\u0000${path}`],
    rememberViewState: (path, state) => {
      const key = `${sessionId}\u0000${path}`
      editorViewStates.set({ ...editorViewStates.getSnapshot(), [key]: state })
    },
    reportSelection: (selection) => {
      const sidebar = ctx.get('sidebarRight') as {
        setTextSelection(selection: unknown): void
      } | undefined
      sidebar?.setTextSelection(selection)
    },
    clearSelection: (selection) => {
      const sidebar = ctx.get('sidebarRight') as {
        clearTextSelection(sessionId: unknown, address: string): void
      } | undefined
      sidebar?.clearTextSelection(selection.sessionId, selection.address)
    },
    publishFile: (contentId, address) => {
      const sidebar = ctx.get('sidebarRight') as {
        setPageFile(sessionId: unknown, contentId: string, address: string): void
      } | undefined
      sidebar?.setPageFile(sessionId, contentId, address)
    },
    clearFile: (contentId, address) => {
      const sidebar = ctx.get('sidebarRight') as {
        clearPageFile(sessionId: unknown, contentId: string, address: string): void
      } | undefined
      sidebar?.clearPageFile(sessionId, contentId, address)
    },
    openEditor: (path, pane) => { openEditor(sessionId, path, pane) },
    readBranch: signal => readBranch(sessionId, signal),
    hooks: { accountName, accountBalance, theme: themeSource },
  })
  const editorType = editorDefinition(t)
  ctx.effect(() => ctx.sidebarRightTabs.register(editorType), 'ui-sidebar-files: editor tab type')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: EDITOR_ID, locale: NS, inject: editorInjected },
    EditorBody,
  )), 'ui-sidebar-files: editor tab body')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register(
    {
      name: 'sidebar.right.pane.tab.title', key: EDITOR_ID,
      inject: () => ({ pathFor: (contentId: string) => editorPaths.getSnapshot()[contentId] }),
    },
    EditorTitle,
  )), 'ui-sidebar-files: editor tab title')
  ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document.actions', () => ctx.slots.register({
    name: 'sidebar.right.tab.document.actions', id: EDITOR_ID, locale: NS,
    inject: (sessionId): EditFileActionInjected => ({
      openEditor: (path) => { openEditor(sessionId, path) },
    }),
  }, EditFileAction)), 'ui-sidebar-files: preview edit action')
  // The composer's facts row mirrors the editor footer, but only while no file
  // editor tab is open: the footer already owns these facts when it shows.
  const factsInjected = (sessionId: SessionId): SessionFactsInjected => ({
    hooks: { accountName, accountBalance, editorSessions },
    readBranch: signal => readBranch(sessionId, signal),
  })
  ctx.effect(() => ctx.slots.inject('conversation.composer.facts', () => ctx.slots.register({
    name: 'conversation.composer.facts', inject: factsInjected,
  }, SessionFacts)), 'ui-sidebar-files: composer facts')

  // One opener for files the composer receives and files the Desktop shell was
  // asked to open: text-like files get the Monaco page, everything else the
  // preview that claims the file's session address (absolute paths included).
  const openPath = (sessionId: SessionId, path: string): void => {
    if (isEditableFileAddress(path)) {
      openEditor(sessionId, path)
      return
    }
    const cwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
    ctx.sidebarRight.openResourceIn(sessionId, fileAddressFor(sessionId, cwd, path))
  }
  ctx.on('conversation/file-reference', ({ sessionId, path }) => { openPath(sessionId, path) })
  let pendingDesktopFiles: string[] = []
  const flushDesktopFiles = (): void => {
    const sessionId = ctx.sidebarRight.mounted.getSnapshot()
    if (sessionId === undefined || pendingDesktopFiles.length === 0) return
    const paths = pendingDesktopFiles
    pendingDesktopFiles = []
    for (const path of paths) openPath(sessionId, path)
  }
  ctx.effect(() => {
    const bridge = (globalThis as { dshDesktop?: { openFiles?: DesktopOpenFiles } }).dshDesktop?.openFiles
    if (bridge === undefined) return () => {}
    const unsubscribeFiles = bridge.subscribe((paths) => {
      pendingDesktopFiles.push(...paths)
      flushDesktopFiles()
    })
    const unsubscribeMounted = ctx.sidebarRight.mounted.subscribe(() => { flushDesktopFiles() })
    flushDesktopFiles()
    return () => {
      unsubscribeFiles()
      unsubscribeMounted()
      pendingDesktopFiles = []
    }
  }, 'ui-sidebar-files: desktop open files')

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
    resolvePath: query => expandQuickOpenPath(query, ctx.remote.$host.home),
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
