import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { adminGet } from './lib'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
}

const LINKS = [
  ['/admin', 'Overview'],
  ['/admin/developers', 'Developers'],
  ['/admin/advertisers', 'Advertisers'],
  ['/admin/leads', 'Leads'],
  ['/admin/campaigns', 'Campaigns'],
  ['/admin/payouts', 'Payouts'],
  ['/admin/database', 'Database'],
] as const

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const me = await adminGet<{ email: string; name: string }>('/v1/admin/me')
  return (
    <>
      <header className="nav admin-nav">
        <Link className="brand" href="/admin">
          <span className="mark">SM</span>
          <strong>Admin</strong>
          <span>private</span>
        </Link>
        <nav className="nav-links" aria-label="Admin">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href}>{label}</Link>
          ))}
          <form className="inline" action="/admin/search">
            <input name="q" aria-label="Search developers, advertisers, and leads" placeholder="Search" />
            <button className="button secondary" type="submit">Search</button>
          </form>
        </nav>
      </header>
      <div className="wrap page-pad">{children}</div>
      <p className="tiny wrap">Signed in as {me.name} ({me.email}). This area is not linked from the public site.</p>
    </>
  )
}
