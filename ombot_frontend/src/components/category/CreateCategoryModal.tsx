import React, { useState } from 'react'
import type { Tier } from '../../api/types'
import { Sparkles, X, BookOpen, AlertCircle } from 'lucide-react'

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
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
            <Sparkles size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Create New Category</h3>
            {caseId && <p className="text-xs text-slate-500">Mapping complaint case: {caseId}</p>}
          </div>
        </div>

        {/* Note that this teaches the system */}
        <div className="mb-4 rounded-xl border border-purple-200 bg-purple-50 p-3 text-xs text-purple-900 flex items-start gap-2.5">
          <BookOpen size={16} className="text-purple-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-semibold block">Continuous Learning Loop Active</span>
            Creating a category registers a new node in the classification taxonomy and updates
            future few-shot embeddings. This teaches the AI triage model how to classify similar complaints automatically.
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Category Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError('')
              }}
              placeholder="e.g., Cryptocoin Gateway Failure, ESG Impact Tracker..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-900 focus:bg-white focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Risk Tier Assignment *
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label
                className={`flex cursor-pointer flex-col rounded-xl border p-2.5 text-center transition ${
                  tier === 'critical'
                    ? 'border-red-500 bg-red-50/80 text-red-900 font-bold'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700 text-xs'
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
                <span className="text-xs">Critical</span>
                <span className="text-[10px] text-slate-500 font-normal mt-0.5">Human only</span>
              </label>

              <label
                className={`flex cursor-pointer flex-col rounded-xl border p-2.5 text-center transition ${
                  tier === 'moderate'
                    ? 'border-amber-500 bg-amber-50/80 text-amber-900 font-bold'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700 text-xs'
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
                <span className="text-xs">Moderate</span>
                <span className="text-[10px] text-slate-500 font-normal mt-0.5">Human/AI choice</span>
              </label>

              <label
                className={`flex cursor-pointer flex-col rounded-xl border p-2.5 text-center transition ${
                  tier === 'low'
                    ? 'border-emerald-500 bg-emerald-50/80 text-emerald-900 font-bold'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700 text-xs'
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
                <span className="text-xs">Low</span>
                <span className="text-[10px] text-slate-500 font-normal mt-0.5">Automated AI</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Description & Classification Criteria *
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value)
                setError('')
              }}
              placeholder="Describe trigger conditions, patterns, and scenarios that belong in this category..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-900 focus:bg-white focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-purple-700 transition"
            >
              Save & Register Category
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
