import React, { useState } from 'react';
import {
  CloudSnow,
  FileSignature,
  Gauge,
  Sparkles,
  Sprout,
  Wrench,
  X,
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { ActiveTab, PropertyObject } from '../types/facility';

interface ModulesDrawerProps {
  objects: PropertyObject[];
  defaultObjectId?: string;
  onSelectModule: (tab: ActiveTab, objectId?: string) => void;
  onClose: () => void;
}

export const ModulesDrawer: React.FC<ModulesDrawerProps> = ({
  objects,
  defaultObjectId,
  onSelectModule,
  onClose,
}) => {
  const { t } = useTranslation();
  const [selectedObjId, setSelectedObjId] = useState<string>(
    defaultObjectId || objects[0]?.id || ''
  );

  const modules: Array<{
    id: ActiveTab;
    title: string;
    subtitle: string;
    icon: React.FC<{ className?: string }>;
    accentClass: string;
  }> = [
    {
      id: 'winterdienst',
      title: t('drawer.winterTitle'),
      subtitle: t('drawer.winterSub'),
      icon: CloudSnow,
      accentClass: 'text-sky-500 bg-sky-50 dark:bg-sky-950/40',
    },
    {
      id: 'zaehlerstand',
      title: t('drawer.metersTitle'),
      subtitle: t('drawer.metersSub'),
      icon: Gauge,
      accentClass: 'text-orange-500 bg-orange-50 dark:bg-orange-950/40',
    },
    {
      id: 'uebergabe',
      title: t('drawer.handoverTitle'),
      subtitle: t('drawer.handoverSub'),
      icon: FileSignature,
      accentClass: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-950/40',
    },
    {
      id: 'reinigung',
      title: t('drawer.cleaningTitle'),
      subtitle: t('drawer.cleaningSub'),
      icon: Sparkles,
      accentClass: 'text-amber-500 bg-amber-50 dark:bg-amber-950/40',
    },
    {
      id: 'garten',
      title: t('drawer.gardenTitle'),
      subtitle: t('drawer.gardenSub'),
      icon: Sprout,
      accentClass: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/75 backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4 max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto sm:hidden" />

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-orange-500" />
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              {t('drawer.title')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('drawer.close')}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Optional Object Pre-selection */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
            {t('drawer.selectObject')}
          </label>
          <select
            value={selectedObjId}
            onChange={(e) => setSelectedObjId(e.target.value)}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white"
          >
            {objects.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>

        {/* 5 Modules List */}
        <div className="space-y-2">
          {modules.map((mod) => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => onSelectModule(mod.id, selectedObjId)}
                className="w-full flex items-center gap-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-orange-500 p-3.5 text-left transition-colors cursor-pointer min-h-[56px]"
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${mod.accentClass}`}
                >
                  <Icon className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {mod.title}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {mod.subtitle}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
