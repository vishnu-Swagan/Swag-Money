'use client'

export function CopyCommand({ command }: { command: string }) {
  return (
    <div className="install-box">
      <code>{command}</code>
      <button
        className="button"
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(command)
        }}
      >
        Copy
      </button>
    </div>
  )
}
