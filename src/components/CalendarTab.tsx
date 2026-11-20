import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Trash2,
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { BinSchedule, BinType, FacilityTask, PropertyObject } from '../types/facility';
import {
  formatDateDE,
  formatTimeDE,
  getISOWeekAndYear,
  getMonthGridDays,
  getTodayISODate,
  getWeekStartEnd,
} from '../utils/dateUtils';
import { BIN_VISUAL_META } from '../utils/binMeta';

interface CalendarTabProps {
  tasks: FacilityTask[];
  binSchedules: BinSchedule[];
  objects: PropertyObject[];
  onOpenTaskDetail: (task: FacilityTask) => void;
  onCreateTaskForDate: (dateStr: string) => void;
  onToggleBinOut: (bin: BinSchedule) => Promise<void>;
}

const BIN_DOT_COLOR: Record<BinType, string> = {
  Restmüll: 'bg-black ring-1 ring-neutral-500/60',
  Papier: 'bg-blue-600',
  'Gelbe Tonne': 'bg-yellow-400',
  Bio: 'bg-amber-900 dark:bg-amber-800',
};

export const CalendarTab: React.FC<CalendarTabProps> = ({
  tasks,
  binSchedules,
  objects,
  onOpenTaskDetail,
  onCreateTaskForDate,
  onToggleBinOut,
}) => {
  const { t, tCategory, tBin, weekdays, locale } = useTranslation();
  const todayStr = getTodayISODate();
  const [viewMode, setViewMode] = useState<'monat' | 'woche'>('monat');
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [cursorDate, setCursorDate] = useState<Date>(() => new Date());

  const monthLabel = cursorDate.toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  });

  const currentWeekInfo = useMemo(() => getISOWeekAndYear(cursorDate), [cursorDate]);

  const displayedDays = useMemo(() => {
    if (viewMode === 'monat') {
      return getMonthGridDays(cursorDate.getFullYear(), cursorDate.getMonth());
    }
    return getWeekStartEnd(currentWeekInfo.year, currentWeekInfo.kw).dates;
  }, [viewMode, cursorDate, currentWeekInfo]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, FacilityTask[]>();
    tasks.forEach((t) => {
      const key = t.due_date.slice(0, 10);
      const list = map.get(key) || [];
      list.push(t);
      map.set(key, list);
    });
    return map;
  }, [tasks]);

  const binsByDate = useMemo(() => {
    const map = new Map<string, BinSchedule[]>();
    binSchedules.forEach((b) => {
      const list = map.get(b.pickup_date) || [];
      list.push(b);
      map.set(b.pickup_date, list);
    });
    return map;
  }, [binSchedules]);

  const navigate = (delta: number) => {
    const d = new Date(cursorDate);
    if (viewMode === 'monat') {
      d.setMonth(d.getMonth() + delta);
    } else {
      d.setDate(d.getDate() + delta * 7);
    }
    setCursorDate(d);
  };

  const jumpToToday = () => {
    const now = new Date();
    setCursorDate(now);
    setSelectedDate(todayStr);
  };

  const selectedDayTasks = tasksByDate.get(selectedDate) || [];
  const selectedDayBins = binsByDate.get(selectedDate) || [];

  return (
    <div className="space-y-4">
      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            {t('cal.title')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {t('cal.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={jumpToToday}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer min-h-[40px]"
          >
            {t('common.today')}
          </button>

          <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1">
            <button
              type="button"
              onClick={() => setViewMode('monat')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                viewMode === 'monat'
                  ? 'bg-slate-900 text-white dark:bg-orange-500'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {t('common.month')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('woche')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                viewMode === 'woche'
                  ? 'bg-slate-900 text-white dark:bg-orange-500'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {t('common.week')}
            </button>
          </div>
        </div>
      </div>

      {/* Main Split on Desktop */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        {/* Calendar Grid */}
        <div className="xl:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label={t('common.back')}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white capitalize">
              {viewMode === 'monat'
                ? monthLabel
                : `${t('bins.kwPrefix')} ${currentWeekInfo.kw} · ${monthLabel}`}
            </h2>
            <button
              type="button"
              onClick={() => navigate(1)}
              aria-label={t('common.next')}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1.5">
            {weekdays.map((wd) => (
              <div
                key={wd}
                className="text-center text-xs font-semibold text-slate-400 dark:text-slate-500 py-1"
              >
                {wd}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {displayedDays.map((dateStr) => {
              const dObj = new Date(`${dateStr}T12:00:00`);
              const inCurrentMonth = dObj.getMonth() === cursorDate.getMonth();
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;
              const dayTasks = tasksByDate.get(dateStr) || [];
              const dayBins = binsByDate.get(dateStr) || [];

              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => setSelectedDate(dateStr)}
                  className={`flex flex-col items-start justify-between rounded-xl border p-1.5 sm:p-2 transition-all cursor-pointer ${
                    viewMode === 'woche' ? 'min-h-[88px]' : 'min-h-[60px] sm:min-h-[72px]'
                  } ${
                    isSelected
                      ? 'border-orange-500 bg-orange-50/70 dark:bg-orange-950/30 ring-1 ring-orange-500'
                      : 'border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  } ${
                    viewMode === 'monat' && !inCurrentMonth
                      ? 'opacity-40'
                      : 'bg-white dark:bg-slate-900'
                  }`}
                >
                  <span
                    className={`font-mono text-xs font-semibold tabular-nums flex h-6 w-6 items-center justify-center rounded-md ${
                      isToday
                        ? 'bg-orange-500 text-white'
                        : 'text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {dObj.getDate()}
                  </span>

                  {/* Color-coded dots */}
                  <div className="flex flex-wrap gap-1 mt-1 w-full">
                    {dayBins.slice(0, 4).map((b) => (
                      <span
                        key={b.id}
                        title={tBin(b.bin_type)}
                        className={`h-2 w-2 rounded-full ${BIN_DOT_COLOR[b.bin_type]}`}
                      />
                    ))}
                    {dayTasks.slice(0, 3).map((t) => (
                      <span
                        key={t.id}
                        title={t.title}
                        className={`h-2 w-2 rounded-sm ${
                          t.status === 'erledigt'
                            ? 'bg-emerald-500'
                            : t.priority === 'dringend'
                              ? 'bg-red-500'
                              : 'bg-orange-500'
                        }`}
                      />
                    ))}
                    {dayTasks
                      .flatMap((t) => t.bin_types ?? [])
                      .slice(0, 4)
                      .map((bin, idx) => (
                        <span
                          key={`${dateStr}_tbin_${idx}`}
                          title={tBin(bin)}
                          className={`h-2 w-2 rounded-full ${BIN_DOT_COLOR[bin]}`}
                        />
                      ))}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-4 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-orange-500" /> {t('cal.taskLegend')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-black ring-1 ring-neutral-500/60" /> {tBin('Restmüll')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> {tBin('Papier')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" /> {tBin('Gelbe Tonne')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-900 dark:bg-amber-800" /> {tBin('Bio')}
            </span>
          </div>
        </div>

        {/* Selected Date Agenda */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t('cal.selectedDay')}
              </p>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white font-mono tabular-nums">
                {formatDateDE(selectedDate)}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onCreateTaskForDate(selectedDate)}
              className="flex items-center gap-1 rounded-xl bg-orange-500 hover:bg-orange-600 px-3 py-2 text-xs font-semibold text-white cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('cal.addTask')}</span>
            </button>
          </div>

          {selectedDayTasks.length === 0 && selectedDayBins.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              {t('cal.emptyDay')}
            </p>
          ) : (
            <div className="space-y-3">
              {selectedDayTasks.map((task) => {
                const obj = objects.find((o) => o.id === task.object_id);
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onOpenTaskDetail(task)}
                    className="w-full text-left rounded-xl border border-slate-200 dark:border-slate-800 p-3 hover:border-orange-500 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-orange-600 dark:text-orange-400">
                        {tCategory(task.category)}
                      </span>
                      <span className="font-mono tabular-nums flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTimeDE(task.due_date)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                      {task.title}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                      {obj?.name ?? t('common.object')}
                    </p>
                    {task.bin_types && task.bin_types.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {task.bin_types.map((bin) => {
                          const meta = BIN_VISUAL_META[bin];
                          return (
                            <span
                              key={bin}
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ${meta.badgeClass}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass} ring-1 ring-white/50`} />
                              <span>{tBin(bin)}</span>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </button>
                );
              })}

              {selectedDayBins.map((bin) => {
                const obj = objects.find((o) => o.id === bin.object_id);
                return (
                  <div
                    key={bin.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
                        <span className={`h-2.5 w-2.5 rounded-full ${BIN_DOT_COLOR[bin.bin_type]}`} />
                        <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                        <span>{tBin(bin.bin_type)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                        {obj?.name ?? t('common.object')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onToggleBinOut(bin)}
                      className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold cursor-pointer ${
                        bin.status_out
                          ? 'bg-emerald-600 text-white'
                          : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {bin.status_out ? (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> {t('cal.binOutShort')}
                        </span>
                      ) : (
                        t('cal.binPutOut')
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
