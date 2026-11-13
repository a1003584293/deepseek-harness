/** File-name classification shared by the file tree and the document preview. */
import { parseFileAddress } from './file-address.ts'

/** Extensions whose default tree open goes to the editor rather than a preview. */
const EDITABLE_EXTENSIONS = new Set([
  'md', 'markdown', 'txt', 'log', 'json', 'jsonc', 'yaml', 'yml', 'toml', 'ini', 'conf', 'cfg', 'env',
  'ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs', 'py', 'sh', 'bash', 'zsh', 'fish',
  'html', 'htm', 'css', 'scss', 'less', 'xml', 'sql', 'go', 'rs', 'java', 'c', 'h', 'cpp', 'cc', 'cxx',
  'hpp', 'cs', 'php', 'rb', 'kt', 'kts', 'swift', 'lua', 'pl', 'r', 'tex', 'dockerfile', 'makefile',
  'gradle', 'properties', 'gitignore', 'npmrc', 'editorconfig',
])

/** Common extensionless text files. */
const EDITABLE_NAMES = new Set([
  'readme', 'license', 'notice', 'authors', 'contributing', 'changelog', 'makefile', 'dockerfile',
  'procfile', 'gemfile', 'rakefile', 'cmakelists.txt',
])

/**
 * Whether a file name looks like text the editor should open by default.
 * @param name - final path segment, case-insensitive.
 * @returns true for a recognized text extension or common extensionless file.
 */
export function isEditableFileName(name: string): boolean {
  const lower = name.toLowerCase()
  if (lower === '') return false
  const dot = lower.lastIndexOf('.')
  if (dot >= 0 && EDITABLE_EXTENSIONS.has(lower.slice(dot + 1))) return true
  return EDITABLE_NAMES.has(lower)
}

/**
 * Whether a file address or path names a text-like file for the default open.
 * @param address - a dsh-resource file address or a plain path.
 * @returns true when the editor should own the open.
 */
export function isEditableFileAddress(address: string): boolean {
  const path = parseFileAddress(address)?.path ?? address
  const name = path.split(/[\\/]/).pop() ?? ''
  return isEditableFileName(name)
}
