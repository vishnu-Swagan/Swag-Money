import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Swag-Money',
  description: 'Signed, fraud-checked ads for the seconds your AI coding assistant spends thinking.',
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
