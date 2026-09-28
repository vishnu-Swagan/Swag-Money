'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  ['/admin', 'Overview'],
  ['/admin/developers', 'Developers'],
  ['/admin/advertisers', 'Advertisers'],
  ['/admin/advertisers/board', 'Pipeline'],
  ['/admin/leads', 'Leads'],
  ['/admin/campaigns', 'Campaigns'],
  ['/admin/payouts', 'Payouts'],
  ['/admin/database', 'Database'],
] as const

export function AdminNav({ email }: { email: string }) {
  const path = usePathname()
  return (
    <header className="nav admin-nav">
      <div className="brand">
        <span className="mark">SM</span>
        <strong>Admin</strong>
        <span>private</span>
      </div>
      <nav className="nav-links" aria-label="Admin">
        {LINKS.map(([href, label]) => {
          const current = href === '/admin' ? path === '/admin' : path === href || path.startsWith(`${href}/`)
          const pipeline = href === '/admin/advertisers' && path.startsWith('/admin/advertisers/board')
          return (
            <Link key={href} href={href} aria-current={current && !pipeline ? 'page' : undefined}>
              {label}
            </Link>
          )
        })}
        <form className="admin-search" action="/admin/search" method="get">
          <label className="sr" htmlFor="admin-q">Search developers, advertisers, and leads</label>
          <input id="admin-q" name="q" type="search" placeholder="Search" />
        </form>
        <span className="tiny">{email}</span>
      </nav>
    </header>
  )
}

export function ExportLink({ href }: { href: string }) {
  return <a className="button secondary" href={href}>CSV</a>
}
