'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Sun, CheckSquare, Target, ListTodo, Lightbulb,
  Camera, Users, UserCircle, Inbox, CalendarDays,
  MessageSquare, CalendarClock,
} from 'lucide-react'

const nav = [
  { href: '/',          label: 'Today',    icon: Sun },
  { href: '/tasks',     label: 'Tasks',    icon: CheckSquare },
  { href: '/chat',      label: 'Ask',      icon: MessageSquare },
  { href: '/todo',      label: 'To Do',    icon: ListTodo },
  { href: '/plan',      label: 'Plan',     icon: CalendarClock },
  { href: '/calendar',  label: 'Calendar', icon: CalendarDays },
  { href: '/ideas',     label: 'Ideas',    icon: Lightbulb },
  { href: '/shoots',    label: 'Shoots',   icon: Camera },
  { href: '/team',      label: 'Team',     icon: Users },
  { href: '/capture',   label: 'Capture',  icon: Inbox },
  { href: '/profile',   label: 'Me',       icon: UserCircle },
  { href: '/focus',     label: 'Focus',    icon: Target },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden border-t border-border bg-card/95 backdrop-blur-md">
      <div className="flex overflow-x-auto scrollbar-none px-2 py-1.5 gap-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex min-w-[56px] flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 transition-colors',
                active
                  ? 'text-accent'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="text-[9px] font-medium whitespace-nowrap">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
