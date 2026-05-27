import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-muted text-muted-foreground',
        high: 'bg-red-500/15 text-red-400',
        medium: 'bg-amber-500/15 text-amber-400',
        low: 'bg-muted text-muted-foreground',
        accent: 'bg-accent/15 text-accent',
        todo: 'bg-muted text-muted-foreground',
        in_progress: 'bg-blue-500/15 text-blue-400',
        done: 'bg-green-500/15 text-green-400',
        archived: 'bg-muted/50 text-muted-foreground/50',
        destructive: 'bg-destructive/15 text-destructive',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
