'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Sun, Inbox, CheckSquare, ListTodo, Lightbulb,
  Users, UserCircle, Camera, Target, CalendarDays, Search,
} from 'lucide-react'

const sections = [
  {
    id: 'work',
    label: 'Work',
    items: [
      { href: '/',       label: 'Today',  icon: Sun },
      { href: '/tasks',  label: 'Tasks',  icon: CheckSquare },
      { href: '/focus',  label: 'Focus',  icon: Target },
    ],
  },
  {
    id: 'plan',
    label: 'Plan',
    items: [
      { href: '/todo',      label: 'To Do',    icon: ListTodo },
      { href: '/calendar',  label: 'Calendar', icon: CalendarDays },
      { href: '/shoots',    label: 'Shoots',   icon: Camera },
    ],
  },
  {
    id: 'creative',
    label: 'Creative',
    items: [
      { href: '/ideas', label: 'Ideas', icon: Lightbulb },
    ],
  },
  {
    id: 'people',
    label: 'People',
    items: [
      { href: '/capture', label: 'Capture',  icon: Inbox },
      { href: '/team',    label: 'Team',     icon: Users },
      { href: '/profile', label: 'Know Me',  icon: UserCircle },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const [expanded, setExpanded] = useState(false)

  return (
    <aside
      className={cn(
        // Hidden on mobile — BottomNav takes over
        'fixed left-0 top-0 z-50 hidden md:flex h-full flex-col',
        'border-r border-border bg-card py-4 overflow-hidden',
        'transition-[width] duration-200 ease-out',
        expanded ? 'w-52 shadow-2xl shadow-black/40' : 'w-14',
      )}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {/* Logo mark */}
      <div className="mb-6 flex shrink-0 items-center px-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/20">
          <span className="text-xs font-bold text-accent">PA</span>
        </div>
        <span
          className={cn(
            'ml-3 text-sm font-semibold text-foreground whitespace-nowrap transition-opacity duration-150',
            expanded ? 'opacity-100' : 'opacity-0 pointer-events-none',
          )}
        >
          Personal PA
        </span>
      </div>

      {/* Search trigger */}
      <button
        onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))}
        className="mx-2 mb-3 flex h-8 items-center gap-3 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors whitespace-nowrap"
        title="Search (⌘K)"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className={cn('flex-1 text-left transition-opacity duration-150', expanded ? 'opacity-100' : 'opacity-0 pointer-events-none')}>
          Search
        </span>
        <span className={cn('text-[10px] text-muted-foreground/50 transition-opacity duration-150', expanded ? 'opacity-100' : 'opacity-0 pointer-events-none')}>
          ⌘K
        </span>
      </button>

      {/* Sections */}
      <nav className="flex flex-1 flex-col gap-1 overflow-hidden px-2">
        {sections.map((section, si) => (
          <div key={section.id}>
            {/* Section divider */}
            {si > 0 && (
              <div className="my-2 h-px bg-border/50" />
            )}

            {/* Section label — only visible when expanded */}
            <div
              className={cn(
                'mb-0.5 px-2 h-5 flex items-center transition-opacity duration-150',
                expanded ? 'opacity-100' : 'opacity-0 pointer-events-none',
              )}
            >
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                {section.label}
              </span>
            </div>

            {/* Nav items */}
            {section.items.map(({ href, label, icon: Icon }) => {
              const active =
                href === '/' ? pathname === '/' : pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex h-8 items-center gap-3 rounded-md px-2 text-sm transition-colors whitespace-nowrap',
                    active
                      ? 'bg-accent/15 text-accent'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span
                    className={cn(
                      'transition-opacity duration-150',
                      expanded ? 'opacity-100' : 'opacity-0 pointer-events-none',
                    )}
                  >
                    {label}
                  </span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>
    </aside>
  )
}
