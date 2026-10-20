import React, { useState } from 'react'
import { useAuth } from '../auth/AuthContext'

type Mode = 'login' | 'signup'

const label: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: 'var(--color-on-surface)',
  display: 'block',
  marginBottom: '0.375rem',
}

export const AuthPage: React.FC = () => {
  const { login, signup } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const isSignup = mode === 'signup'

  const switchMode = (next: Mode) => {
    setMode(next)
    setError('')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (isSignup) await signup(name, email, password)
      else await login(email, password)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      setError(msg.replace(/^\d+:\s*/, ''))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        background: 'var(--color-surface)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          background: 'var(--color-surface-bright)',
          border: '1px solid var(--color-outline)',
          borderRadius: '0.75rem',
          boxShadow: 'var(--shadow-md)',
          padding: '2rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '0.5rem',
              background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(15,23,42,0.25)',
            }}
          >
            <span className="material-symbols-outlined" style={{ color: '#FFFFFF', fontSize: 20 }}>
              account_balance
            </span>
          </div>
          <div>
            <div
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 800,
                fontSize: '1.0625rem',
                color: 'var(--color-on-surface)',
                letterSpacing: '-0.02em',
              }}
            >
              Ombot
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-secondary)', fontWeight: 500 }}>
              Bank Complaint Triage
            </div>
          </div>
        </div>

        <h1 className="font-headline-sm" style={{ margin: 0, color: 'var(--color-on-surface)' }}>
          {isSignup ? 'Create your account' : 'Sign in'}
        </h1>
        <p style={{ margin: '0.25rem 0 1.25rem', fontSize: '0.8125rem', color: 'var(--color-secondary)' }}>
          {isSignup ? 'Sign up with your email and a password.' : 'Enter your email and password to continue.'}
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {isSignup && (
            <div>
              <label style={label} htmlFor="auth-name">Full name</label>
              <input
                id="auth-name"
                className="form-input"
                type="text"
                required
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}
          <div>
            <label style={label} htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              className="form-input"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label style={label} htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              className="form-input"
              type="password"
              required
              minLength={isSignup ? 8 : undefined}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {isSignup && (
              <span style={{ fontSize: '0.6875rem', color: 'var(--color-tertiary)' }}>At least 8 characters</span>
            )}
          </div>

          {error && (
            <div
              role="alert"
              style={{
                background: 'var(--color-error-container)',
                border: '1px solid var(--color-error-border)',
                color: 'var(--color-error)',
                borderRadius: '0.5rem',
                padding: '0.5rem 0.75rem',
                fontSize: '0.8125rem',
              }}
            >
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={busy} style={{ justifyContent: 'center' }}>
            {busy ? 'Please wait…' : isSignup ? 'Sign up' : 'Sign in'}
          </button>
        </form>

        <p style={{ margin: '1.25rem 0 0', textAlign: 'center', fontSize: '0.8125rem', color: 'var(--color-secondary)' }}>
          {isSignup ? 'Already have an account?' : 'Need an account?'}{' '}
          <button
            type="button"
            onClick={() => switchMode(isSignup ? 'login' : 'signup')}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontWeight: 700,
              color: 'var(--color-primary)',
              textDecoration: 'underline',
              fontFamily: 'inherit',
              fontSize: 'inherit',
            }}
          >
            {isSignup ? 'Sign in' : 'Sign up'}
          </button>
        </p>
      </div>
    </div>
  )
}
