import React from 'react';
import { Camera, ImagePlus, Loader2 } from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';

interface PhotoUploadButtonsProps {
  onSelectFile: (file: File) => void | Promise<void>;
  loading?: boolean;
  loadingLabel?: string;
  cameraLabel?: string;
  galleryLabel?: string;
  variant?: 'emerald' | 'orange' | 'neutral';
  compact?: boolean;
  fullWidth?: boolean;
  disabled?: boolean;
  className?: string;
}

export const PhotoUploadButtons: React.FC<PhotoUploadButtonsProps> = ({
  onSelectFile,
  loading = false,
  loadingLabel,
  cameraLabel,
  galleryLabel,
  variant = 'neutral',
  compact = false,
  fullWidth = false,
  disabled = false,
  className = '',
}) => {
  const { t } = useTranslation();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || disabled || loading) return;
    void onSelectFile(file);
  };

  const sizeClass = compact
    ? 'px-2.5 py-1.5 text-xs min-h-[38px]'
    : 'px-3.5 py-2 text-xs sm:text-sm min-h-[42px]';

  const cameraVariantClass =
    variant === 'emerald'
      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
      : variant === 'orange'
        ? 'bg-orange-500 hover:bg-orange-600 text-white'
        : 'bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white';

  const galleryVariantClass =
    'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700';

  const itemFlexClass = fullWidth ? 'flex-1 min-w-[140px]' : '';
  const disabledClass = disabled || loading ? 'opacity-60 pointer-events-none' : 'cursor-pointer';

  const camText = loading && loadingLabel ? loadingLabel : cameraLabel || t('common.takePhoto');
  const galText = galleryLabel || t('common.chooseGallery');

  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${fullWidth ? 'w-full' : ''} ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Camera option (uses capture="environment") */}
      <label
        className={`flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors whitespace-nowrap ${sizeClass} ${cameraVariantClass} ${itemFlexClass} ${disabledClass}`}
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
        ) : (
          <Camera className="w-3.5 h-3.5 shrink-0" />
        )}
        <span>{camText}</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          disabled={disabled || loading}
          onChange={handleFileChange}
        />
      </label>

      {/* Gallery option (no capture attribute so user can select existing file) */}
      <label
        className={`flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors whitespace-nowrap ${sizeClass} ${galleryVariantClass} ${itemFlexClass} ${disabledClass}`}
      >
        <ImagePlus className="w-3.5 h-3.5 text-orange-500 shrink-0" />
        <span>{galText}</span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={disabled || loading}
          onChange={handleFileChange}
        />
      </label>
    </div>
  );
};
