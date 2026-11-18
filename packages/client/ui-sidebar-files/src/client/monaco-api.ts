/**
 * The subset of the shell-owned Monaco vendor this package uses. The Web entry
 * installs the real editor on `globalThis.__DSH_MONACO__`; keeping the runtime
 * contract here avoids pulling a second Monaco copy into a client plugin.
 */

/** One text model owned by an editor or diff. */
export interface MonacoModel {
  getValue(): string
  setValue(value: string): void
  dispose(): void
}

/** One editor view state: scroll, cursor, and folding state owned by Monaco. */
export type MonacoViewState = Readonly<Record<string, unknown>>

/** One plain code editor. */
export interface MonacoSelection {
  readonly startLineNumber: number
  readonly startColumn: number
  readonly endLineNumber: number
  readonly endColumn: number
}

/** One plain code editor with the view-state operations the file page persists. */
export interface MonacoEditor {
  setModel(model: MonacoModel | null): void
  getModel(): MonacoModel | null
  getValue(): string
  getSelection(): MonacoSelection | null
  saveViewState(): MonacoViewState | null
  restoreViewState(state: MonacoViewState): void
  onDidChangeModelContent(listener: () => void): { dispose(): void }
  onDidChangeCursorSelection(listener: () => void): { dispose(): void }
  addCommand(keybinding: number, handler: () => void): string | null
  updateOptions(options: Record<string, unknown>): void
  layout(): void
  focus(): void
  dispose(): void
}

/** One read-only diff editor. */
export interface MonacoDiffEditor {
  setModel(model: { original: MonacoModel; modified: MonacoModel }): void
  dispose(): void
}

/** Font and palette facts the Monaco surfaces consume from the theme settings. */
export interface CodeAppearance {
  /** Integer px sizes by role; the editor uses the code role. */
  readonly fontSizes: { readonly code: number }
  /** Normalized font-family lists by role; the editor uses the code role. */
  readonly fontFamilies: { readonly code: string }
  /** The resolved palette, so a mounted editor follows the application theme. */
  readonly active: { readonly colorScheme: 'light' | 'dark' }
}

/**
 * Resolve the code font list for Monaco. An empty user list uses the theme's
 * built-in code stack, which Monaco cannot read from CSS itself.
 * @param appearance - the theme's code font facts.
 * @returns a CSS font-family list, never empty.
 */
export function codeFontFamily(appearance: CodeAppearance): string {
  if (appearance.fontFamilies.code !== '') return appearance.fontFamilies.code
  if (typeof getComputedStyle === 'function') {
    const fallback = getComputedStyle(document.body).getPropertyValue('--ds-font-family-code').trim()
    if (fallback !== '') return fallback
  }
  return 'ui-monospace, monospace'
}

/** The Monaco API surface shared by the diff and editor bodies. */
export interface MonacoApi {
  editor: {
    create(container: HTMLElement, options: Record<string, unknown>): MonacoEditor
    setTheme(theme: string): void
    createModel(value: string, language?: string): MonacoModel
    createDiffEditor(container: HTMLElement, options: Record<string, unknown>): MonacoDiffEditor
    setModelLanguage(model: MonacoModel, language: string): void
  }
  KeyMod: { CtrlCmd: number }
  KeyCode: { KeyS: number }
}

type MonacoScope = typeof globalThis & {
  __DSH_MONACO__?: MonacoApi
  __DSH_LOAD_MONACO_LANGUAGE__?: (language: string) => Promise<void>
}

/**
 * Read the shell-mounted Monaco vendor.
 * @returns the API, or undefined when the shell has no vendor.
 */
export function monaco(): MonacoApi | undefined {
  return (globalThis as MonacoScope).__DSH_MONACO__
}

/**
 * Load one language tokenizer/service on demand.
 * @param language - Monaco language id.
 */
export async function loadMonacoLanguage(language: string): Promise<void> {
  await (globalThis as MonacoScope).__DSH_LOAD_MONACO_LANGUAGE__?.(language)
}
