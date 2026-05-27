import { Sidebar } from '@/components/layout/Sidebar'
import { BottomNav } from '@/components/layout/BottomNav'
import { CaptureBar } from '@/components/capture/CaptureBar'
import { SearchPalette } from '@/components/layout/SearchPalette'
import { NotificationBell } from '@/components/layout/NotificationBell'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar — always 56px wide; hover expands as overlay */}
      <Sidebar />

      {/* Main content — offset by sidebar width on desktop, extra bottom padding on mobile for tab bar */}
      <main className="flex-1 md:pl-14 pb-24 md:pb-8">
        {/* Notification bell — top right, visible on all pages */}
        <div className="flex justify-end px-4 pt-4 md:px-8 md:pt-6">
          <NotificationBell />
        </div>
        <div className="px-4 pb-6 md:px-8 md:pb-8">
          {children}
        </div>
      </main>

      {/* Global capture bar */}
      <CaptureBar />

      {/* Mobile bottom navigation */}
      <BottomNav />

      {/* Global search palette — Cmd+K */}
      <SearchPalette />
    </div>
  )
}
