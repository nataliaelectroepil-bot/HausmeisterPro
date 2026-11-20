import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useTranslation } from '../i18n/LanguageContext';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const { t } = useTranslation();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-20 md:bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl border border-amber-600/30 bg-amber-500 px-3.5 py-2 text-xs font-semibold text-slate-950 shadow-lg"
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>{t('offline.banner')}</span>
    </div>
  );
};
