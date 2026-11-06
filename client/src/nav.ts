import { useEffect, useState } from 'react'

type Listener = (path: string) => void

const listeners = new Set<Listener>()
let current = readLocation()

function readLocation(): string {
  if (typeof window === 'undefined' || !window.location) return '/projetos'
  return window.location.pathname || '/projetos'
}

function emit(): void {
  for (const listener of listeners) listener(current)
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    current = readLocation()
    emit()
  })
}

export function go(path: string): void {
  current = path
  if (typeof window !== 'undefined' && window.history) {
    window.history.pushState(null, '', path)
  }
  emit()
}

export function usePath(): string {
  const [path, setPath] = useState(current)
  useEffect(() => {
    listeners.add(setPath)
    return () => {
      listeners.delete(setPath)
    }
  }, [])
  return path
}
