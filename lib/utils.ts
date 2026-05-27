import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, isToday, isTomorrow, isThisWeek } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  if (isToday(date)) return `Today at ${format(date, 'h:mm a')}`
  if (isTomorrow(date)) return `Tomorrow at ${format(date, 'h:mm a')}`
  if (isThisWeek(date)) return format(date, 'EEEE at h:mm a')
  return format(date, 'MMM d at h:mm a')
}

export function formatDueDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (isToday(date)) return 'Due today'
  if (isTomorrow(date)) return 'Due tomorrow'
  if (isThisWeek(date)) return `Due ${format(date, 'EEEE')}`
  return `Due ${format(date, 'MMM d')}`
}

export function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength).trimEnd() + '…'
}
