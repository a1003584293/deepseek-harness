/**
 * Browser-owned Monaco vendor. Client plugins that need code or diff surfaces
 * read the editor from `globalThis.__DSH_MONACO__`; the shell owns the package
 * and its Vite worker so a plugin never bundles a second Monaco copy.
 */
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker&inline'

/** Monaco's worker factory and the vendor handle client plugins read. */
interface MonacoScope {
  MonacoEnvironment?: { getWorker: () => Worker }
  __DSH_MONACO__?: typeof monaco
}

const scope = globalThis as MonacoScope
// Diff computation and the editor's basic worker live in the editor worker;
// language services (JSON/TS/CSS/HTML) are intentionally not mounted because
// this shell only hosts plain-text code and diff views.
scope.MonacoEnvironment = { getWorker: () => new EditorWorker() }
scope.__DSH_MONACO__ = monaco
