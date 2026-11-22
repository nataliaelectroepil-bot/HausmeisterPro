import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  MapPin,
  Plus,
  Repeat,
  RotateCcw,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { BinSchedule, BinType, FacilityTask, PropertyObject, User } from '../types/facility';
import {
  formatDateDE,
  formatDateTimeDE,
  formatShortDateDE,
  formatTimeDE,
  getISOWeekAndYear,
  getTodayISODate,
  getWeekStartEnd,
  isTaskOverdue,
} from '../utils/dateUtils';
import { createWatermarkedPhoto } from '../utils/photoWatermark';
import { BIN_VISUAL_META, getTaskEffectiveBinTypes } from '../utils/binMeta';

interface BinsTabProps {
  schedules: BinSchedule[];
  tasks: FacilityTask[];
  objects: PropertyObject[];
  users: User[];
  onUpdateSchedule: (id: string, patch: Partial<BinSchedule>) => Promise<void>;
  onCreateSchedules: (items: Array<Omit<BinSchedule, 'id'>>) => Promise<void>;
  onOpenTaskDetail: (task: FacilityTask) => void;
  onQuickCompleteWithPhoto: (
    task: FacilityTask,
    photo: Awaited<ReturnType<typeof createWatermarkedPhoto>>
  ) => Promise<void>;
  onUpdateTask: (taskId: string, patch: Partial<FacilityTask>) => Promise<void>;
}

const BIN_TYPES: BinType[] = ['Restmüll', 'Papier', 'Gelbe Tonne', 'Bio'];

function isBinTask(task: FacilityTask): boolean {
  return (
    task.category === 'Mülltonnendienst' ||
    (Array.isArray(task.bin_types) && task.bin_types.length > 0)
  );
}

export const BinsTab: React.FC<BinsTabProps> = ({
  schedules,
  tasks,
  objects,
  users,
  onUpdateSchedule,
  onCreateSchedules,
  onOpenTaskDetail,
  onQuickCompleteWithPhoto,
  onUpdateTask,
}) => {
  const { t, tBin, tCategory, tPriority, tStatus, locale } = useTranslation();
  const initialKW = useMemo(() => getISOWeekAndYear(new Date()), []);
  const [selectedKW, setSelectedKW] = useState<{ kw: number; year: number }>(initialKW);
  const [selectedBinFilter, setSelectedBinFilter] = useState<'Alle' | BinType>('Alle');
  const [photoModalBin, setPhotoModalBin] = useState<BinSchedule | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [uploadingPhotoId, setUploadingPhotoId] = useState<string | null>(null);
  const [uploadingTaskId, setUploadingTaskId] = useState<string | null>(null);

  // New Pickup Modal State
  const [newObjId, setNewObjId] = useState<string>(objects[0]?.id ?? '');
  const [newBinType, setNewBinType] = useState<BinType>('Restmüll');
  const [newDate, setNewDate] = useState<string>(getTodayISODate());
  const [isRecurring, setIsRecurring] = useState<boolean>(false);
  const [recurringWeeks, setRecurringWeeks] = useState<number>(4);

  const weekRange = useMemo(
    () => getWeekStartEnd(selectedKW.year, selectedKW.kw),
    [selectedKW]
  );

  const weekSchedules = useMemo(() => {
    return schedules
      .filter((s) => s.kw === selectedKW.kw && s.year === selectedKW.year)
      .sort((a, b) => a.pickup_date.localeCompare(b.pickup_date));
  }, [schedules, selectedKW]);

  const filteredSchedules = useMemo(() => {
    if (selectedBinFilter === 'Alle') return weekSchedules;
    return weekSchedules.filter((s) => s.bin_type === selectedBinFilter);
  }, [weekSchedules, selectedBinFilter]);

  const allBinTasks = useMemo(() => tasks.filter(isBinTask), [tasks]);

  const weekBinTasks = useMemo(() => {
    return allBinTasks.filter((task) => {
      if (!task.due_date) return false;
      const { kw, year } = getISOWeekAndYear(task.due_date);
      return kw === selectedKW.kw && year === selectedKW.year;
    });
  }, [allBinTasks, selectedKW]);

  // Show all non-completed Mülltonnendienst tasks regardless of KW plus completed tasks in the selected KW
  const relevantBinTasks = useMemo(() => {
    return allBinTasks
      .filter((task) => {
        if (task.status !== 'erledigt') return true;
        if (!task.due_date) return false;
        const { kw, year } = getISOWeekAndYear(task.due_date);
        return kw === selectedKW.kw && year === selectedKW.year;
      })
      .sort((a, b) => {
        const aDone = a.status === 'erledigt' ? 1 : 0;
        const bDone = b.status === 'erledigt' ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
        return a.due_date.localeCompare(b.due_date);
      });
  }, [allBinTasks, selectedKW]);

  const filteredBinTasks = useMemo(() => {
    if (selectedBinFilter === 'Alle') return relevantBinTasks;
    return relevantBinTasks.filter((task) =>
      getTaskEffectiveBinTypes(task).includes(selectedBinFilter)
    );
  }, [relevantBinTasks, selectedBinFilter]);

  const totalWeekItems = weekSchedules.length + weekBinTasks.length;
  const completedCount =
    weekSchedules.filter((s) => s.status_out && s.status_in).length +
    weekBinTasks.filter((task) => task.status === 'erledigt').length;

  const shiftKW = (delta: number) => {
    setSelectedKW((prev) => {
      let nextKw = prev.kw + delta;
      let nextYear = prev.year;
      if (nextKw < 1) {
        nextYear -= 1;
        nextKw = 52;
      } else if (nextKw > 52) {
        nextYear += 1;
        nextKw = 1;
      }
      return { kw: nextKw, year: nextYear };
    });
  };

  const handleToggleOut = async (bin: BinSchedule) => {
    const nextOut = !bin.status_out;
    await onUpdateSchedule(bin.id, {
      status_out: nextOut,
      time_out: nextOut ? new Date().toISOString() : undefined,
    });
  };

  const handleToggleIn = async (bin: BinSchedule) => {
    const nextIn = !bin.status_in;
    await onUpdateSchedule(bin.id, {
      status_in: nextIn,
      time_in: nextIn ? new Date().toISOString() : undefined,
    });
  };

  const handleBinPhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    bin: BinSchedule
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const obj = objects.find((o) => o.id === bin.object_id);
    setUploadingPhotoId(bin.id);
    try {
      const photo = await createWatermarkedPhoto(file, {
        objectName: obj?.name ?? t('common.object'),
        fallbackLat: obj?.lat,
        fallbackLng: obj?.lng,
        caption: `${tBin(bin.bin_type)} (${formatDateDE(bin.pickup_date)})`,
      });
      await onUpdateSchedule(bin.id, { photo });
      setPhotoModalBin({ ...bin, photo });
    } finally {
      setUploadingPhotoId(null);
      e.target.value = '';
    }
  };

  const handleTaskQuickPhoto = async (
    e: React.ChangeEvent<HTMLInputElement>,
    task: FacilityTask,
    obj?: PropertyObject
  ) => {
    e.stopPropagation();
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingTaskId(task.id);
    try {
      const photo = await createWatermarkedPhoto(file, {
        objectName: obj?.name ?? t('common.object'),
        fallbackLat: obj?.lat,
        fallbackLng: obj?.lng,
        caption: task.title,
      });
      await onQuickCompleteWithPhoto(task, photo);
    } finally {
      setUploadingTaskId(null);
      e.target.value = '';
    }
  };

  const handleCreateNewPickup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newObjId || !newDate) return;

    const count = isRecurring ? recurringWeeks : 1;
    const groupId = isRecurring ? `rec_${Date.now()}` : undefined;
    const entries: Array<Omit<BinSchedule, 'id'>> = [];

    for (let i = 0; i < count; i++) {
      const d = new Date(`${newDate}T12:00:00`);
      d.setDate(d.getDate() + i * 7);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const iso = `${y}-${m}-${day}`;
      const { kw, year } = getISOWeekAndYear(d);

      entries.push({
        object_id: newObjId,
        bin_type: newBinType,
        pickup_date: iso,
        kw,
        year,
        status_out: false,
        status_in: false,
        recurring_group_id: groupId,
      });
    }

    await onCreateSchedules(entries);
    const firstWeek = getISOWeekAndYear(newDate);
    setSelectedKW(firstWeek);
    setShowNewModal(false);
    setIsRecurring(false);
  };

  return (
    <div className="space-y-5">
      {/* Header + New Pickup CTA */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            {t('bins.title')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {t('bins.subtitle')}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white transition-colors cursor-pointer min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          <span>{t('bins.newPickup')}</span>
        </button>
      </div>

      {/* Calendar Week (KW) Selector & Progress */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftKW(-1)}
            aria-label={t('common.back')}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="px-3 text-center">
            <p className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white tabular-nums">
              {t('bins.kwPrefix')} {selectedKW.kw} · {selectedKW.year}
            </p>
            <p className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {weekRange.start.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })} –{' '}
              {weekRange.end.toLocaleDateString(locale, {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })}
            </p>
          </div>

          <button
            type="button"
            onClick={() => shiftKW(1)}
            aria-label={t('common.next')}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Counter */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('bins.weekProgress')}</p>
            <p className="font-mono text-base font-bold text-slate-900 dark:text-white tabular-nums">
              {t('bins.weekProgressVal', { done: completedCount, total: totalWeekItems })}
            </p>
          </div>
          <div className="w-24 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{
                width:
                  totalWeekItems > 0
                    ? `${Math.round((completedCount / totalWeekItems) * 100)}%`
                    : '0%',
              }}
            />
          </div>
        </div>
      </div>

      {/* Bin Type Visual Filter Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <button
          type="button"
          onClick={() => setSelectedBinFilter('Alle')}
          className={`rounded-xl border p-3 text-left transition-all cursor-pointer ${
            selectedBinFilter === 'Alle'
              ? 'border-slate-900 bg-slate-900 text-white dark:border-orange-500 dark:bg-orange-500'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <Trash2 className="w-4 h-4 opacity-80" />
            <span
              className={`font-mono text-xs font-bold tabular-nums ${
                selectedBinFilter === 'Alle' ? 'text-white' : ''
              }`}
            >
              {weekSchedules.length + relevantBinTasks.length}
            </span>
          </div>
          <p
            className={`mt-2 text-xs font-semibold leading-snug ${
              selectedBinFilter === 'Alle' ? 'text-white' : 'text-slate-900 dark:text-white'
            }`}
          >
            {t('bins.allFractions')}
          </p>
        </button>

        {BIN_TYPES.map((type) => {
          const meta = BIN_VISUAL_META[type];
          const count =
            weekSchedules.filter((s) => s.bin_type === type).length +
            relevantBinTasks.filter((task) => getTaskEffectiveBinTypes(task).includes(type)).length;
          const active = selectedBinFilter === type;

          return (
            <button
              key={type}
              type="button"
              onClick={() => setSelectedBinFilter(active ? 'Alle' : type)}
              className={`rounded-xl border p-3 text-left transition-all cursor-pointer ${
                active
                  ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/30 ring-1 ring-orange-500'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`h-4 w-4 rounded-md ${meta.dotClass}`} />
                <span className="font-mono text-xs font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                  {count}
                </span>
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-900 dark:text-white truncate">
                {tBin(type)}
              </p>
            </button>
          );
        })}
      </div>

      {/* Empty state only when BOTH schedules and Mülltonnendienst tasks are empty */}
      {filteredSchedules.length === 0 && filteredBinTasks.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center">
          <Trash2 className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="font-display text-base font-semibold text-slate-900 dark:text-white">
            {t('bins.emptyTitle', { kw: selectedKW.kw })}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t('bins.emptySub')}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Mülltonnendienst Tasks Section */}
          {filteredBinTasks.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>{t('bins.tasksSectionTitle')}</span>
                  <span className="font-mono text-xs font-bold rounded-md bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 px-2 py-0.5 tabular-nums">
                    {filteredBinTasks.length}
                  </span>
                </h2>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredBinTasks.map((task) => {
                  const obj = objects.find((o) => o.id === task.object_id);
                  const worker = users.find((u) => u.id === task.assigned_to);
                  const overdue = isTaskOverdue(task.due_date, task.status);
                  const checkedCount = task.checklist_json.filter((c) => c.checked).length;

                  return (
                    <div
                      key={task.id}
                      onClick={() => onOpenTaskDetail(task)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onOpenTaskDetail(task);
                        }
                      }}
                      className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 hover:border-orange-400 dark:hover:border-orange-500 transition-colors cursor-pointer flex flex-col justify-between gap-4"
                    >
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                            <span className="font-semibold text-orange-600 dark:text-orange-400">
                              {tCategory(task.category)}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {formatDateTimeDE(task.due_date, locale)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {overdue ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
                                <AlertTriangle className="w-3 h-3" />
                                {t('common.overdue')}
                              </span>
                            ) : task.priority === 'dringend' && task.status !== 'erledigt' ? (
                              <span className="text-xs font-bold text-red-600 dark:text-red-400">
                                {tPriority('dringend')}
                              </span>
                            ) : null}

                            <span
                              className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                                task.status === 'erledigt'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                  : task.status === 'in_bearbeitung'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              {tStatus(task.status)}
                            </span>
                          </div>
                        </div>

                        <h3 className="mt-2 font-display text-base font-bold text-slate-900 dark:text-white group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors leading-snug">
                          {task.title}
                        </h3>

                        <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <span>
                            <strong className="font-semibold text-slate-800 dark:text-slate-100">
                              {obj?.name ?? t('common.object')}
                            </strong>{' '}
                            · {obj?.address ?? '—'}
                          </span>
                        </p>

                        {(() => {
                          const effectiveBins = getTaskEffectiveBinTypes(task);
                          if (effectiveBins.length === 0) return null;
                          return (
                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                              {effectiveBins.map((binType) => {
                                const meta = BIN_VISUAL_META[binType];
                                return (
                                  <span
                                    key={binType}
                                    className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold ${meta.badgeClass}`}
                                  >
                                    <span
                                      className={`h-2 w-2 rounded-full ${meta.dotClass} ring-1 ring-white/50`}
                                    />
                                    <span>{tBin(binType)}</span>
                                  </span>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>

                      <div
                        className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                          <span className="flex items-center gap-1">
                            <ClipboardCheck className="w-3.5 h-3.5 text-slate-400" />
                            {checkedCount}/{task.checklist_json.length}
                          </span>
                          {worker && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-sans flex items-center gap-1">
                                <UserIcon className="w-3 h-3 text-slate-400" />
                                {worker.name}
                              </span>
                            </>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {task.status !== 'erledigt' ? (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  void onUpdateTask(task.id, {
                                    status: 'erledigt',
                                    completed_at: new Date().toISOString(),
                                  })
                                }
                                className="flex items-center gap-1.5 rounded-xl border border-emerald-600/40 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 cursor-pointer transition-colors min-h-[38px]"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{t('bins.markDone')}</span>
                              </button>

                              <label className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white cursor-pointer transition-colors min-h-[38px]">
                                <Camera className="w-3.5 h-3.5" />
                                <span>
                                  {uploadingTaskId === task.id
                                    ? t('tasks.savingPhoto')
                                    : t('common.photoCompleteBtn')}
                                </span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  className="hidden"
                                  onChange={(e) => handleTaskQuickPhoto(e, task, obj)}
                                />
                              </label>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                void onUpdateTask(task.id, {
                                  status: 'offen',
                                  completed_at: undefined,
                                })
                              }
                              className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>{t('bins.reopenTask')}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Bin Schedule Action Cards */}
          {filteredSchedules.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredSchedules.map((bin) => {
                const obj = objects.find((o) => o.id === bin.object_id);
                const meta = BIN_VISUAL_META[bin.bin_type];
                const bothDone = bin.status_out && bin.status_in;
                const oclockSuffix = t('common.oclock') ? ` ${t('common.oclock')}` : '';

                return (
                  <div
                    key={bin.id}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-bold ${meta.badgeClass}`}
                          >
                            {tBin(bin.bin_type)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                            {formatShortDateDE(bin.pickup_date, locale)}
                          </span>
                          {bin.recurring_group_id && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 text-slate-500">
                                <Repeat className="w-3 h-3" /> {t('bins.weekly')}
                              </span>
                            </>
                          )}
                        </div>

                        <h3 className="mt-2 font-display text-base font-bold text-slate-900 dark:text-white truncate">
                          {obj?.name ?? t('common.object')}
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{obj?.address ?? '—'}</span>
                        </p>
                      </div>

                      {bothDone && (
                        <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                          <CheckCircle2 className="w-4 h-4" />
                          {t('common.done')}
                        </span>
                      )}
                    </div>

                    {/* Tactile Out / In Buttons */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleToggleOut(bin)}
                        className={`flex flex-col items-center justify-center rounded-xl border px-3 py-2.5 min-h-[54px] transition-all cursor-pointer ${
                          bin.status_out
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 text-xs sm:text-sm font-bold">
                          <ArrowUp className="w-4 h-4" />
                          {t('bins.out')}
                        </span>
                        <span
                          className={`mt-0.5 font-mono text-[11px] tabular-nums ${
                            bin.status_out ? 'text-emerald-100' : 'text-slate-400'
                          }`}
                        >
                          {bin.status_out && bin.time_out
                            ? `${formatTimeDE(bin.time_out)}${oclockSuffix}`
                            : t('bins.tapConfirm')}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleIn(bin)}
                        className={`flex flex-col items-center justify-center rounded-xl border px-3 py-2.5 min-h-[54px] transition-all cursor-pointer ${
                          bin.status_in
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 text-xs sm:text-sm font-bold">
                          <ArrowDown className="w-4 h-4" />
                          {t('bins.in')}
                        </span>
                        <span
                          className={`mt-0.5 font-mono text-[11px] tabular-nums ${
                            bin.status_in ? 'text-emerald-100' : 'text-slate-400'
                          }`}
                        >
                          {bin.status_in && bin.time_in
                            ? `${formatTimeDE(bin.time_in)}${oclockSuffix}`
                            : t('bins.tapConfirm')}
                        </span>
                      </button>
                    </div>

                    {/* Photo Action Row */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {bin.photo ? t('bins.photoPresent') : t('bins.photoMissing')}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPhotoModalBin(bin)}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <Camera className="w-3.5 h-3.5 text-orange-500" />
                        <span>{t('bins.photoViewSend')}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Bin Photo Modal */}
      {photoModalBin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                {t('bins.photoModalTitle', { type: tBin(photoModalBin.bin_type) })}
              </h3>
              <button
                type="button"
                onClick={() => setPhotoModalBin(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {photoModalBin.photo ? (
              <img
                src={photoModalBin.photo.dataUrl}
                alt={tBin(photoModalBin.bin_type)}
                referrerPolicy="no-referrer"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 object-cover max-h-72"
              />
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                {t('bins.photoModalEmpty')}
              </div>
            )}

            <label className="w-full flex items-center justify-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 py-2.5 text-sm font-semibold text-white cursor-pointer">
              <Camera className="w-4 h-4" />
              <span>
                {uploadingPhotoId === photoModalBin.id
                  ? t('bins.photoProcessing')
                  : t('bins.photoTakeNew')}
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleBinPhotoUpload(e, photoModalBin)}
              />
            </label>
          </div>
        </div>
      )}

      {/* Create New Bin Pickup Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                {t('bins.newModalTitle')}
              </h3>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateNewPickup} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('bins.selectObject')}
                </label>
                <select
                  value={newObjId}
                  onChange={(e) => setNewObjId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white"
                >
                  {objects.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('bins.binType')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {BIN_TYPES.map((typeKey) => (
                    <button
                      key={typeKey}
                      type="button"
                      onClick={() => setNewBinType(typeKey)}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold cursor-pointer ${
                        newBinType === typeKey
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/30 text-slate-900 dark:text-white'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <span className={`h-3 w-3 rounded-sm ${BIN_VISUAL_META[typeKey].dotClass}`} />
                      {tBin(typeKey)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('bins.firstDate')}
                </label>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 font-mono text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3 space-y-2.5">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-100">
                    <Repeat className="w-4 h-4 text-orange-500" />
                    {t('bins.recurringLabel')}
                  </span>
                  <input
                    type="checkbox"
                    checked={isRecurring}
                    onChange={(e) => setIsRecurring(e.target.checked)}
                    className="h-4 w-4 rounded text-orange-500 cursor-pointer"
                  />
                </label>

                {isRecurring && (
                  <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 pt-1">
                    <span>{t('bins.duration')}</span>
                    <select
                      value={recurringWeeks}
                      onChange={(e) => setRecurringWeeks(Number(e.target.value))}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs"
                    >
                      <option value={4}>{t('bins.weeksCount', { n: 4 })}</option>
                      <option value={8}>{t('bins.weeksCount', { n: 8 })}</option>
                      <option value={12}>{t('bins.weeksCount', { n: 12 })}</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-orange-500 hover:bg-orange-600 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
                >
                  {t('bins.savePickup')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
