import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, readToken, writeToken } from './api'
import type { SessionUser } from './types'

type SessionValue = {
  user: SessionUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    readToken().then(async (token) => {
      if (!token) {
        if (active) setLoading(false)
        return
      }
      try {
        const result = await api.session()
        if (active) setUser(result.user)
      } catch {
        await writeToken(null)
      } finally {
        if (active) setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [])

  async function signIn(email: string, password: string): Promise<void> {
    const result = await api.login(email, password)
    await writeToken(result.token)
    setUser(result.user)
  }

  async function signOut(): Promise<void> {
    try {
      await api.logout()
    } finally {
      await writeToken(null)
      setUser(null)
    }
  }

  return (
    <SessionContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('Sessão indisponível.')
  return value
}
