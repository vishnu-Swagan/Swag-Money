const EDITOR_SURFACES = ['vscode', 'cursor', 'windsurf', 'cline', 'kiro'] as const
export type EditorSurface = (typeof EDITOR_SURFACES)[number]

export function editorSurface(value: unknown): EditorSurface {
  if (typeof value === 'string' && (EDITOR_SURFACES as readonly string[]).includes(value)) {
    return value as EditorSurface
  }
  return 'vscode'
}
