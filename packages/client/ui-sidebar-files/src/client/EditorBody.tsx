/**
 * The editable Monaco page for one workspace file.
 *
 * The Host supplies the complete document and a version token; a save sends
 * both back so a file that changed on disk becomes a conflict instead of a
 * silent overwrite. The shell owns the Monaco vendor and its worker.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { WorkspaceFileDocument, WorkspaceFileWrite } from '@deepseek-ai/dsh-api-workspace-files'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarRightTabDefinition, SidebarTextSelection } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import { FileTypeIcon, IconEditOutlineRegular, classifyFileType } from '@deepseek-ai/dsh-client-ui-primitives'
import { parseFileAddress, sessionFileAddress } from '@deepseek-ai/dsh-util-workspace-path'
import { loadMonacoLanguage, monaco } from './monaco-api.ts'
import type { MonacoEditor } from './monaco-api.ts'
import css from './EditorBody.module.css'
import type {} from './locales.ts'

/** The tab kind of the editable document page. */
export const EDITOR_KIND = 'file-editor'

/** This implementation's identity in the tab system, and the key its body registers under. */
export const EDITOR_ID = '@deepseek-ai/dsh-client-ui-sidebar-files/editor'

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightTabParamsMap {
    /** One workspace file, absolute or relative to the Session workspace root. */
    'file-editor': { readonly path: string }
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Text preview header contributions; the file's absolute Host path is the owner share. */
    'sidebar.right.tab.document.actions': {
      kind: 'list'
      scope: 'session'
      owner: { readonly absolutePath: string }
    }
  }
}

/** The complete-file operations the editor calls for its Session. */
export interface EditorInjected {
  /** Load a complete UTF-8 document and its save version. */
  readonly readDocument: (path: string, signal: AbortSignal) => Promise<RemoteResult<WorkspaceFileDocument>>
  /** Replace the complete document, guarded by the loaded version. */
  readonly writeDocument: (
    path: string,
    text: string,
    expectedVersion: string | undefined,
    signal: AbortSignal,
  ) => Promise<RemoteResult<WorkspaceFileWrite>>
  /** The last address this editor content opened, for a restored page whose navigation params are gone. */
  readonly pathFor: (contentId: string) => string | undefined
  /** Remember the address this editor content opened. */
  readonly rememberPath: (contentId: string, path: string) => void
  /** Publish the current whole-line code selection to the composer indicator. */
  readonly reportSelection: (selection: SidebarTextSelection) => void
  /** Clear a selection that belongs to this editor. */
  readonly clearSelection: (selection: { readonly sessionId: SidebarTextSelection['sessionId']; readonly address: string }) => void
}

/** Standard tab seat, namespace copy, and the complete-file operations. */
export type EditorBodyProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'sidebarFiles'> & InjectFace<EditorInjected>

/** The editor type's registry definition. */
export function editorDefinition(t: TranslateNS<'sidebarFiles'>): SidebarRightTabDefinition {
  return {
    id: EDITOR_ID,
    kind: EDITOR_KIND,
    multiple: true,
    priority: 'builtin',
    title: () => t('editor.title'),
  }
}

/** The tab title: the file's type glyph and basename. */
export function EditorTitle({ useTabInfo }: PropsRuntime<'sidebar.right.pane.tab.title'>): ReactNode {
  const { tab } = useTabInfo()
  const address = tab.navigation.params?.path ?? ''
  const name = (parseFileAddress(address)?.path ?? address).split(/[\\/]/).pop() ?? address
  return (
    <>
      <FileTypeIcon kind={classifyFileType(name)} size={16} className={css.titleIcon} />
      <span className={css.titleText}>{name}</span>
    </>
  )
}

/** Languages registered by the shell's selective Monaco vendor, in picker order. */
const EDITOR_LANGUAGES: readonly { readonly id: string; readonly label: string }[] = [
  { id: 'plaintext', label: 'Plain Text' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'json', label: 'JSON' },
  { id: 'yaml', label: 'YAML' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'shell', label: 'Shell' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'sql', label: 'SQL' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'java', label: 'Java' },
  { id: 'cpp', label: 'C / C++' },
  { id: 'csharp', label: 'C#' },
  { id: 'php', label: 'PHP' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'xml', label: 'XML' },
  { id: 'ini', label: 'INI / TOML' },
  { id: 'dockerfile', label: 'Dockerfile' },
]

/** Monaco language id from the file extension. */
function languageOf(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase() ?? ''
  const known: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    json: 'json', jsonc: 'json', md: 'markdown', markdown: 'markdown',
    yml: 'yaml', yaml: 'yaml', py: 'python', sh: 'shell', bash: 'shell', zsh: 'shell',
    html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less', xml: 'xml',
    sql: 'sql', go: 'go', rs: 'rust', java: 'java', c: 'c', h: 'c', cpp: 'cpp',
    cc: 'cpp', cxx: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php', rb: 'ruby',
    toml: 'ini', ini: 'ini', conf: 'ini', dockerfile: 'dockerfile',
  }
  return known[extension] ?? 'plaintext'
}

/** True when the app is running the dark theme. */
function darkTheme(): boolean {
  return document.body.hasAttribute('data-ds-dark-theme')
}

/**
 * Render one editable document.
 * @param props - the tab occurrence, namespace copy, and complete-file operations.
 * @returns the editor header above the Monaco surface.
 */
export function EditorBody({
  sessionId, useTabInfo, readDocument, writeDocument, pathFor, rememberPath, reportSelection, clearSelection, t,
}: EditorBodyProps): ReactNode {
  const { tab } = useTabInfo()
  const address = tab.navigation.params?.path ?? pathFor(tab.contentId) ?? ''
  const path = parseFileAddress(address)?.path ?? address
  const fileAddress = address.startsWith('dsh-resource://file/') ? address : sessionFileAddress(sessionId, path)
  const [document, setDocument] = useState<WorkspaceFileDocument>()
  const [text, setText] = useState('')
  const [language, setLanguage] = useState(() => languageOf(path))
  const [error, setError] = useState<string>()
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<MonacoEditor>()
  const savedText = useRef('')
  const version = useRef<string>()
  const savingRef = useRef(false)
  const readRef = useRef(readDocument)
  readRef.current = readDocument
  const writeRef = useRef(writeDocument)
  writeRef.current = writeDocument
  const tRef = useRef(t)
  tRef.current = t
  const rememberRef = useRef(rememberPath)
  rememberRef.current = rememberPath
  const saveRef = useRef<() => void>(() => {})

  useEffect(() => { setLanguage(languageOf(path)) }, [path])

  useEffect(() => {
    if (address === '') {
      setDocument(undefined)
      setError(undefined)
      setDirty(false)
      return
    }
    rememberRef.current(tab.contentId, address)
    const controller = new AbortController()
    setDocument(undefined)
    setError(undefined)
    setDirty(false)
    void (async () => {
      try {
        const result = await readRef.current(path, controller.signal)
        if (controller.signal.aborted) return
        if (result.ok) {
          savedText.current = result.value.text
          version.current = result.value.version
          setText(result.value.text)
          setDocument(result.value)
        } else setError(tRef.current('editor.readFailed', { message: result.error.message }))
      } catch (cause: unknown) {
        if (!controller.signal.aborted) {
          setError(tRef.current('editor.readFailed', { message: cause instanceof Error ? cause.message : String(cause) }))
        }
      }
    })()
    return () => { controller.abort() }
  }, [address, path, reloadKey, tab.contentId])

  const save = useCallback(async (): Promise<void> => {
    if (document === undefined || savingRef.current) return
    const editor = editorRef.current
    const value = editor === undefined ? text : editor.getValue()
    if (value === savedText.current) {
      setDirty(false)
      return
    }
    savingRef.current = true
    setSaving(true)
    setError(undefined)
    const controller = new AbortController()
    try {
      const result = await writeRef.current(path, value, version.current, controller.signal)
      if (result.ok) {
        version.current = result.value.version
        savedText.current = value
        setDirty(false)
      } else if (result.error.code === 'workspace-file/stale-version') {
        setError(t('editor.conflict'))
      } else setError(t('editor.saveFailed', { message: result.error.message }))
    } catch (cause: unknown) {
      setError(t('editor.saveFailed', { message: cause instanceof Error ? cause.message : String(cause) }))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [document, path, text, t])
  saveRef.current = () => { void save() }

  useEffect(() => {
    const api = monaco()
    const editor = editorRef.current
    const model = editor?.getModel()
    if (api === undefined || model === undefined || model === null) return
    let cancelled = false
    void loadMonacoLanguage(language).then(() => {
      if (!cancelled && editorRef.current === editor) api.editor.setModelLanguage(model, language)
    })
    return () => { cancelled = true }
  }, [language])

  useEffect(() => {
    const api = monaco()
    const host = hostRef.current
    if (api === undefined || host === null || document === undefined) return
    let cancelled = false
    let model: ReturnType<typeof api.editor.createModel> | undefined
    let editor: ReturnType<typeof api.editor.create> | undefined
    let change: { dispose(): void } | undefined
    let select: { dispose(): void } | undefined
    const keydown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        saveRef.current()
      }
    }
    host.addEventListener('keydown', keydown, true)
    const initialLanguage = languageOf(path)
    void loadMonacoLanguage(initialLanguage).then(() => {
      if (cancelled) return
      model = api.editor.createModel(document.text, initialLanguage)
      const created = api.editor.create(host, {
        model,
        automaticLayout: true,
        readOnly: false,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 12,
        tabSize: 2,
        theme: darkTheme() ? 'vs-dark' : 'vs',
      })
      editor = created
      editorRef.current = created
      change = created.onDidChangeModelContent(() => {
        const value = created.getValue()
        setText(value)
        setDirty(value !== savedText.current)
      })
      const report = (): void => {
        const selection = created.getSelection()
        if (selection === null || (selection.startLineNumber === selection.endLineNumber
          && selection.startColumn === selection.endColumn)) {
          clearSelection({ sessionId, address: fileAddress })
          return
        }
        const endLine = selection.endColumn === 1 && selection.endLineNumber > selection.startLineNumber
          ? selection.endLineNumber - 1
          : selection.endLineNumber
        reportSelection({ sessionId, address: fileAddress, startLine: selection.startLineNumber, endLine })
      }
      select = created.onDidChangeCursorSelection(report)
      report()
      created.addCommand(api.KeyMod.CtrlCmd | api.KeyCode.KeyS, () => { saveRef.current() })
    }).catch((cause: unknown) => {
      if (!cancelled) setError(tRef.current('editor.readFailed', { message: cause instanceof Error ? cause.message : String(cause) }))
    })
    return () => {
      cancelled = true
      host.removeEventListener('keydown', keydown, true)
      select?.dispose()
      change?.dispose()
      editor?.dispose()
      model?.dispose()
      clearSelection({ sessionId, address: fileAddress })
      editorRef.current = undefined
    }
  }, [document, path])

  if (path === '') {
    return (
      <div className={css.page} data-file-editor>
        <p className={css.note}>{t('editor.noFile')}</p>
      </div>
    )
  }
  if (document === undefined) {
    return (
      <div className={css.page} data-file-editor>
        {error === undefined
          ? <p className={css.note}>{t('loading')}</p>
          : <div className={css.error} role="alert" data-editor-error>{error}</div>}
        {error === undefined ? null : <button type="button" className={css.action} onClick={() => { setReloadKey(key => key + 1) }}>{t('reload')}</button>}
      </div>
    )
  }

  const name = path.split(/[\\/]/).pop() ?? path
  return (
    <div className={css.page} data-file-editor>
      <div className={css.header}>
        <span className={css.path} title={path}>
          <FileTypeIcon kind={classifyFileType(name)} size={16} />
          {name}
          {dirty ? <span className={css.dirty} title={t('editor.dirty')} aria-label={t('editor.dirty')} /> : null}
        </span>
        <button type="button" className={css.action} disabled={saving || !dirty} onClick={() => { saveRef.current() }}>
          {saving ? t('editor.saving') : t('editor.save')}
        </button>
        <button type="button" className={css.action} disabled={saving} onClick={() => { setReloadKey(key => key + 1) }}>
          {t('editor.revert')}
        </button>
      </div>
      {error === undefined ? null : <div className={css.error} role="alert" data-editor-error>{error}</div>}
      {monaco() === undefined
        ? <textarea className={css.fallback} value={text} spellCheck={false} onChange={(event) => {
          setText(event.target.value)
          setDirty(event.target.value !== savedText.current)
        }} />
        : <div ref={hostRef} className={css.host} data-monaco-editor />}
      <footer className={css.footer}>
        <select className={css.language} value={language} aria-label={t('editor.language')}
          onChange={(event) => { setLanguage(event.target.value) }}>
          {EDITOR_LANGUAGES.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </footer>
    </div>
  )
}

/** The action contribution injected into a text preview's header. */
export interface EditFileActionInjected {
  /** Open one absolute Host path in this Session's editor. */
  readonly openEditor: (path: string) => void
}

/** Standard preview-action owner, namespace copy, and the editor opener. */
export type EditFileActionProps =
  & PropsRuntime<'sidebar.right.tab.document.actions'>
  & PropsLocale<'sidebarFiles'>
  & InjectFace<EditFileActionInjected>

/**
 * The text preview's edit button.
 * @param props - the previewed file's absolute path and the opener.
 * @returns a compact toolbar button.
 */
export function EditFileAction({ absolutePath, openEditor, t }: EditFileActionProps): ReactNode {
  return (
    <button type="button" className={css.previewAction} aria-label={t('editor.open')} title={t('editor.open')}
      onClick={() => { openEditor(absolutePath) }}>
      <IconEditOutlineRegular size={14} />
      <span>{t('editor.edit')}</span>
    </button>
  )
}
