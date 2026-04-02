import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Peak Condo Storage — Construction Tracker',
  description: 'Construction punch list and progress tracker for Peak Condo Storage',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
