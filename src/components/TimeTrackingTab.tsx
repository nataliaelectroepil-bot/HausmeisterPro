import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  FileDown,
  Pause,
  Play,
  Square,
  User as UserIcon,
} from 'lucide-react';
import { TimeEntry, User } from '../types/facility';
import {
  formatDateDE,
  formatDurationHHMMSS,
  formatMinutesAsHoursDE,
  formatTimeDE,
  getTodayISODate,
} from '../utils/dateUtils';
import {
  exportDailyWorkdayPDF,
  exportMonthlyTimesheetPDF,
} from '../utils/pdfExport';
import { useTranslation } from '../i18n/LanguageContext';
import { PDF_LABELS } from '../i18n/translations';
import { pb } from '../services/pocketbaseService';

interface TimeTrackingTabProps {
  currentUser: User;
  timeEntries: TimeEntry[];
  onUpsertTimeEntry: (entry: TimeEntry) => Promise<void>;
}

export const TimeTrackingTab: React.FC<TimeTrackingTabProps> = ({
  currentUser,
  timeEntries,
  onUpsertTimeEntry,
}) => {
  const { t, locale, docLanguage, months } = useTranslation();
  const oclockSuffix = t('common.oclock') ? ` ${t('common.oclock')}` : '';
  const todayStr = getTodayISODate();
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [expandedDayId, setExpandedDayId] = useState<string | null>(null);

  const sessionModel = pb.authStore.model ?? currentUser;
  const activeWorkerId = sessionModel.id;
  const activeWorkerName =
    (typeof sessionModel.name === 'string' && sessionModel.name.trim()) ||
    sessionModel.email;
  const activeEmployeeId = sessionModel.employee_id;

  const userEntries = useMemo(() => {
    return timeEntries
      .filter((e) => e.user_id === activeWorkerId)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [timeEntries, activeWorkerId]);

  const todayEntry = userEntries.find((e) => e.date === todayStr);

  // Live 1s ticker when shift is active or paused
  useEffect(() => {
    if (!todayEntry || todayEntry.status === 'beendet' || todayEntry.status === 'nicht_begonnen') {
      return;
    }
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [todayEntry]);

  // Compute live worked seconds & pause minutes for today
  const liveStats = useMemo(() => {
    if (!todayEntry) {
      return {
        status: 'nicht_begonnen' as const,
        workSeconds: 0,
        pauseMinutes: 0,
      };
    }

    if (todayEntry.status === 'beendet') {
      return {
        status: 'beendet' as const,
        workSeconds: todayEntry.total_work_minutes * 60,
        pauseMinutes: todayEntry.total_pause_minutes,
      };
    }

    const startMs = new Date(todayEntry.start_time).getTime();
    let currentPauseSeconds = todayEntry.total_pause_minutes * 60;
    if (todayEntry.status === 'pause' && todayEntry.pause_started_at) {
      currentPauseSeconds += Math.max(
        0,
        Math.floor((nowMs - new Date(todayEntry.pause_started_at).getTime()) / 1000)
      );
    }

    const elapsedSeconds = Math.max(0, Math.floor((nowMs - startMs) / 1000));
    const workSeconds = Math.max(0, elapsedSeconds - currentPauseSeconds);

    return {
      status: todayEntry.status,
      workSeconds,
      pauseMinutes: Math.floor(currentPauseSeconds / 60),
    };
  }, [todayEntry, nowMs]);

  const currentMonthPrefix = todayStr.slice(0, 7);
  const monthEntries = useMemo(
    () => userEntries.filter((e) => e.date.startsWith(currentMonthPrefix)),
    [userEntries, currentMonthPrefix]
  );

  const monthTotalMinutes = useMemo(() => {
    return monthEntries.reduce((acc, e) => {
      if (e.date === todayStr && (e.status === 'aktiv' || e.status === 'pause')) {
        return acc + Math.floor(liveStats.workSeconds / 60);
      }
      return acc + e.total_work_minutes;
    }, 0);
  }, [monthEntries, todayStr, liveStats.workSeconds]);

  const todayDateObj = new Date(`${todayStr}T12:00:00`);
  const monthLabel = `${months[todayDateObj.getMonth()] ?? ''} ${todayDateObj.getFullYear()}`;

  const pdfMonthLabel = new Date(`${todayStr}T12:00:00`).toLocaleDateString(
    PDF_LABELS[docLanguage].locale,
    {
      month: 'long',
      year: 'numeric',
    }
  );

  const handleStartWork = async () => {
    const nowIso = new Date().toISOString();
    if (!todayEntry) {
      await onUpsertTimeEntry({
        id: `te_${activeWorkerId}_${todayStr}`,
        user_id: activeWorkerId,
        date: todayStr,
        start_time: nowIso,
        total_pause_minutes: 0,
        total_work_minutes: 0,
        status: 'aktiv',
        notes: t('time.startedNote'),
      });
    } else if (todayEntry.status === 'pause') {
      const addedPauseMin = todayEntry.pause_started_at
        ? Math.max(
            1,
            Math.round(
              (Date.now() - new Date(todayEntry.pause_started_at).getTime()) / 60000
            )
          )
        : 0;
      await onUpsertTimeEntry({
        ...todayEntry,
        status: 'aktiv',
        pause_started_at: undefined,
        total_pause_minutes: todayEntry.total_pause_minutes + addedPauseMin,
      });
    } else if (todayEntry.status === 'beendet') {
      // Resume if needed same day
      await onUpsertTimeEntry({
        ...todayEntry,
        status: 'aktiv',
        end_time: undefined,
      });
    }
  };

  const handleTogglePause = async () => {
    if (!todayEntry) return;
    if (todayEntry.status === 'aktiv') {
      await onUpsertTimeEntry({
        ...todayEntry,
        status: 'pause',
        pause_started_at: new Date().toISOString(),
      });
    } else if (todayEntry.status === 'pause') {
      await handleStartWork();
    }
  };

  const handleEndWork = async () => {
    if (!todayEntry || todayEntry.status === 'beendet') return;
    const endIso = new Date().toISOString();
    let finalPauseMin = todayEntry.total_pause_minutes;
    if (todayEntry.status === 'pause' && todayEntry.pause_started_at) {
      finalPauseMin += Math.max(
        1,
        Math.round(
          (Date.now() - new Date(todayEntry.pause_started_at).getTime()) / 60000
        )
      );
    }
    const grossMinutes = Math.max(
      0,
      Math.round((Date.now() - new Date(todayEntry.start_time).getTime()) / 60000)
    );
    const netMinutes = Math.max(0, grossMinutes - finalPauseMin);

    await onUpsertTimeEntry({
      ...todayEntry,
      status: 'beendet',
      end_time: endIso,
      pause_started_at: undefined,
      total_pause_minutes: finalPauseMin,
      total_work_minutes: netMinutes,
    });
  };

  const statusText =
    liveStats.status === 'aktiv'
      ? t('time.statusActive')
      : liveStats.status === 'pause'
        ? t('time.statusPause')
        : liveStats.status === 'beendet'
          ? t('time.statusEnded')
          : t('time.statusNotStarted');

  const statusBadgeClass =
    liveStats.status === 'aktiv'
      ? 'bg-emerald-600 text-white'
      : liveStats.status === 'pause'
        ? 'bg-orange-500 text-white'
        : liveStats.status === 'beendet'
          ? 'bg-slate-700 text-white'
          : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300';

  const needsArbZGBreakWarning =
    liveStats.workSeconds > 6 * 3600 && liveStats.pauseMinutes < 30;

  return (
    <div className="space-y-5">
      {/* Page Title, Active Worker Badge & PDF Export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            {t('time.title')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {t('time.subtitle')}
          </p>
          <div className="mt-2 inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs sm:text-sm shadow-xs">
            <UserIcon className="w-4 h-4 text-orange-500 shrink-0" />
            <span className="font-semibold text-slate-500 dark:text-slate-400">
              {t('time.workerLabel')}:
            </span>
            <span className="font-bold text-slate-900 dark:text-white">
              {activeWorkerName}
            </span>
            {activeEmployeeId && (
              <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-700 pl-2 tabular-nums">
                {activeEmployeeId}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            exportMonthlyTimesheetPDF({
              user: { ...sessionModel, id: activeWorkerId, name: activeWorkerName },
              monthLabel: pdfMonthLabel,
              entries: monthEntries,
              docLang: docLanguage,
            })
          }
          className="flex items-center gap-2 rounded-xl bg-slate-900 dark:bg-orange-500 hover:bg-slate-800 dark:hover:bg-orange-600 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white transition-colors cursor-pointer min-h-[44px]"
        >
          <FileDown className="w-4 h-4" />
          <span>{t('time.exportPdf')}</span>
        </button>
      </div>

      {/* Live Timer & Controls Card */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-7">
        <div className="flex flex-col items-center text-center">
          <span className={`px-3 py-1 rounded-lg text-xs font-bold ${statusBadgeClass}`}>
            {statusText}
          </span>

          <div className="mt-4 font-mono text-4xl sm:text-6xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">
            {formatDurationHHMMSS(liveStats.workSeconds)}
          </div>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            {t('time.netToday', { date: formatDateDE(todayStr) })}
          </p>

          {/* 3 Large Tactile Shift Buttons */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-2xl">
            <button
              type="button"
              onClick={handleStartWork}
              disabled={liveStats.status === 'aktiv'}
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 py-3.5 px-4 text-sm font-bold text-white transition-colors cursor-pointer min-h-[52px]"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>
                {liveStats.status === 'pause' ? t('time.resumeWork') : t('time.startWork')}
              </span>
            </button>

            <button
              type="button"
              onClick={handleTogglePause}
              disabled={
                liveStats.status === 'nicht_begonnen' || liveStats.status === 'beendet'
              }
              className="flex items-center justify-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-40 py-3.5 px-4 text-sm font-bold text-white transition-colors cursor-pointer min-h-[52px]"
            >
              <Pause className="w-4 h-4 fill-current" />
              <span>{liveStats.status === 'pause' ? t('time.endPause') : t('time.pause')}</span>
            </button>

            <button
              type="button"
              onClick={handleEndWork}
              disabled={
                liveStats.status === 'nicht_begonnen' || liveStats.status === 'beendet'
              }
              className="flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 py-3.5 px-4 text-sm font-bold text-white transition-colors cursor-pointer min-h-[52px]"
            >
              <Square className="w-4 h-4 fill-current" />
              <span>{t('time.endWork')}</span>
            </button>
          </div>

          {needsArbZGBreakWarning && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-2.5 text-xs font-medium text-amber-900 dark:text-amber-200">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{t('time.arbzgWarn')}</span>
            </div>
          )}
        </div>
      </div>

      {/* 4 Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t('time.kpiStart')}
          </p>
          <p className="mt-1.5 font-mono text-xl font-bold text-slate-900 dark:text-white tabular-nums">
            {todayEntry ? `${formatTimeDE(todayEntry.start_time)}${oclockSuffix}` : '—'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t('time.kpiPause')}
          </p>
          <p className="mt-1.5 font-mono text-xl font-bold text-slate-900 dark:text-white tabular-nums">
            {liveStats.pauseMinutes} {t('common.min')}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t('time.kpiToday')}
          </p>
          <p className="mt-1.5 font-mono text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {formatMinutesAsHoursDE(Math.floor(liveStats.workSeconds / 60))}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t('time.kpiMonth', { month: monthLabel })}
          </p>
          <p className="mt-1.5 font-mono text-xl font-bold text-orange-600 dark:text-orange-400 tabular-nums">
            {formatMinutesAsHoursDE(monthTotalMinutes)}
          </p>
        </div>
      </div>

      {/* Expandable Daily History Log (Verlauf) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-orange-500" />
            {t('time.historyTitle')}
          </h2>
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {t('time.entriesCount', { count: userEntries.length })}
          </span>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {userEntries.map((entry) => {
            const expanded = expandedDayId === entry.id;
            const isTodayLive =
              entry.date === todayStr &&
              (entry.status === 'aktiv' || entry.status === 'pause');
            const effectiveWorkMinutes = isTodayLive
              ? Math.floor(liveStats.workSeconds / 60)
              : entry.total_work_minutes;
            const effectivePauseMinutes = isTodayLive
              ? liveStats.pauseMinutes
              : entry.total_pause_minutes;

            return (
              <div key={entry.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedDayId(expanded ? null : entry.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setExpandedDayId(expanded ? null : entry.id);
                    }
                  }}
                  className="w-full px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer min-h-[52px]"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                      {formatDateDE(entry.date)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      {formatTimeDE(entry.start_time)} –{' '}
                      {entry.end_time ? formatTimeDE(entry.end_time) : t('time.activeLabel')} ·{' '}
                      {t('time.pause')}: {effectivePauseMinutes} {t('common.min')}
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
                    <span className="font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                      {formatMinutesAsHoursDE(effectiveWorkMinutes)}
                    </span>
                    <button
                      type="button"
                      title="Tagesbericht als PDF herunterladen"
                      aria-label="Tagesbericht als PDF herunterladen"
                      onClick={(e) => {
                        e.stopPropagation();
                        exportDailyWorkdayPDF({
                          user: {
                            ...sessionModel,
                            id: activeWorkerId,
                            name: activeWorkerName,
                          },
                          entry: {
                            ...entry,
                            total_work_minutes: effectiveWorkMinutes,
                            total_pause_minutes: effectivePauseMinutes,
                          },
                        });
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-orange-500 hover:text-orange-600 dark:hover:text-orange-400 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                      <span>PDF</span>
                    </button>
                    {expanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </div>

                {expanded && (
                  <div className="px-5 pb-4 pt-1 bg-slate-50 dark:bg-slate-800/30 text-xs text-slate-600 dark:text-slate-300 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        {t('time.shiftStart')}
                      </span>{' '}
                      <span className="font-mono tabular-nums">
                        {formatTimeDE(entry.start_time)}
                        {oclockSuffix}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        {t('time.shiftEnd')}
                      </span>{' '}
                      <span className="font-mono tabular-nums">
                        {entry.end_time
                          ? `${formatTimeDE(entry.end_time)}${oclockSuffix}`
                          : t('time.runningLabel')}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        {t('time.activityNote')}
                      </span>{' '}
                      {entry.notes || t('time.defaultNote')}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
