import React from 'react'
import { AlertOctagon, X, ShieldAlert } from 'lucide-react'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  description: string
  actionType?: 'freeze_payment' | 'issue_refund' | 'generic'
  details?: Record<string, unknown> | string
  confirmText?: string
  cancelText?: string
  isLoading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  description,
  actionType = 'generic',
  details,
  confirmText = 'Confirm & Authorize',
  cancelText = 'Cancel',
  isLoading = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null

  const isMoneyMoving = actionType === 'freeze_payment' || actionType === 'issue_refund'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
        <button
          onClick={onCancel}
          disabled={isLoading}
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
        >
          <X size={20} />
        </button>

        <div className="flex items-start gap-4">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
              isMoneyMoving ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
            }`}
          >
            {isMoneyMoving ? <AlertOctagon size={26} /> : <ShieldAlert size={26} />}
          </div>

          <div className="flex-1">
            <h3 className="text-lg font-bold text-slate-900">{title}</h3>
            <p className="mt-1 text-sm text-slate-600 leading-relaxed">{description}</p>

            {isMoneyMoving && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50/80 p-3 text-xs text-red-800 space-y-1">
                <div className="font-semibold flex items-center gap-1.5 text-red-900">
                  <ShieldAlert size={14} /> Explicit Human Authorization Required
                </div>
                <p>
                  This action involves fund custody or account restrictions. Per compliance policy, automated
                  reversals or payment freezes require verified staff sign-off.
                </p>
              </div>
            )}

            {details && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                <span className="font-semibold text-slate-700 block mb-1">Execution Payload:</span>
                {typeof details === 'string' ? (
                  <p className="text-slate-600 font-mono">{details}</p>
                ) : (
                  <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
                    {Object.entries(details).map(([key, val]) => (
                      <React.Fragment key={key}>
                        <dt className="text-slate-500 font-medium capitalize">
                          {key.replace(/([A-Z])/g, ' $1')}:
                        </dt>
                        <dd className="text-slate-900 font-mono font-semibold truncate">
                          {typeof val === 'number' && key.toLowerCase().includes('amount')
                            ? `$${val.toFixed(2)}`
                            : String(val)}
                        </dd>
                      </React.Fragment>
                    ))}
                  </dl>
                )}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={isLoading}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
              >
                {cancelText}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isLoading}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50 ${
                  isMoneyMoving
                    ? 'bg-red-600 hover:bg-red-700 active:bg-red-800'
                    : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
                }`}
              >
                {isLoading ? 'Processing...' : confirmText}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
