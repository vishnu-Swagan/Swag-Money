import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const dynamic = 'force-dynamic'

function publicSite(): URL | undefined {
  const site = process.env.SWAG_PUBLIC_SITE_URL?.trim()
  if (!site) return undefined
  try {
    return new URL(site)
  } catch {
    return undefined
  }
}

const site = publicSite()

export const metadata: Metadata = {
  title: 'Swag-Money',
  description: 'Signed, fraud-checked ads for the seconds your AI coding assistant spends thinking.',
  ...(site ? { metadataBase: site } : {}),
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#content">Skip to content</a>
        {children}
      </body>
    </html>
  )
}
