import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  FileSpreadsheet,
  Gauge,
  Pencil,
  QrCode,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  MeterReading,
  MeterType,
  PropertyObject,
  TaskPhoto,
  User,
} from '../../types/facility';
import { formatDateTimeDE } from '../../utils/dateUtils';
import { exportMeterReadingsCSV } from '../../utils/pdfExport';
import { createWatermarkedPhoto } from '../../utils/photoWatermark';
import { QRBarcodeScannerModal } from '../QRBarcodeScannerModal';
import { PhotoUploadButtons } from '../PhotoUploadButtons';
import { DoubleDeleteConfirmModal } from '../DoubleDeleteConfirmModal';
import { useTranslation } from '../../i18n/LanguageContext';

interface ZaehlerstandModuleProps {
  objects: PropertyObject[];
  users: User[];
  currentUser: User;
  readings: MeterReading[];
  initialObjectId?: string;
  onCreateReading: (reading: Omit<MeterReading, 'id'>) => Promise<void>;
  onUpdateReading: (id: string, patch: Partial<Omit<MeterReading, 'id'>>) => Promise<void>;
  onDeleteReading: (id: string) => Promise<void>;
}

function toDateTimeLocalValue(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().slice(0, 16);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dateStr)) {
    return dateStr.slice(0, 16);
  }
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const METER_TYPES: MeterType[] = [
  'Strom',
  'Kaltwasser',
  'Warmwasser',
  'Gas',
  'Wärmemengenzähler',
];

const UNIT_PRESETS = [
  'Allgemeinstrom / Keller',
  'Heizraum Zentral',
  'Whg. 01 (EG links)',
  'Whg. 02 (EG rechts)',
  'Whg. 03 (1. OG links)',
  'Whg. 04 (2. OG links)',
  'Gewerbeeinheit EG',
];

export const ZaehlerstandModule: React.FC<ZaehlerstandModuleProps> = ({
  objects,
  users,
  currentUser,
  readings,
  initialObjectId,
  onCreateReading,
  onUpdateReading,
  onDeleteReading,
}) => {
  const { t, tMeterType, docLanguage } = useTranslation();
  const [objectId, setObjectId] = useState<string>(
    initialObjectId || objects[0]?.id || ''
  );
  const [apartment, setApartment] = useState<string>(UNIT_PRESETS[0]);
  const [meterNumber, setMeterNumber] = useState<string>('');
  const [meterType, setMeterType] = useState<MeterType>('Strom');
  const [previousValue, setPreviousValue] = useState<string>('0');
  const [readingValue, setReadingValue] = useState<string>('');
  const [photo, setPhoto] = useState<TaskPhoto | undefined>(undefined);
  const [showScanner, setShowScanner] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  // Inline table row edit & double-confirm delete state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMeterNumber, setEditMeterNumber] = useState<string>('');
  const [editMeterType, setEditMeterType] = useState<MeterType>('Strom');
  const [editPreviousValue, setEditPreviousValue] = useState<string>('0');
  const [editReadingValue, setEditReadingValue] = useState<string>('0');
  const [editReadDate, setEditReadDate] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MeterReading | null>(null);

  useEffect(() => {
    if (initialObjectId) setObjectId(initialObjectId);
  }, [initialObjectId]);

  const selectedObject = objects.find((o) => o.id === objectId);

  const objectReadings = useMemo(
    () => readings.filter((r) => r.object_id === objectId),
    [readings, objectId]
  );

  // Known meters in selected object for quick fill
  const existingMeters = useMemo(() => {
    const seen = new Map<string, MeterReading>();
    objectReadings.forEach((r) => {
      if (!seen.has(r.meter_number)) seen.set(r.meter_number, r);
    });
    return Array.from(seen.values());
  }, [objectReadings]);

  const applyScannedCode = (code: string) => {
    setMeterNumber(code);
    const match = readings.find(
      (r) => r.meter_number.toLowerCase() === code.toLowerCase()
    );
    if (match) {
      setObjectId(match.object_id);
      setApartment(match.apartment);
      setMeterType(match.meter_type);
      setPreviousValue(String(match.reading_value));
    }
    setShowScanner(false);
  };

  const handlePhotoUpload = async (file: File) => {
    if (!selectedObject) return;
    setError(null);
    setUploadingPhoto(true);
    try {
      const watermarked = await createWatermarkedPhoto(file, {
        objectName: `${selectedObject.name} · ${apartment}`,
        fallbackLat: selectedObject.lat,
        fallbackLng: selectedObject.lng,
        caption: `Zähler ${meterNumber || meterType}`,
        extraStamp: readingValue ? `Stand: ${readingValue}` : undefined,
      });
      setPhoto(watermarked);
    } catch {
      setError(t('meters.errPhoto'));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meterNumber.trim() || !readingValue.trim()) {
      setError(t('meters.errMissing'));
      return;
    }
    if (!photo) {
      setError(t('meters.errPhoto'));
      return;
    }
    setError(null);
    await onCreateReading({
      object_id: objectId,
      apartment: apartment.trim() || 'Allgemein',
      meter_number: meterNumber.trim(),
      meter_type: meterType,
      reading_value: parseFloat(readingValue.replace(',', '.')) || 0,
      previous_value: parseFloat(previousValue.replace(',', '.')) || 0,
      photo,
      read_by: currentUser.id,
      read_date: new Date().toISOString().slice(0, 16),
    });
    setMeterNumber('');
    setReadingValue('');
    setPreviousValue('0');
    setPhoto(undefined);
    setSavedMsg(true);
    window.setTimeout(() => setSavedMsg(false), 2500);
  };

  const currentConsumption = useMemo(() => {
    const cur = parseFloat(readingValue.replace(',', '.'));
    const prev = parseFloat(previousValue.replace(',', '.'));
    if (Number.isNaN(cur) || Number.isNaN(prev)) return null;
    return Number((cur - prev).toFixed(2));
  }, [readingValue, previousValue]);

  const startEditingRow = (r: MeterReading) => {
    setEditingId(r.id);
    setEditMeterNumber(r.meter_number);
    setEditMeterType(r.meter_type);
    setEditPreviousValue(String(r.previous_value));
    setEditReadingValue(String(r.reading_value));
    setEditReadDate(toDateTimeLocalValue(r.read_date));
    setEditError(null);
  };

  const cancelEditingRow = () => {
    setEditingId(null);
    setEditError(null);
  };

  const saveEditingRow = async () => {
    if (!editingId) return;
    const trimmedNumber = editMeterNumber.trim();
    const parsedPrev = parseFloat(editPreviousValue.replace(',', '.'));
    const parsedCurr = parseFloat(editReadingValue.replace(',', '.'));
    if (!trimmedNumber || Number.isNaN(parsedPrev) || Number.isNaN(parsedCurr) || !editReadDate) {
      setEditError('Bitte gültige Zählernummer, Werte und Datum eingeben.');
      return;
    }
    setEditError(null);
    setSavingEdit(true);
    try {
      await onUpdateReading(editingId, {
        meter_number: trimmedNumber,
        meter_type: editMeterType,
        previous_value: parsedPrev,
        reading_value: parsedCurr,
        read_date: editReadDate,
      });
      setEditingId(null);
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Gauge className="w-6 h-6 text-orange-500" />
            {t('meters.title')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {t('meters.subtitle')}
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            exportMeterReadingsCSV({ readings, objects, users, docLang: docLanguage })
          }
          className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white transition-colors cursor-pointer min-h-[44px]"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>{t('meters.exportCsv')}</span>
        </button>
      </div>

      {/* Capture Form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              {t('meters.objectLabel')}
            </label>
            <select
              value={objectId}
              onChange={(e) => setObjectId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
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
              {t('meters.unitLabel')}
            </label>
            <input
              list="unit-presets-list"
              value={apartment}
              onChange={(e) => setApartment(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
              placeholder={t('meters.unitPlaceholder')}
            />
            <datalist id="unit-presets-list">
              {UNIT_PRESETS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </div>
        </div>

        {/* Existing meters quick picker */}
        {existingMeters.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              {t('meters.knownMeters')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {existingMeters.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => applyScannedCode(m.meter_number)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-orange-500 px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-100 cursor-pointer"
                >
                  {tMeterType(m.meter_type)} · <span className="font-mono">{m.meter_number}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Meter Number + Barcode Scanner + Meter Type */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              {t('meters.numberLabel')}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={meterNumber}
                onChange={(e) => setMeterNumber(e.target.value)}
                placeholder="z. B. 1EMH00884120"
                className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 font-mono text-sm text-slate-900 dark:text-white"
              />
              <button
                type="button"
                onClick={() => setShowScanner(true)}
                className="flex items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-orange-500 hover:bg-slate-800 dark:hover:bg-orange-600 px-3.5 py-2.5 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
              >
                <QrCode className="w-4 h-4" />
                <span>{t('meters.scanBtn')}</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              {t('meters.typeLabel')}
            </label>
            <select
              value={meterType}
              onChange={(e) => setMeterType(e.target.value as MeterType)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
            >
              {METER_TYPES.map((mt) => (
                <option key={mt} value={mt}>
                  {tMeterType(mt)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Values */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              {t('meters.prevValue')}
            </label>
            <input
              type="number"
              step="0.01"
              value={previousValue}
              onChange={(e) => setPreviousValue(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 font-mono text-sm text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              {t('meters.currentValue')}
            </label>
            <input
              type="number"
              step="0.01"
              value={readingValue}
              onChange={(e) => setReadingValue(e.target.value)}
              placeholder="z. B. 25412.6"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 font-mono text-sm text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              {t('meters.consumption')}
            </p>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 px-3.5 py-2.5 font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums">
              {currentConsumption !== null ? currentConsumption : '—'}
            </div>
          </div>
        </div>

        {/* Mandatory Meter Display Photo */}
        <div className="pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
              {t('meters.photoRequired')}
            </span>
            <PhotoUploadButtons
              compact
              loading={uploadingPhoto}
              onSelectFile={handlePhotoUpload}
            />
          </div>
          {photo && (
            <img
              src={photo.dataUrl}
              alt={t('meters.photoTake')}
              referrerPolicy="no-referrer"
              className="mt-3 w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-700 object-cover max-h-52"
            />
          )}
        </div>

        {error && (
          <p className="text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>
        )}
        {savedMsg && (
          <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" /> {t('meters.savedMsg')}
          </p>
        )}

        <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-800">
          <button
            type="submit"
            className="flex items-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{t('meters.submitBtn')}</span>
          </button>
        </div>
      </form>

      {/* Readings Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Erfasste Zählerstände ({readings.length})
          </h2>
          {editError && (
            <p className="text-xs font-semibold text-red-600 dark:text-red-400">{editError}</p>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4 font-semibold">Objekt / Einheit</th>
                <th className="py-3 px-4 font-semibold">Zählernr. &amp; Art</th>
                <th className="py-3 px-4 font-semibold text-right">Vorwert</th>
                <th className="py-3 px-4 font-semibold text-right">Aktuell</th>
                <th className="py-3 px-4 font-semibold text-right">Verbrauch</th>
                <th className="py-3 px-4 font-semibold">Datum</th>
                <th className="py-3 px-4 font-semibold text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {readings.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-6 px-4 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400"
                  >
                    Keine Zählerstände vorhanden.
                  </td>
                </tr>
              ) : (
                readings.map((r) => {
                  const obj = objects.find((o) => o.id === r.object_id);
                  const isEditing = editingId === r.id;

                  const livePrev = parseFloat(editPreviousValue.replace(',', '.'));
                  const liveCurr = parseFloat(editReadingValue.replace(',', '.'));
                  const liveDiff =
                    isEditing && !Number.isNaN(livePrev) && !Number.isNaN(liveCurr)
                      ? Number((liveCurr - livePrev).toFixed(2))
                      : null;
                  const diff = isEditing
                    ? liveDiff
                    : Number((r.reading_value - r.previous_value).toFixed(2));

                  return (
                    <tr
                      key={r.id}
                      className={
                        isEditing
                          ? 'bg-orange-50/40 dark:bg-orange-950/15'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }
                    >
                      <td className="py-3 px-4 align-top">
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {obj?.name ?? '—'}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{r.apartment}</p>
                      </td>

                      <td className="py-3 px-4 align-top">
                        {isEditing ? (
                          <div className="space-y-1.5 min-w-[155px]">
                            <input
                              type="text"
                              value={editMeterNumber}
                              onChange={(e) => setEditMeterNumber(e.target.value)}
                              aria-label="Zählernummer"
                              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:text-white"
                            />
                            <select
                              value={editMeterType}
                              onChange={(e) => setEditMeterType(e.target.value as MeterType)}
                              aria-label="Zählerart"
                              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-xs text-slate-900 dark:text-white"
                            >
                              {METER_TYPES.map((mt) => (
                                <option key={mt} value={mt}>
                                  {mt}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <>
                            <p className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100">
                              {r.meter_number}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {r.meter_type}
                            </p>
                          </>
                        )}
                      </td>

                      <td className="py-3 px-4 align-top font-mono text-right tabular-nums text-slate-500">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.01"
                            value={editPreviousValue}
                            onChange={(e) => setEditPreviousValue(e.target.value)}
                            aria-label="Vorwert"
                            className="w-24 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-right font-mono text-xs text-slate-900 dark:text-white"
                          />
                        ) : (
                          r.previous_value
                        )}
                      </td>

                      <td className="py-3 px-4 align-top font-mono text-right font-bold tabular-nums text-slate-900 dark:text-white">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.01"
                            value={editReadingValue}
                            onChange={(e) => setEditReadingValue(e.target.value)}
                            aria-label="Aktueller Zählerstand"
                            className="w-24 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-right font-mono text-xs font-bold text-slate-900 dark:text-white"
                          />
                        ) : (
                          r.reading_value
                        )}
                      </td>

                      <td
                        className={`py-3 px-4 align-top font-mono text-right font-semibold tabular-nums whitespace-nowrap ${
                          diff !== null && diff < 0
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {diff === null ? '—' : diff >= 0 ? `+${diff}` : `${diff}`}
                      </td>

                      <td className="py-3 px-4 align-top font-mono text-xs tabular-nums text-slate-500 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="datetime-local"
                            value={editReadDate}
                            onChange={(e) => setEditReadDate(e.target.value)}
                            aria-label="Ablesedatum"
                            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:text-white"
                          />
                        ) : (
                          formatDateTimeDE(r.read_date)
                        )}
                      </td>

                      <td className="py-3 px-4 align-top text-right whitespace-nowrap">
                        {isEditing ? (
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={savingEdit}
                              onClick={() => void saveEditingRow()}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Speichern</span>
                            </button>
                            <button
                              type="button"
                              disabled={savingEdit}
                              onClick={cancelEditingRow}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-60 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Abbrechen</span>
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => startEditingRow(r)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>Bearbeiten</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(r)}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/60 px-2.5 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Löschen</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showScanner && (
        <QRBarcodeScannerModal
          title={t('meters.scannerTitle')}
          subtitle={t('meters.scannerSub')}
          quickPresets={[
            { code: '1EMH00884120', label: `${tMeterType('Strom')} · 1EMH00884120` },
            { code: 'KW-2026-441092', label: `${tMeterType('Kaltwasser')} · KW-2026-441092` },
            { code: 'GAS-2026-209114', label: `${tMeterType('Gas')} · GAS-2026-209114` },
            {
              code: 'WMZ-771204-M',
              label: `${tMeterType('Wärmemengenzähler')} · WMZ-771204-M`,
            },
          ]}
          onDetected={applyScannedCode}
          onClose={() => setShowScanner(false)}
        />
      )}

      <DoubleDeleteConfirmModal
        isOpen={deleteTarget !== null}
        detail={
          deleteTarget
            ? `${objects.find((o) => o.id === deleteTarget.object_id)?.name ?? '—'} · ${deleteTarget.meter_number} (${deleteTarget.meter_type}) · ${formatDateTimeDE(deleteTarget.read_date)}`
            : undefined
        }
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          const idToDelete = deleteTarget.id;
          await onDeleteReading(idToDelete);
          if (editingId === idToDelete) {
            setEditingId(null);
            setEditError(null);
          }
          setDeleteTarget(null);
        }}
      />
    </div>
  );
};
