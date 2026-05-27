'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[RootError]', error)
  }, [error])

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center text-foreground">
        <AlertTriangle className="h-12 w-12 text-destructive/60" />
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Application error</h1>
          <p className="max-w-sm text-sm text-muted-foreground">{error.message}</p>
          {error.digest && (
            <p className="text-xs text-muted-foreground/60">Error ID: {error.digest}</p>
          )}
        </div>
        <Button variant="outline" className="gap-2" onClick={reset}>
          <RefreshCw className="h-4 w-4" />
          Reload
        </Button>
      </body>
    </html>
  )
}
