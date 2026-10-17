import { Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { SubmitComplaint } from './pages/SubmitComplaint'
import { CriticalQueue } from './pages/CriticalQueue'
import { ModerateQueue } from './pages/ModerateQueue'
import { UnknownQueue } from './pages/UnknownQueue'
import { CaseDetail } from './pages/CaseDetail'
import { LowTierAudit } from './pages/LowTierAudit'
import { AuditLog } from './pages/AuditLog'
import { MetricsPage } from './pages/MetricsPage'
import { CategoriesPage } from './pages/CategoriesPage'

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/submit" replace />} />
        <Route path="/submit" element={<SubmitComplaint />} />
        <Route path="/critical" element={<CriticalQueue />} />
        <Route path="/moderate" element={<ModerateQueue />} />
        <Route path="/unknown" element={<UnknownQueue />} />
        <Route path="/cases/:id" element={<CaseDetail />} />
        <Route path="/low-audit" element={<LowTierAudit />} />
        <Route path="/audit" element={<AuditLog />} />
        <Route path="/metrics" element={<MetricsPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
        {/* Fallback */}
        <Route path="*" element={<Navigate to="/submit" replace />} />
      </Routes>
    </AppShell>
  )
}
