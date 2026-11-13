/** Default-open classification shared by the tree and the preview. */
import { describe, expect, it } from 'vitest'
import { isEditableFileAddress, isEditableFileName } from '../src/editable-file.ts'
import { sessionFileAddress } from '../src/file-address.ts'

describe('isEditableFileName', () => {
  it('recognizes source and text extensions case-insensitively', () => {
    expect(isEditableFileName('main.py')).toBe(true)
    expect(isEditableFileName('App.TSX')).toBe(true)
    expect(isEditableFileName('config.yaml')).toBe(true)
    expect(isEditableFileName('README')).toBe(true)
    expect(isEditableFileName('Dockerfile')).toBe(true)
  })

  it('leaves media and binary documents to their preview viewer', () => {
    expect(isEditableFileName('photo.png')).toBe(false)
    expect(isEditableFileName('paper.pdf')).toBe(false)
    expect(isEditableFileName('archive.zip')).toBe(false)
    expect(isEditableFileName('')).toBe(false)
  })
})

describe('isEditableFileAddress', () => {
  it('classifies a session file address by its decoded path', () => {
    expect(isEditableFileAddress(sessionFileAddress('s 1', '/repo/src/a.py'))).toBe(true)
    expect(isEditableFileAddress(sessionFileAddress('s 1', '/repo/image.png'))).toBe(false)
  })

  it('classifies a plain path', () => {
    expect(isEditableFileAddress('/repo/notes.md')).toBe(true)
    expect(isEditableFileAddress('/repo/movie.mp4')).toBe(false)
  })
})
