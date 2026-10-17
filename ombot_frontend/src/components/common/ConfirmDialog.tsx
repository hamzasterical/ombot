import React from 'react'

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
      <div className="relative w-full max-w-lg rounded-2xl bg-surface-container-lowest p-6 shadow-2xl border border-outline-variant/30">
        <button
          onClick={onCancel}
          disabled={isLoading}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-secondary hover:bg-surface-container hover:text-on-surface transition"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>

        <div className="flex items-start gap-4">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
              isMoneyMoving ? 'bg-error-container text-on-error-container' : 'bg-surface-container-high text-primary'
            }`}
          >
            <span className="material-symbols-outlined text-[26px]">
              {isMoneyMoving ? 'lock_person' : 'shield'}
            </span>
          </div>

          <div className="flex-1">
            <h3 className="text-lg font-bold text-on-surface font-headline-sm">{title}</h3>
            <p className="mt-1 text-sm text-secondary font-body-sm leading-relaxed">{description}</p>

            {isMoneyMoving && (
              <div className="mt-3 rounded-lg border border-error/30 bg-error-container/40 p-3 text-xs text-on-error-container space-y-1">
                <div className="font-semibold flex items-center gap-1.5 text-error">
                  <span className="material-symbols-outlined text-[15px]">crisis_alert</span>
                  Explicit Human Authorization Required
                </div>
                <p className="text-secondary font-body-sm">
                  This action involves fund custody or account restrictions. Per compliance policy, automated
                  reversals or payment freezes require verified staff sign-off.
                </p>
              </div>
            )}

            {details && (
              <div className="mt-3 rounded-lg border border-outline-variant/30 bg-surface-container-low p-3 text-xs">
                <span className="font-semibold text-secondary block mb-1">Execution Payload:</span>
                {typeof details === 'string' ? (
                  <p className="text-on-surface font-mono-data">{details}</p>
                ) : (
                  <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
                    {Object.entries(details).map(([key, val]) => (
                      <React.Fragment key={key}>
                        <dt className="text-secondary font-medium capitalize">
                          {key.replace(/([A-Z])/g, ' $1')}:
                        </dt>
                        <dd className="text-on-surface font-mono-data font-semibold truncate">
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
                className="rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-4 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container-low disabled:opacity-50 transition"
              >
                {cancelText}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isLoading}
                className={`rounded-lg px-4 py-2 text-xs font-semibold text-on-primary shadow-xs transition disabled:opacity-50 ${
                  isMoneyMoving
                    ? 'bg-error hover:opacity-90'
                    : 'bg-primary hover:opacity-90'
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
