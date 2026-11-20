import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useTranslation } from '../i18n/LanguageContext';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const { t } = useTranslation();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        title={t('pwa.installTitle')}
        className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2 sm:px-3 py-1 text-xs font-medium text-slate-100 hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 h-8 sm:h-9 cursor-pointer"
      >
        <Download className="w-3.5 h-3.5 text-orange-400" />
        <span className="hidden lg:inline">{t('pwa.install')}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          title={t('pwa.iosTitle')}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2 sm:px-2.5 py-1 text-xs font-medium text-slate-100 hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 h-8 sm:h-9 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-orange-400" />
          <span className="hidden sm:inline">{t('pwa.iosButton')}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {t('pwa.iosTitle')}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label={t('common.close')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <li className="flex items-start gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800 font-mono text-xs font-semibold text-slate-900 dark:text-white">
                    1
                  </span>
                  <span>
                    {t('pwa.iosStep1Pre')}{' '}
                    <strong className="inline-flex items-center gap-1 text-slate-900 dark:text-white">
                      {t('pwa.iosStep1Icon')} <Share className="w-3.5 h-3.5 inline" />
                    </strong>
                    .
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800 font-mono text-xs font-semibold text-slate-900 dark:text-white">
                    2
                  </span>
                  <span>
                    {t('pwa.iosStep2Pre')}{' '}
                    <strong className="text-slate-900 dark:text-white">
                      {t('pwa.iosStep2Target')}
                    </strong>
                    .
                  </span>
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-slate-900 dark:bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 dark:hover:bg-orange-600 transition-colors cursor-pointer"
              >
                {t('pwa.understood')}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
