import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, isMockMode } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation()
  const { user, logout } = useAuth()

  const { data: criticalCases = [] } = useQuery({
    queryKey: ['cases', 'critical'],
    queryFn: () => api.getCases('critical'),
    refetchInterval: 6000,
  })

  const { data: moderateCases = [] } = useQuery({
    queryKey: ['cases', 'moderate'],
    queryFn: () => api.getCases('moderate'),
    refetchInterval: 6000,
  })

  const { data: unknownCases = [] } = useQuery({
    queryKey: ['cases', 'unknown'],
    queryFn: () => api.getCases('unknown'),
    refetchInterval: 6000,
  })

  const { data: lowAuditSamples = [] } = useQuery({
    queryKey: ['low-tier-audit'],
    queryFn: () => api.getLowTierAuditSamples(),
    refetchInterval: 6000,
  })

  const pendingAuditCount = lowAuditSamples.filter((s) => s.auditStatus === 'pending').length

  const navPrimary = [
    {
      to: '/submit',
      label: 'Submit Complaint',
      icon: 'add_circle',
      badge: null,
    },
    {
      to: '/critical',
      label: 'Critical Queue',
      icon: 'crisis_alert',
      badge: criticalCases.length,
      badgeCls: 'bg-[#FEF2F2] text-[#DC2626]',
    },
    {
      to: '/moderate',
      label: 'Moderate Queue',
      icon: 'warning',
      badge: moderateCases.length,
      badgeCls: 'bg-[#FFFBEB] text-[#B45309]',
    },
    {
      to: '/unknown',
      label: 'Unknown Category',
      icon: 'help',
      badge: unknownCases.length,
      badgeCls: 'bg-[#F0F9FF] text-[#0369A1]',
    },
    {
      to: '/low-audit',
      label: 'Low-Tier Audit',
      icon: 'task_alt',
      badge: pendingAuditCount,
      badgeCls: 'bg-[#F1F5F9] text-[#475569]',
    },
  ]

  const navGovernance = [
    { to: '/audit',      label: 'Audit Log',     icon: 'receipt_long', badge: null },
    { to: '/metrics',    label: 'Metrics & SLA',  icon: 'monitoring',   badge: null },
    { to: '/categories', label: 'Categories',     icon: 'sell',         badge: null },
  ]

  const isActive = (to: string) =>
    location.pathname === to || (to === '/submit' && location.pathname === '/')

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--color-surface)' }}>

      {/* ── Sidebar ──────────────────────────────────────── */}
      <aside style={{
        width: 280,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid var(--color-outline)',
        background: 'var(--color-surface-bright)',
        boxShadow: 'var(--shadow-sm)',
        zIndex: 20,
      }}>

        {/* Brand */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          height: 64,
          padding: '0 1.25rem',
          borderBottom: '1px solid var(--color-outline)',
          flexShrink: 0,
        }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: '0.5rem',
            background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 2px 8px rgba(15,23,42,0.25)',
          }}>
            <span className="material-symbols-outlined" style={{ color: '#FFFFFF', fontSize: 18 }}>
              account_balance
            </span>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 800,
                fontSize: '0.9375rem',
                color: 'var(--color-on-surface)',
                letterSpacing: '-0.02em',
              }}>
                Ombot
              </span>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.625rem',
                fontWeight: 600,
                color: 'var(--color-secondary)',
                background: 'var(--color-surface-container-low)',
                border: '1px solid var(--color-outline)',
                padding: '1px 5px',
                borderRadius: 4,
                letterSpacing: '0.04em',
              }}>
                CONSOLE
              </span>
            </div>
            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '0.6875rem',
              color: 'var(--color-secondary)',
              fontWeight: 500,
              margin: 0,
              lineHeight: 1,
              marginTop: 2,
            }}>
              Bank Complaint Triage
            </p>
          </div>
        </div>

        {/* Tier guide strip */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 1.25rem',
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-outline-variant)',
          flexShrink: 0,
        }}>
          <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Tiers:</span>
          {[
            { color: '#DC2626', label: 'Critical' },
            { color: '#B45309', label: 'Moderate' },
            { color: '#047857', label: 'Low' },
          ].map(t => (
            <span key={t.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: "'DM Sans',sans-serif", fontSize: '0.6875rem', fontWeight: 500, color: t.color }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.color, display: 'inline-block' }} />
              {t.label}
            </span>
          ))}
        </div>

        {/* Nav links */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 0.5rem' }}>
          {/* Primary queue links */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {navPrimary.map(item => {
              const active = isActive(item.to)
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={`nav-item ${active ? 'nav-item-active' : ''}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', minWidth: 0 }}>
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: 20,
                        color: active
                          ? 'var(--color-primary)'
                          : item.icon === 'crisis_alert'
                          ? '#DC2626'
                          : 'var(--color-secondary)',
                        transition: 'color 0.15s',
                        flexShrink: 0,
                      }}
                    >
                      {item.icon}
                    </span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.label}
                    </span>
                  </div>
                  {item.badge !== null && item.badge > 0 && (
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '0.6875rem',
                      fontWeight: 600,
                      padding: '1px 6px',
                      borderRadius: 4,
                      flexShrink: 0,
                    }} className={item.badgeCls || ''}>
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              )
            })}
          </div>

          {/* Governance section */}
          <div style={{ paddingTop: '1rem', paddingBottom: '0.25rem', paddingLeft: '0.25rem' }}>
            <span style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '0.6875rem',
              fontWeight: 600,
              color: 'var(--color-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}>
              Institutional Governance
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {navGovernance.map(item => {
              const active = isActive(item.to)
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={`nav-item ${active ? 'nav-item-active' : ''}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', minWidth: 0 }}>
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: 20,
                        color: active ? 'var(--color-primary)' : 'var(--color-secondary)',
                        transition: 'color 0.15s',
                        flexShrink: 0,
                      }}
                    >
                      {item.icon}
                    </span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.label}
                    </span>
                  </div>
                </NavLink>
              )
            })}
          </div>
        </nav>

        {/* Sidebar footer: environment status */}
        <div style={{
          borderTop: '1px solid var(--color-outline)',
          padding: '0.875rem 1.25rem',
          background: 'var(--color-surface)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '0.6875rem', color: 'var(--color-secondary)', fontWeight: 500 }}>
              Data Layer:
            </span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.6875rem',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 9999,
              background: isMockMode ? '#ECFDF5' : '#EFF6FF',
              color: isMockMode ? '#047857' : '#1D4ED8',
              border: `1px solid ${isMockMode ? '#A7F3D0' : '#BFDBFE'}`,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: isMockMode ? '#10B981' : '#3B82F6',
                display: 'inline-block',
              }} />
              {isMockMode ? 'Mock (In-Memory)' : 'FastAPI Backend'}
            </span>
          </div>
        </div>
      </aside>

      {/* ── Main area ──────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

        {/* Top header */}
        <header style={{
          display: 'flex',
          height: 64,
          flexShrink: 0,
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--color-outline)',
          background: 'var(--color-surface-bright)',
          padding: '0 2rem',
          boxShadow: 'var(--shadow-sm)',
          zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface-variant)' }}>
              Ombot Bank Staff Command Center
            </span>
            <span style={{ color: 'var(--color-outline)', fontSize: '0.75rem' }}>|</span>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '0.8125rem', color: 'var(--color-secondary)' }}>
              Autonomous &amp; Human-in-the-Loop Complaint Triage
            </span>
          </div>

          {/* Reviewer chip */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-outline)',
            padding: '0.375rem 0.875rem',
            borderRadius: '0.5rem',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'var(--color-surface-container-low)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--color-on-surface)' }}>person</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-on-surface)', lineHeight: 1.2 }}>
                Reviewer: {user?.name}
              </span>
              <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '0.6875rem', color: 'var(--color-secondary)', fontWeight: 500 }}>
                {user?.email}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              title="Sign out"
              aria-label="Sign out"
              style={{ background: 'none', border: 'none', padding: 0, marginLeft: 4, cursor: 'pointer', display: 'flex' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-secondary)' }}>logout</span>
            </button>
          </div>
        </header>

        {/* Main content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '2rem', background: 'var(--color-surface)' }}>
          <div style={{ maxWidth: 1400, margin: '0 auto' }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
