import React, { useState } from 'react'
import type { Tier } from '../../api/types'

interface CreateCategoryModalProps {
  isOpen: boolean
  initialName?: string
  caseId?: string
  onClose: () => void
  onSubmit: (category: { id: string; name: string; tier: Tier; description: string }) => void
}

export const CreateCategoryModal: React.FC<CreateCategoryModalProps> = ({
  isOpen,
  initialName = '',
  caseId,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState(initialName)
  const [tier, setTier] = useState<Tier>('moderate')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Category name is required')
      return
    }
    if (!description.trim()) {
      setError('Description is required so the classifier can learn.')
      return
    }

    const id = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')

    onSubmit({
      id: id || `category_${Date.now()}`,
      name: name.trim(),
      tier,
      description: description.trim(),
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg rounded-2xl bg-surface-container-lowest p-6 shadow-2xl border border-outline-variant/30">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-secondary hover:bg-surface-container hover:text-on-surface transition"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>

        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-fixed/40 text-primary">
            <span className="material-symbols-outlined text-[20px]">add_circle</span>
          </div>
          <div>
            <h3 className="text-base font-bold text-on-surface font-headline-sm">Create Taxonomy Category</h3>
            {caseId && <p className="text-xs text-secondary font-mono-data">Mapping complaint: #{caseId}</p>}
          </div>
        </div>

        {/* Note that this teaches the system */}
        <div className="mb-4 rounded-xl border border-primary/20 bg-primary-fixed/20 p-3 text-xs text-on-surface flex items-start gap-2.5">
          <span className="material-symbols-outlined text-[18px] text-primary shrink-0 mt-0.5">school</span>
          <div className="leading-relaxed">
            <span className="font-semibold block text-primary font-headline-sm">Active Learning Pipeline</span>
            Registering a category expands the few-shot vector classification bank so the triage engine can categorize future disputes automatically.
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-error/30 bg-error-container/40 p-2.5 text-xs text-error flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">error</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-secondary mb-1">
              Category Identifier / Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError('')
              }}
              placeholder="e.g., Cryptocoin Gateway Failure, ESG Impact Tracker..."
              className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low p-2.5 text-xs text-on-surface focus:bg-surface-container-lowest focus:border-primary focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-secondary mb-1">
              Risk Tier Assignment *
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label
                className={`flex cursor-pointer flex-col rounded-xl border p-2.5 text-center transition ${
                  tier === 'critical'
                    ? 'border-error bg-error-container text-on-error-container font-bold'
                    : 'border-outline-variant/30 bg-surface-container-low hover:bg-surface-container text-on-surface-variant text-xs'
                }`}
              >
                <input
                  type="radio"
                  name="tier"
                  value="critical"
                  checked={tier === 'critical'}
                  onChange={() => setTier('critical')}
                  className="sr-only"
                />
                <span className="text-xs font-semibold">Critical</span>
                <span className="text-[10px] opacity-75 font-normal mt-0.5">Human review only</span>
              </label>

              <label
                className={`flex cursor-pointer flex-col rounded-xl border p-2.5 text-center transition ${
                  tier === 'moderate'
                    ? 'border-amber-400 bg-amber-100 text-amber-900 font-bold'
                    : 'border-outline-variant/30 bg-surface-container-low hover:bg-surface-container text-on-surface-variant text-xs'
                }`}
              >
                <input
                  type="radio"
                  name="tier"
                  value="moderate"
                  checked={tier === 'moderate'}
                  onChange={() => setTier('moderate')}
                  className="sr-only"
                />
                <span className="text-xs font-semibold">Moderate</span>
                <span className="text-[10px] opacity-75 font-normal mt-0.5">Dual-lane signoff</span>
              </label>

              <label
                className={`flex cursor-pointer flex-col rounded-xl border p-2.5 text-center transition ${
                  tier === 'low'
                    ? 'border-emerald-400 bg-emerald-100 text-emerald-900 font-bold'
                    : 'border-outline-variant/30 bg-surface-container-low hover:bg-surface-container text-on-surface-variant text-xs'
                }`}
              >
                <input
                  type="radio"
                  name="tier"
                  value="low"
                  checked={tier === 'low'}
                  onChange={() => setTier('low')}
                  className="sr-only"
                />
                <span className="text-xs font-semibold">Low</span>
                <span className="text-[10px] opacity-75 font-normal mt-0.5">Automated AI</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-secondary mb-1">
              Trigger Scope & Description *
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value)
                setError('')
              }}
              placeholder="Describe trigger conditions, keywords, patterns, and scenarios that belong in this category..."
              className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low p-2.5 text-xs text-on-surface focus:bg-surface-container-lowest focus:border-primary focus:outline-none transition-colors"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-2 text-xs font-semibold text-secondary hover:bg-surface-container-low transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-on-primary shadow-xs hover:opacity-90 transition-opacity"
            >
              Save & Register Category
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
