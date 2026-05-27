'use client'

import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
  /** Short label shown in the error card, e.g. "Gantt Chart" */
  label?: string
}

interface State {
  hasError: boolean
  message: string
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message ?? 'Unknown error' }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  reset = () => this.setState({ hasError: false, message: '' })

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-6 py-10 text-center">
          <AlertTriangle className="h-6 w-6 text-destructive/60" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              {this.props.label ? `${this.props.label} failed to load` : 'Something went wrong'}
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">{this.state.message}</p>
          </div>
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={this.reset}>
            <RefreshCw className="h-3 w-3" />
            Try again
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
