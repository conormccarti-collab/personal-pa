'use client'

import { createContext, useCallback, useContext, useState, ReactNode } from 'react'
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react'

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

interface ToastCtx {
  toast: (message: string, type?: Toast['type']) => void
}

const ToastContext = createContext<ToastCtx>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }, [])

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id))

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast stack — sits above BottomNav on mobile */}
      <div className="fixed bottom-20 md:bottom-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-lg min-w-[260px] max-w-[340px] animate-fade-in"
            style={{ borderLeftWidth: 3, borderLeftColor: t.type === 'success' ? '#10b981' : t.type === 'error' ? '#ef4444' : '#3b82f6' }}
          >
            {t.type === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />}
            {t.type === 'error'   && <AlertCircle  className="h-4 w-4 text-red-400    shrink-0 mt-0.5" />}
            {t.type === 'info'    && <Info          className="h-4 w-4 text-blue-400   shrink-0 mt-0.5" />}
            <p className="flex-1 text-sm leading-snug">{t.message}</p>
            <button onClick={() => dismiss(t.id)} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
