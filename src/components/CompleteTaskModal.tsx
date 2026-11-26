import React, { useState } from 'react';
import { Camera, CheckCircle2, ImagePlus, Loader2, X } from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { ConfirmDialog } from './ConfirmDialog';

interface CompleteTaskModalProps {
  taskTitle: string;
  subtitle?: string;
  title?: string;
  hint?: string;
  allowWithoutPhoto: boolean;
  confirmWithoutPhoto?: boolean;
  loading?: boolean;
  error?: string | null;
  onSelectPhoto: (file: File) => void | Promise<void>;
  onContinueWithoutPhoto?: () => void | Promise<void>;
  onClose: () => void;
}

export const CompleteTaskModal: React.FC<CompleteTaskModalProps> = ({
  taskTitle,
  subtitle,
  title,
  hint,
  allowWithoutPhoto,
  confirmWithoutPhoto = false,
  loading = false,
  error = null,
  onSelectPhoto,
  onContinueWithoutPhoto,
  onClose,
}) => {
  const { t } = useTranslation();
  const [showConfirmWithoutPhoto, setShowConfirmWithoutPhoto] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || loading) return;
    void onSelectPhoto(file);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/75 backdrop-blur-sm sm:p-4"
        onClick={loading ? undefined : onClose}
      >
        <div
          className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <div className="min-w-0">
              <h2 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                {title ?? t('tasks.completeModalTitle')}
              </h2>
              <p className="mt-0.5 text-xs font-semibold text-orange-600 dark:text-orange-400 truncate">
                {taskTitle}
              </p>
              {subtitle && (
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {subtitle}
                </p>
              )}
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={onClose}
              aria-label={t('common.close')}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-3">
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {hint ??
                (allowWithoutPhoto
                  ? t('tasks.completeModalHint')
                  : t('tasks.completeModalPhotoHint'))}
            </p>

            {loading ? (
              <div className="flex items-center justify-center gap-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 py-6 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                <span>{t('tasks.completing')}</span>
              </div>
            ) : (
              <div className="space-y-2.5">
                {/* Camera option (uses capture="environment") */}
                <label className="w-full min-h-[48px] flex items-center justify-center gap-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-3 text-sm font-bold text-white transition-colors cursor-pointer">
                  <Camera className="w-4 h-4 shrink-0" />
                  <span>{t('common.camera')}</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>

                {/* Gallery option (no capture attribute) */}
                <label className="w-full min-h-[48px] flex items-center justify-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100 transition-colors cursor-pointer">
                  <ImagePlus className="w-4 h-4 text-orange-500 shrink-0" />
                  <span>{t('common.gallery')}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>

                {/* Continue without photo option */}
                {allowWithoutPhoto && onContinueWithoutPhoto && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirmWithoutPhoto) {
                        setShowConfirmWithoutPhoto(true);
                      } else {
                        void onContinueWithoutPhoto();
                      }
                    }}
                    className="w-full min-h-[48px] flex items-center justify-center gap-2.5 rounded-xl border border-emerald-600/30 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300 transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{t('tasks.continueWithoutPhoto')}</span>
                  </button>
                )}
              </div>
            )}

            {error && (
              <p className="text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>

          <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex justify-end">
            <button
              type="button"
              disabled={loading}
              onClick={onClose}
              className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </div>

      {showConfirmWithoutPhoto && onContinueWithoutPhoto && (
        <ConfirmDialog
          title={t('confirm.withoutPhotoTitle')}
          message={t('confirm.withoutPhotoMessage')}
          detail={taskTitle}
          confirmLabel={t('confirm.withoutPhotoConfirm')}
          cancelLabel={t('common.cancel')}
          variant="emerald"
          loading={loading}
          onConfirm={async () => {
            setShowConfirmWithoutPhoto(false);
            await onContinueWithoutPhoto();
          }}
          onCancel={() => setShowConfirmWithoutPhoto(false)}
        />
      )}
    </>
  );
};
