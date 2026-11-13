/**
 * Browser-owned Monaco vendor. Client plugins read the editor from
 * `globalThis.__DSH_MONACO__`; the shell owns the package and its Vite workers,
 * and loads language contributions only when an editor or picker asks for one.
 */
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import 'monaco-editor/esm/vs/editor/edcore.main'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker&inline'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'

/** Dynamic language tokenizers/services; each stays in its own chunk. */
const languageLoaders: Record<string, () => Promise<unknown>> = {
  markdown: () => import('monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution'),
  yaml: () => import('monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution'),
  javascript: () => import('monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution'),
  typescript: () => import('monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution'),
  python: () => import('monaco-editor/esm/vs/basic-languages/python/python.contribution'),
  shell: () => import('monaco-editor/esm/vs/basic-languages/shell/shell.contribution'),
  html: () => import('monaco-editor/esm/vs/basic-languages/html/html.contribution'),
  css: () => import('monaco-editor/esm/vs/basic-languages/css/css.contribution'),
  sql: () => import('monaco-editor/esm/vs/basic-languages/sql/sql.contribution'),
  go: () => import('monaco-editor/esm/vs/basic-languages/go/go.contribution'),
  rust: () => import('monaco-editor/esm/vs/basic-languages/rust/rust.contribution'),
  java: () => import('monaco-editor/esm/vs/basic-languages/java/java.contribution'),
  cpp: () => import('monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution'),
  csharp: () => import('monaco-editor/esm/vs/basic-languages/csharp/csharp.contribution'),
  php: () => import('monaco-editor/esm/vs/basic-languages/php/php.contribution'),
  ruby: () => import('monaco-editor/esm/vs/basic-languages/ruby/ruby.contribution'),
  xml: () => import('monaco-editor/esm/vs/basic-languages/xml/xml.contribution'),
  ini: () => import('monaco-editor/esm/vs/basic-languages/ini/ini.contribution'),
  dockerfile: () => import('monaco-editor/esm/vs/basic-languages/dockerfile/dockerfile.contribution'),
  json: () => import('monaco-editor/esm/vs/language/json/monaco.contribution'),
}

/** Monaco's worker factory and the vendor handles client plugins read. */
interface MonacoScope {
  MonacoEnvironment?: { getWorker: (moduleId: string, label: string) => Worker }
  __DSH_MONACO__?: typeof monaco
  __DSH_LOAD_MONACO_LANGUAGE__?: (language: string) => Promise<void>
}

const scope = globalThis as MonacoScope
// Diff computation and the editor's basic worker live in the editor worker;
// JSON's validation service gets its own worker. TypeScript/HTML/CSS language
// services are not mounted; the basic tokenizers only colorize them.
scope.MonacoEnvironment = {
  getWorker: (_moduleId, label) => label === 'json' ? new JsonWorker() : new EditorWorker(),
}
scope.__DSH_MONACO__ = monaco
scope.__DSH_LOAD_MONACO_LANGUAGE__ = async (language) => {
  await languageLoaders[language]?.()
}
