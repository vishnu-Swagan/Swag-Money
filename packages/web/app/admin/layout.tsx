import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AdminNav } from '../../components/admin-nav'
import { requireAdmin } from '../../lib/admin'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const me = await requireAdmin()
  return (
    <>
      <AdminNav email={me.email} />
      <div className="admin-main wrap">{children}</div>
    </>
  )
}
