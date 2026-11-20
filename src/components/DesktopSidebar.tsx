import React from 'react';
import {
  CalendarDays,
  ClipboardList,
  Clock,
  CloudSnow,
  FileSignature,
  Gauge,
  MapPin,
  ShieldCheck,
  Sparkles,
  Sprout,
  Trash2,
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { ActiveTab, User } from '../types/facility';

interface DesktopSidebarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  currentUser: User;
  openTasksCount: number;
  overdueCount: number;
  pendingBinsCount: number;
}

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({
  activeTab,
  onSelectTab,
  currentUser,
  openTasksCount,
  overdueCount,
  pendingBinsCount,
}) => {
  const { t, tRole } = useTranslation();

  const mainItems: Array<{
    id: ActiveTab;
    label: string;
    icon: React.FC<{ className?: string }>;
    badge?: number;
    badgeTone?: 'red' | 'slate';
  }> = [
    { id: 'karte', label: t('sidebar.mapObjects'), icon: MapPin },
    {
      id: 'aufgaben',
      label: t('sidebar.tasksService'),
      icon: ClipboardList,
      badge: openTasksCount,
      badgeTone: overdueCount > 0 ? 'red' : 'slate',
    },
    {
      id: 'muelltonnen',
      label: t('sidebar.binsService'),
      icon: Trash2,
      badge: pendingBinsCount,
      badgeTone: 'slate',
    },
    { id: 'kalender', label: t('sidebar.calendar'), icon: CalendarDays },
    { id: 'arbeitszeit', label: t('sidebar.timeTracking'), icon: Clock },
  ];

  const moduleItems: Array<{
    id: ActiveTab;
    label: string;
    icon: React.FC<{ className?: string }>;
  }> = [
    { id: 'winterdienst', label: t('sidebar.winter'), icon: CloudSnow },
    { id: 'zaehlerstand', label: t('sidebar.meters'), icon: Gauge },
    { id: 'uebergabe', label: t('sidebar.handover'), icon: FileSignature },
    { id: 'reinigung', label: t('sidebar.cleaning'), icon: Sparkles },
    { id: 'garten', label: t('sidebar.garden'), icon: Sprout },
  ];

  return (
    <aside className="hidden md:flex md:w-64 lg:w-68 shrink-0 flex-col justify-between border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 overflow-y-auto">
      <div className="space-y-5">
        <div>
          <p className="px-3 text-xs font-semibold text-slate-400 dark:text-slate-500 mb-2">
            {t('sidebar.workspaces')}
          </p>
          <nav aria-label="Desktop Navigation" className="space-y-1">
            {mainItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-slate-900 text-white dark:bg-orange-500 dark:text-white'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive
                          ? 'text-orange-400 dark:text-white'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    />
                    <span className="truncate whitespace-nowrap">{item.label}</span>
                  </span>
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span
                      className={`font-mono text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded-md ${
                        item.badgeTone === 'red'
                          ? 'bg-red-500 text-white'
                          : isActive
                            ? 'bg-slate-700 dark:bg-orange-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Specialized Modules / Tools Section */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
          <p className="px-3 text-xs font-semibold text-slate-400 dark:text-slate-500 mb-2">
            {t('sidebar.modulesTools')}
          </p>
          <nav aria-label="Modules Navigation" className="space-y-1">
            {moduleItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-slate-900 text-white dark:bg-orange-500 dark:text-white'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive
                        ? 'text-orange-400 dark:text-white'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  />
                  <span className="truncate whitespace-nowrap">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {currentUser.role === 'admin' && (
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <p className="px-3 text-xs font-semibold text-slate-400 dark:text-slate-500 mb-2">
              {t('sidebar.management')}
            </p>
            <button
              type="button"
              onClick={() => onSelectTab('disposition')}
              className={`w-full flex items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                activeTab === 'disposition'
                  ? 'bg-orange-500 text-white'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <ShieldCheck
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'disposition' ? 'text-white' : 'text-orange-500'
                  }`}
                />
                <span className="whitespace-nowrap">{t('sidebar.dispositionAdmin')}</span>
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Logged-in user card */}
      <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 dark:bg-slate-700 font-display text-xs font-bold text-white">
            {currentUser.name
              .split(' ')
              .map((p) => p[0])
              .slice(0, 2)
              .join('')}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
              {currentUser.name}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
              {currentUser.employee_id} · {tRole(currentUser.role, true)}
            </p>
          </div>
        </div>
        <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400 truncate">
          {currentUser.region}
        </p>
      </div>
    </aside>
  );
};
