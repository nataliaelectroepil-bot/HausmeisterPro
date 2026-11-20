import React from 'react';
import { AlertTriangle, BellRing, ChevronRight, X } from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';

interface ReminderBannerProps {
  tomorrowCount: number;
  overdueCount: number;
  onDismiss: () => void;
  onViewTasks: () => void;
}

export const ReminderBanner: React.FC<ReminderBannerProps> = ({
  tomorrowCount,
  overdueCount,
  onDismiss,
  onViewTasks,
}) => {
  const { t } = useTranslation();

  if (tomorrowCount === 0 && overdueCount === 0) return null;

  return (
    <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/60 px-3 sm:px-6 py-2.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {overdueCount > 0 ? (
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          ) : (
            <BellRing className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          )}
          <p className="text-xs sm:text-sm font-medium text-amber-950 dark:text-amber-100 truncate">
            {t('banner.tomorrowTasks', { count: tomorrowCount })}
            {overdueCount > 0 && (
              <span className="ml-2 text-red-700 dark:text-red-400 font-semibold tabular-nums">
                {t('banner.overdueSuffix', { count: overdueCount })}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onViewTasks}
            className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold text-amber-900 dark:text-amber-200 hover:bg-amber-200/60 dark:hover:bg-amber-900/50 transition-colors whitespace-nowrap cursor-pointer"
          >
            <span>{t('banner.show')}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t('banner.dismiss')}
            className="flex h-7 w-7 items-center justify-center rounded-md text-amber-700 dark:text-amber-300 hover:bg-amber-200/60 dark:hover:bg-amber-900/50 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
