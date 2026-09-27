import { describe, expect, it } from 'vitest'
import { editorSurface } from './surface-id.ts'

describe('editor surface id', () => {
  it('accepts the VS Code family and falls back to vscode', () => {
    expect(editorSurface('cursor')).toBe('cursor')
    expect(editorSurface('windsurf')).toBe('windsurf')
    expect(editorSurface('cline')).toBe('cline')
    expect(editorSurface('kiro')).toBe('kiro')
    expect(editorSurface('jetbrains')).toBe('vscode')
    expect(editorSurface(undefined)).toBe('vscode')
  })
})
