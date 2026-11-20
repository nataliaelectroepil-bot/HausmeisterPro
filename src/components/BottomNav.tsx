import React from 'react';
import {
  CalendarDays,
  ClipboardList,
  Clock,
  LayoutGrid,
  MapPin,
  Trash2,
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { ActiveTab } from '../types/facility';

interface BottomNavProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenModules: () => void;
  openTasksCount: number;
}

const MODULE_TABS: ActiveTab[] = [
  'winterdienst',
  'zaehlerstand',
  'uebergabe',
  'reinigung',
  'garten',
];

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelectTab,
  onOpenModules,
  openTasksCount,
}) => {
  const { t } = useTranslation();
  const isModuleActive = MODULE_TABS.includes(activeTab);

  const navItems: Array<{
    id: ActiveTab;
    label: string;
    icon: React.FC<{ className?: string }>;
  }> = [
    { id: 'karte', label: t('nav.map'), icon: MapPin },
    { id: 'aufgaben', label: t('nav.tasks'), icon: ClipboardList },
    { id: 'muelltonnen', label: t('nav.bins'), icon: Trash2 },
    { id: 'kalender', label: t('nav.calendar'), icon: CalendarDays },
    { id: 'arbeitszeit', label: t('nav.time'), icon: Clock },
  ];

  return (
    <nav
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 pb-safe"
    >
      <div className="grid grid-cols-6 h-16 items-center">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`relative flex flex-col items-center justify-center h-full min-h-[44px] px-1 transition-colors cursor-pointer ${
                isActive ? 'text-orange-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {item.id === 'aufgaben' && openTasksCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 font-mono text-[9px] font-bold text-white tabular-nums">
                    {openTasksCount}
                  </span>
                )}
              </div>
              <span className="mt-1 text-[10px] font-medium tracking-tight whitespace-nowrap truncate max-w-full">
                {item.label}
              </span>
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-7 rounded-b bg-orange-500" />
              )}
            </button>
          );
        })}

        {/* Expandable Module / Tools Button */}
        <button
          type="button"
          onClick={onOpenModules}
          className={`relative flex flex-col items-center justify-center h-full min-h-[44px] px-1 transition-colors cursor-pointer ${
            isModuleActive ? 'text-orange-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutGrid className="w-5 h-5" />
          <span className="mt-1 text-[10px] font-medium tracking-tight whitespace-nowrap truncate max-w-full">
            {t('nav.modules')}
          </span>
          {isModuleActive && (
            <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-7 rounded-b bg-orange-500" />
          )}
        </button>
      </div>
    </nav>
  );
};
