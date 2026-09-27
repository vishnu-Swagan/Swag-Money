'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { TOOLS, type IntegrationStatus, type Placement } from '@swag-money/shared'

const STATUSES: Array<'all' | IntegrationStatus> = ['all', 'working', 'beta', 'scaffold']
const PLACEMENTS: Array<'all' | Placement> = ['all', 'terminal', 'editor', 'browser']

export function IntegrationDirectory() {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('all')
  const [placement, setPlacement] = useState<(typeof PLACEMENTS)[number]>('all')
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return TOOLS.filter((tool) => {
      if (status !== 'all' && tool.status !== status) return false
      if (placement !== 'all' && tool.placement !== placement) return false
      if (!needle) return true
      return `${tool.name} ${tool.mechanism} ${tool.surface}`.toLowerCase().includes(needle)
    })
  }, [query, status, placement])

  return (
    <div>
      <div className="filters">
        <input
          aria-label="Search integrations"
          placeholder="Search tools"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {STATUSES.map((value) => (
          <button key={value} className={value === status ? 'button' : 'button secondary'} type="button" onClick={() => setStatus(value)}>
            {value}
          </button>
        ))}
        {PLACEMENTS.map((value) => (
          <button key={value} className={value === placement ? 'button' : 'button secondary'} type="button" onClick={() => setPlacement(value)}>
            {value}
          </button>
        ))}
      </div>
      <p className="tiny">{rows.length} of {TOOLS.length} tools</p>
      <table>
        <thead>
          <tr>
            <th>Tool</th>
            <th>Status</th>
            <th>Placement</th>
            <th>Mechanism</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((tool) => (
            <tr key={tool.id}>
              <td><Link href={`/install/${tool.id}`}>{tool.name}</Link></td>
              <td><span className={`badge ${tool.status}`}>{tool.status}</span></td>
              <td className="mono">{tool.placement}</td>
              <td>{tool.mechanism}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
