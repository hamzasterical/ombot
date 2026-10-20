import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authApi, type AuthUser } from '../api/client'

interface AuthState {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

const MOCK_USER: AuthUser = { id: 'mock', name: 'Sarah Jenkins', email: 'sarah@example.com' }

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient()
  // No sign-in in the demo build: everyone lands in the app as the demo reviewer
  const [user, setUser] = useState<AuthUser | null>(MOCK_USER)
  const loading = false

  const login = useCallback(async (email: string, password: string) => {
    setUser(await authApi.login(email, password))
  }, [])

  const signup = useCallback(async (name: string, email: string, password: string) => {
    setUser(await authApi.signup(name, email, password))
  }, [])

  const logout = useCallback(async () => {
    await authApi.logout()
    queryClient.clear() // no cached cases from the previous session
    setUser(MOCK_USER) // stay in the app: there is no sign-in screen
  }, [queryClient])

  const value = useMemo(() => ({ user, loading, login, signup, logout }), [user, loading, login, signup, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
