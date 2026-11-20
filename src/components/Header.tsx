import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  Globe,
  LogOut,
  Moon,
  Plus,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { SUPPORTED_LANGUAGES } from '../i18n/translations';
import { ActiveTab, AppNotification, User } from '../types/facility';
import { formatDateTimeDE } from '../utils/dateUtils';
import { PWAInstallButton } from './PWAInstallButton';

interface HeaderProps {
  currentUser: User;
  isDark: boolean;
  onToggleTheme: () => void;
  notifications: AppNotification[];
  onMarkNotificationRead: (id: string) => void;
  onMarkAllRead: () => void;
  onOpenNewTask: () => void;
  onLogout: () => void;
  onNavigateTab: (tab: ActiveTab) => void;
  activeTab: ActiveTab;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  isDark,
  onToggleTheme,
  notifications,
  onMarkNotificationRead,
  onMarkAllRead,
  onOpenNewTask,
  onLogout,
  onNavigateTab,
  activeTab,
}) => {
  const { language, setLanguage, t } = useTranslation();
  const [notifOpen, setNotifOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const langPopoverRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (langPopoverRef.current && !langPopoverRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    };
    if (notifOpen || langOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [notifOpen, langOpen]);

  return (
    <header className="sticky top-0 z-40 min-h-14 md:min-h-16 bg-slate-900 text-white border-b border-slate-800 px-2.5 sm:px-6 py-2 md:py-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
      {/* Brand Zone */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={() => onNavigateTab('karte')}
          className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded-lg"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 border border-slate-700">
            <svg viewBox="0 0 32 32" className="w-5 h-5" fill="none" aria-hidden="true">
              <path d="M16 5L5 14V26H10V16L16 11L22 16V26H27V14L16 5Z" fill="#F8FAFC" />
              <rect x="13" y="17" width="6" height="9" rx="1" fill="#F97316" />
              <circle cx="16" cy="13.5" r="1.5" fill="#F97316" />
            </svg>
          </span>
          <span className="font-display text-sm sm:text-base font-bold tracking-tight text-white">
            HAUSMEISTER PRO
          </span>
        </button>

        {/* Employee Name & ID */}
        <div className="hidden lg:flex items-center gap-2 text-xs text-slate-300 border-l border-slate-700 pl-3 whitespace-nowrap">
          <span className="font-medium text-white">{currentUser.name}</span>
          <span aria-hidden="true" className="text-slate-500">·</span>
          <span className="font-mono text-slate-300 tabular-nums">{currentUser.employee_id}</span>
        </div>
      </div>

      {/* Actions Zone */}
      <div className="flex flex-wrap items-center justify-end gap-1 sm:gap-2 w-full sm:w-auto ml-auto">
        {currentUser.role === 'admin' && (
          <button
            type="button"
            onClick={() => onNavigateTab(activeTab === 'disposition' ? 'karte' : 'disposition')}
            className={`md:hidden flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap shrink-0 h-8 sm:h-9 cursor-pointer ${
              activeTab === 'disposition'
                ? 'bg-orange-500 text-white'
                : 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700'
            }`}
            title={t('sidebar.dispositionAdmin')}
          >
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>{t('header.admin')}</span>
          </button>
        )}

        <PWAInstallButton />

        <button
          type="button"
          onClick={onOpenNewTask}
          className="flex items-center gap-1 sm:gap-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 active:scale-[0.98] px-2 sm:px-3 py-1 text-xs sm:text-sm font-semibold text-white transition-all whitespace-nowrap shrink-0 h-8 sm:h-9 md:h-[38px] cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span className="hidden sm:inline">{t('header.newTask')}</span>
          <span className="sm:hidden">{t('header.newTaskShort')}</span>
        </button>

        {/* Language Switcher Dropdown */}
        <div className="relative" ref={langPopoverRef}>
          <button
            type="button"
            onClick={() => setLangOpen((prev) => !prev)}
            aria-label={t('header.language')}
            title={t('header.language')}
            className="flex h-8 sm:h-9 items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-1.5 sm:px-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Globe className="w-3.5 h-3.5 text-orange-400 shrink-0" />
            <span className="font-mono tracking-tight">{language}</span>
            <ChevronDown className="hidden sm:block w-3 h-3 text-slate-400 shrink-0" />
          </button>

          {langOpen && (
            <div className="absolute right-0 mt-2 w-52 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xl z-50 overflow-hidden py-1">
              <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                {t('header.language')}
              </div>
              {SUPPORTED_LANGUAGES.map((opt) => {
                const active = opt.code === language;
                return (
                  <button
                    key={opt.code}
                    type="button"
                    onClick={() => {
                      setLanguage(opt.code);
                      setLangOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 font-semibold'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-[11px] font-bold w-6 text-slate-500 dark:text-slate-400">
                        {opt.shortLabel}
                      </span>
                      <span className="truncate">{opt.nativeName}</span>
                    </span>
                    {active && <Check className="w-3.5 h-3.5 text-orange-500 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Theme Toggle */}
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={isDark ? t('header.themeLight') : t('header.themeDark')}
          title={isDark ? t('header.themeLight') : t('header.themeDark')}
          className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors cursor-pointer shrink-0"
        >
          {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Notifications */}
        <div className="relative" ref={popoverRef}>
          <button
            type="button"
            onClick={() => setNotifOpen((prev) => !prev)}
            aria-label={t('header.notifications')}
            className="relative flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors cursor-pointer shrink-0"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 font-mono text-[10px] font-bold text-white tabular-nums">
                {unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-1.5rem)] sm:w-96 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xl z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                <span className="font-display text-sm font-bold">{t('header.notifications')}</span>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={onMarkAllRead}
                    className="flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400 hover:underline cursor-pointer"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    {t('header.markAllRead')}
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {notifications.length === 0 ? (
                  <p className="p-4 text-sm text-slate-500 dark:text-slate-400 text-center">
                    {t('header.noNotifications')}
                  </p>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        onMarkNotificationRead(n.id);
                        if (n.target_tab) onNavigateTab(n.target_tab);
                        setNotifOpen(false);
                      }}
                      className={`w-full text-left px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/70 cursor-pointer ${
                        !n.read ? 'bg-orange-50/60 dark:bg-orange-950/20' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">
                          {n.title}
                        </span>
                        {!n.read && (
                          <span className="text-[11px] font-semibold text-orange-600 dark:text-orange-400 shrink-0">
                            {t('header.notifNew')}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        {n.message}
                      </p>
                      <span className="mt-1.5 block font-mono text-[11px] text-slate-400 tabular-nums">
                        {formatDateTimeDE(n.created_at)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Logout */}
        <button
          type="button"
          onClick={onLogout}
          aria-label={t('header.logout')}
          title={t('header.logout')}
          className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/40 transition-colors cursor-pointer shrink-0"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
