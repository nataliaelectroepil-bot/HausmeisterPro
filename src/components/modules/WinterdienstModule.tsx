import React, { useEffect, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  CloudSnow,
  FileDown,
  Loader2,
  MapPin,
  Play,
  Thermometer,
} from 'lucide-react';
import {
  PropertyObject,
  TaskPhoto,
  User,
  WinterActionType,
  WinterLog,
} from '../../types/facility';
import { formatDateTimeDE, formatTimeDE } from '../../utils/dateUtils';
import { exportWinterLogPDF } from '../../utils/pdfExport';
import { createWatermarkedPhoto } from '../../utils/photoWatermark';
import { captureCurrentGPS, fetchLocalWeather } from '../../utils/weather';
import { SignaturePad } from '../SignaturePad';
import { useTranslation } from '../../i18n/LanguageContext';

interface WinterdienstModuleProps {
  objects: PropertyObject[];
  users: User[];
  currentUser: User;
  logs: WinterLog[];
  initialObjectId?: string;
  onCreateLog: (log: Omit<WinterLog, 'id'>) => Promise<void>;
}

const ACTIONS: WinterActionType[] = [
  'Schnee geräumt',
  'Salz gestreut',
  'Splitt gestreut',
  'Kontrollfahrt ohne Einsatz',
];

export const WinterdienstModule: React.FC<WinterdienstModuleProps> = ({
  objects,
  users,
  currentUser,
  logs,
  initialObjectId,
  onCreateLog,
}) => {
  const { t, tWinterAction, docLanguage } = useTranslation();
  const [objectId, setObjectId] = useState<string>(
    initialObjectId || objects[0]?.id || ''
  );
  const [sessionActive, setSessionActive] = useState(false);
  const [starting, setStarting] = useState(false);

  const [startTime, setStartTime] = useState<string>('');
  const [lat, setLat] = useState<number>(48.1351);
  const [lng, setLng] = useState<number>(11.582);
  const [tempCelsius, setTempCelsius] = useState<number>(-1.5);
  const [weatherDesc, setWeatherDesc] = useState<string>('Bedeckt');
  const [weatherSource, setWeatherSource] = useState<'open-meteo' | 'fallback'>('open-meteo');

  const [actionType, setActionType] = useState<WinterActionType>('Salz gestreut');
  const [saltKg, setSaltKg] = useState<string>('12');
  const [notes, setNotes] = useState<string>('');
  const [photo, setPhoto] = useState<TaskPhoto | undefined>(undefined);
  const [signature, setSignature] = useState<string | undefined>(undefined);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialObjectId) setObjectId(initialObjectId);
  }, [initialObjectId]);

  const selectedObject = objects.find((o) => o.id === objectId);

  const handleStartSession = async () => {
    if (!selectedObject) return;
    setStarting(true);
    setValidationError(null);
    try {
      const gps = await captureCurrentGPS(selectedObject.lat, selectedObject.lng);
      const weather = await fetchLocalWeather(gps.lat, gps.lng);

      setLat(gps.lat);
      setLng(gps.lng);
      setTempCelsius(weather.tempCelsius);
      setWeatherDesc(weather.weatherDesc);
      setWeatherSource(weather.source);
      setStartTime(new Date().toISOString());
      setPhoto(undefined);
      setSignature(undefined);
      setNotes('');
      setSessionActive(true);
    } finally {
      setStarting(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedObject) return;
    setValidationError(null);
    const watermarked = await createWatermarkedPhoto(file, {
      objectName: selectedObject.name,
      fallbackLat: lat,
      fallbackLng: lng,
      caption: `Winterdienst Nachher-Foto (${actionType})`,
      extraStamp: `${tempCelsius.toFixed(1)} °C · ${weatherDesc}`,
    });
    setPhoto(watermarked);
    e.target.value = '';
  };

  const handleCompleteLog = async (exportImmediately: boolean) => {
    if (!photo) {
      setValidationError(t('winter.photoErr'));
      return;
    }
    setSaving(true);
    setValidationError(null);
    try {
      const endTime = new Date().toISOString();
      const payload: Omit<WinterLog, 'id'> = {
        object_id: objectId,
        user_id: currentUser.id,
        start_time: startTime || endTime,
        end_time: endTime,
        lat,
        lng,
        temp_celsius: tempCelsius,
        weather_desc: weatherDesc,
        action_type: actionType,
        salt_kg: actionType === 'Kontrollfahrt ohne Einsatz' ? 0 : Number(saltKg) || 0,
        photo,
        signature,
        notes: notes.trim(),
      };
      await onCreateLog(payload);
      if (exportImmediately) {
        exportWinterLogPDF({
          log: { ...payload, id: `wl_${Date.now()}` },
          obj: selectedObject,
          worker: currentUser,
          docLang: docLanguage,
        });
      }
      setSessionActive(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <CloudSnow className="w-6 h-6 text-orange-500" />
          {t('winter.title')}
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          {t('winter.subtitle')}
        </p>
      </div>

      {/* Active Workflow Card */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              {t('winter.selectObject')}
            </label>
            <select
              value={objectId}
              disabled={sessionActive}
              onChange={(e) => setObjectId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white disabled:opacity-60"
            >
              {objects.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} — {o.address}
                </option>
              ))}
            </select>
          </div>

          {!sessionActive ? (
            <button
              type="button"
              onClick={handleStartSession}
              disabled={starting || !selectedObject}
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition-colors cursor-pointer min-h-[46px]"
            >
              {starting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
              <span>{t('winter.startBtn')}</span>
            </button>
          ) : (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-3.5 py-2.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              {t('winter.activeSince', { time: formatTimeDE(startTime) })}
            </div>
          )}
        </div>

        {sessionActive && (
          <div className="space-y-5 pt-4 border-t border-slate-200 dark:border-slate-800">
            {/* Captured GPS + Weather Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3.5">
              <div>
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-orange-500" /> {t('winter.gpsPos')}
                </p>
                <p className="mt-0.5 font-mono text-xs font-bold text-slate-900 dark:text-white tabular-nums">
                  {lat.toFixed(5)}, {lng.toFixed(5)}
                </p>
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Thermometer className="w-3.5 h-3.5 text-orange-500" />
                  {t('winter.tempLabel')}{' '}
                  {weatherSource === 'open-meteo'
                    ? t('winter.liveWeather')
                    : t('winter.manualWeather')}
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={tempCelsius}
                  onChange={(e) => setTempCelsius(parseFloat(e.target.value) || 0)}
                  className="mt-0.5 w-28 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-mono text-xs font-bold text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {t('winter.weatherCond')}
                </label>
                <input
                  type="text"
                  value={weatherDesc}
                  onChange={(e) => setWeatherDesc(e.target.value)}
                  className="mt-0.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-semibold text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Action Selection & Material */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('winter.actionLabel')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ACTIONS.map((act) => (
                    <button
                      key={act}
                      type="button"
                      onClick={() => setActionType(act)}
                      className={`rounded-xl border px-3 py-2.5 text-xs font-semibold text-left transition-colors cursor-pointer min-h-[44px] ${
                        actionType === act
                          ? 'border-orange-500 bg-orange-500 text-white'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {tWinterAction(act)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('winter.saltLabel')}
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  disabled={actionType === 'Kontrollfahrt ohne Einsatz'}
                  value={actionType === 'Kontrollfahrt ohne Einsatz' ? '0' : saltKg}
                  onChange={(e) => setSaltKg(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 font-mono text-sm text-slate-900 dark:text-white disabled:opacity-50"
                />
              </div>
            </div>

            {/* Mandatory Nachher-Foto */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    {t('winter.photoRequiredTitle', { temp: tempCelsius.toFixed(1) })}
                  </p>
                </div>
                <label className="flex items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-white cursor-pointer min-h-[40px]">
                  <Camera className="w-4 h-4 text-orange-400" />
                  <span>{photo ? t('winter.photoReplace') : t('winter.photoTake')}</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handlePhotoUpload}
                  />
                </label>
              </div>

              {photo && (
                <img
                  src={photo.dataUrl}
                  alt={t('winter.photoTake')}
                  referrerPolicy="no-referrer"
                  className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 object-cover max-h-64"
                />
              )}
            </div>

            {/* Notes & Signature */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('winter.notesLabel')}
                </label>
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('winter.notesPlaceholder')}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <SignaturePad
                label={t('winter.sigLabel')}
                value={signature}
                onChange={setSignature}
              />
            </div>

            {validationError && (
              <p className="text-xs font-semibold text-red-600 dark:text-red-400">
                {validationError}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSessionActive(false)}
                className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleCompleteLog(false)}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white cursor-pointer"
              >
                {t('winter.saveLog')}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleCompleteLog(true)}
                className="flex items-center gap-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white cursor-pointer"
              >
                <FileDown className="w-4 h-4" />
                {t('winter.saveAndPdf')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Historical Winterdienst Logs */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            {t('winter.historyTitle', { count: logs.length })}
          </h2>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {logs.map((log) => {
            const obj = objects.find((o) => o.id === log.object_id);
            const worker = users.find((u) => u.id === log.user_id);
            return (
              <div
                key={log.id}
                className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                      {formatDateTimeDE(log.start_time)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums text-orange-600 dark:text-orange-400 font-semibold">
                      {log.temp_celsius.toFixed(1)} °C
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{log.weather_desc}</span>
                  </div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {obj?.name ?? t('common.object')} — {tWinterAction(log.action_type)}
                    {log.salt_kg > 0 ? ` (${log.salt_kg} kg)` : ''}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {worker?.name ?? t('common.worker')}
                    {log.notes ? ` · ${log.notes}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {log.photo && (
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {t('winter.photoTag')}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      exportWinterLogPDF({ log, obj, worker, docLang: docLanguage })
                    }
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-orange-500 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer"
                  >
                    <FileDown className="w-3.5 h-3.5 text-orange-500" />
                    <span>{t('winter.pdfBtn')}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
