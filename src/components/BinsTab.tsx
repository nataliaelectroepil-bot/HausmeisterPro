import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Plus,
  Repeat,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { BinSchedule, BinType, PropertyObject } from '../types/facility';
import {
  formatDateDE,
  formatShortDateDE,
  formatTimeDE,
  getISOWeekAndYear,
  getTodayISODate,
  getWeekStartEnd,
} from '../utils/dateUtils';
import { createWatermarkedPhoto } from '../utils/photoWatermark';

interface BinsTabProps {
  schedules: BinSchedule[];
  objects: PropertyObject[];
  onUpdateSchedule: (id: string, patch: Partial<BinSchedule>) => Promise<void>;
  onCreateSchedules: (items: Array<Omit<BinSchedule, 'id'>>) => Promise<void>;
}

const BIN_META: Record<
  BinType,
  { label: string; dotClass: string; badgeBg: string; borderClass: string }
> = {
  Restmüll: {
    label: 'Restmüll',
    dotClass: 'bg-black ring-1 ring-neutral-500/50',
    badgeBg: 'bg-black text-white border border-neutral-700',
    borderClass: 'border-neutral-800 dark:border-neutral-700',
  },
  Papier: {
    label: 'Papier',
    dotClass: 'bg-blue-600',
    badgeBg: 'bg-blue-600 text-white',
    borderClass: 'border-blue-300 dark:border-blue-800',
  },
  'Gelbe Tonne': {
    label: 'Gelbe Tonne',
    dotClass: 'bg-yellow-400',
    badgeBg: 'bg-yellow-400 text-slate-950',
    borderClass: 'border-yellow-300 dark:border-yellow-700',
  },
  Bio: {
    label: 'Bio',
    dotClass: 'bg-amber-900 dark:bg-amber-800',
    badgeBg: 'bg-amber-900 text-white dark:bg-amber-800',
    borderClass: 'border-amber-800/40 dark:border-amber-700',
  },
};

const BIN_TYPES: BinType[] = ['Restmüll', 'Papier', 'Gelbe Tonne', 'Bio'];

export const BinsTab: React.FC<BinsTabProps> = ({
  schedules,
  objects,
  onUpdateSchedule,
  onCreateSchedules,
}) => {
  const { t, tBin, locale } = useTranslation();
  const initialKW = useMemo(() => getISOWeekAndYear(new Date()), []);
  const [selectedKW, setSelectedKW] = useState<{ kw: number; year: number }>(initialKW);
  const [selectedBinFilter, setSelectedBinFilter] = useState<'Alle' | BinType>('Alle');
  const [photoModalBin, setPhotoModalBin] = useState<BinSchedule | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [uploadingPhotoId, setUploadingPhotoId] = useState<string | null>(null);

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

  const completedCount = weekSchedules.filter((s) => s.status_out && s.status_in).length;

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
              {t('bins.weekProgressVal', { done: completedCount, total: weekSchedules.length })}
            </p>
          </div>
          <div className="w-24 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{
                width:
                  weekSchedules.length > 0
                    ? `${Math.round((completedCount / weekSchedules.length) * 100)}%`
                    : '0%',
              }}
            />
          </div>
        </div>
      </div>

      {/* Bin Type Visual Filter Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <button
          type="button"
          onClick={() => setSelectedBinFilter('Alle')}
          className={`rounded-xl border p-3 text-left transition-all cursor-pointer ${
            selectedBinFilter === 'Alle'
              ? 'border-orange-500 bg-slate-900 text-white dark:bg-orange-500'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <Trash2 className="w-4 h-4 opacity-80" />
            <span className="font-mono text-xs font-bold tabular-nums">
              {weekSchedules.length}
            </span>
          </div>
          <p className="mt-2 text-xs font-semibold">{t('bins.allFractions')}</p>
        </button>

        {BIN_TYPES.map((type) => {
          const meta = BIN_META[type];
          const count = weekSchedules.filter((s) => s.bin_type === type).length;
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

      {/* Bin Action Cards */}
      {filteredSchedules.length === 0 ? (
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredSchedules.map((bin) => {
            const obj = objects.find((o) => o.id === bin.object_id);
            const meta = BIN_META[bin.bin_type];
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
                        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-bold ${meta.badgeBg}`}
                      >
                        {tBin(bin.bin_type)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                        {formatShortDateDE(bin.pickup_date)}
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
                      <span className={`h-3 w-3 rounded-sm ${BIN_META[typeKey].dotClass}`} />
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
