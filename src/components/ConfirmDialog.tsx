import React from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, X } from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';

interface ConfirmDialogProps {
  title: string;
  message: string;
  detail?: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: 'amber' | 'emerald';
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  detail,
  confirmLabel,
  cancelLabel,
  variant = 'amber',
  loading = false,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4"
      onClick={() => {
        if (!loading) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                variant === 'emerald'
                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                  : 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3
              id="confirm-dialog-title"
              className="font-display text-base font-bold text-slate-900 dark:text-white leading-snug"
            >
              {title}
            </h3>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            aria-label={t('common.close')}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
          {message}
        </p>

        {detail && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 px-3.5 py-2.5 text-xs font-medium text-slate-600 dark:text-slate-300">
            {detail}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer min-h-[44px] disabled:opacity-50"
          >
            {cancelLabel ?? t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void onConfirm()}
            className={`flex items-center gap-1.5 rounded-xl disabled:opacity-60 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white transition-colors cursor-pointer min-h-[44px] ${
              variant === 'emerald'
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : variant === 'emerald' ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <RotateCcw className="w-4 h-4" />
            )}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
