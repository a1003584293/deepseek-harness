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

/** One plain code editor. */
export interface MonacoEditor {
  setModel(model: MonacoModel | null): void
  getModel(): MonacoModel | null
  getValue(): string
  onDidChangeModelContent(listener: () => void): { dispose(): void }
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

/** The Monaco API surface shared by the diff and editor bodies. */
export interface MonacoApi {
  editor: {
    create(container: HTMLElement, options: Record<string, unknown>): MonacoEditor
    createModel(value: string, language?: string): MonacoModel
    createDiffEditor(container: HTMLElement, options: Record<string, unknown>): MonacoDiffEditor
  }
  KeyMod: { CtrlCmd: number }
  KeyCode: { KeyS: number }
}

type MonacoScope = typeof globalThis & { __DSH_MONACO__?: MonacoApi }

/** @returns the shell-mounted Monaco, or undefined when the shell has no vendor. */
export function monaco(): MonacoApi | undefined {
  return (globalThis as MonacoScope).__DSH_MONACO__
}
