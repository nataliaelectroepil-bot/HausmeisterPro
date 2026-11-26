import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react';

interface DoubleDeleteConfirmModalProps {
  isOpen: boolean;
  detail?: string;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

export const DoubleDeleteConfirmModal: React.FC<DoubleDeleteConfirmModalProps> = ({
  isOpen,
  detail,
  onConfirm,
  onCancel,
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setDeleting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFinalConfirm = async () => {
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4"
      onClick={() => {
        if (!deleting) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="double-delete-dialog-title"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                step === 2
                  ? 'bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400'
                  : 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3
              id="double-delete-dialog-title"
              className="font-display text-base font-bold text-slate-900 dark:text-white leading-snug"
            >
              {step === 1 ? 'Eintrag löschen?' : 'Endgültig löschen bestätigen'}
            </h3>
          </div>

          <button
            type="button"
            disabled={deleting}
            onClick={onCancel}
            aria-label="Schließen"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
          {step === 1
            ? 'Sind Sie sicher, dass Sie diesen Eintrag löschen möchten?'
            : 'Diese Aktion kann nicht rückgängig gemacht werden. Bitte bestätigen Sie das endgültige Löschen.'}
        </p>

        {detail && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 px-3.5 py-2.5 text-xs font-medium text-slate-600 dark:text-slate-300">
            {detail}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={deleting}
            onClick={onCancel}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer min-h-[44px] disabled:opacity-50"
          >
            Abbrechen
          </button>

          {step === 1 ? (
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-xl bg-amber-600 hover:bg-amber-700 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white transition-colors cursor-pointer min-h-[44px]"
            >
              Weiter
            </button>
          ) : (
            <button
              type="button"
              disabled={deleting}
              onClick={() => void handleFinalConfirm()}
              className="flex items-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white transition-colors cursor-pointer min-h-[44px]"
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              <span>Löschen bestätigen</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
