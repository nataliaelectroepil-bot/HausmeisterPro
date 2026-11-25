import React, { useEffect, useState } from 'react';
import {
  Camera,
  Check,
  CheckCircle2,
  CloudSnow,
  FileDown,
  Loader2,
  MapPin,
  Play,
  Thermometer,
  X,
} from 'lucide-react';
import {
  PropertyObject,
  TaskPhoto,
  User,
  WinterActionType,
  WinterLog,
} from '../../types/facility';
import { formatDateTimeDE, formatTimeDE } from '../../utils/dateUtils';
import { formatPropertyOptionLabel, getWinterLogActions } from '../../utils/objectUtils';
import { exportWinterLogPDF } from '../../utils/pdfExport';
import { createWatermarkedPhoto } from '../../utils/photoWatermark';
import { captureCurrentGPS, fetchLocalWeather } from '../../utils/weather';
import { CompleteTaskModal } from '../CompleteTaskModal';
import { SignaturePad } from '../SignaturePad';
import { useTranslation } from '../../i18n/LanguageContext';
import { useTaskTranslation } from '../../i18n/TaskTranslationContext';

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
  const { t, tWinterAction, docLanguage, language } = useTranslation();
  const { translateText, ensureTextsTranslated } = useTaskTranslation();
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

  const [actionTypes, setActionTypes] = useState<WinterActionType[]>(['Salz gestreut']);
  const [saltKg, setSaltKg] = useState<string>('12');
  const [notes, setNotes] = useState<string>('');
  const [photo, setPhoto] = useState<TaskPhoto | undefined>(undefined);
  const [signature, setSignature] = useState<string | undefined>(undefined);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [photoModalError, setPhotoModalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialObjectId) setObjectId(initialObjectId);
  }, [initialObjectId]);

  const selectedObject = objects.find((o) => o.id === objectId);
  const isInspectionOnly =
    actionTypes.length === 1 && actionTypes[0] === 'Kontrollfahrt ohne Einsatz';

  const toggleAction = (act: WinterActionType) => {
    setValidationError(null);
    setActionTypes((prev) => {
      if (act === 'Kontrollfahrt ohne Einsatz') {
        return prev.includes(act) ? [] : ['Kontrollfahrt ohne Einsatz'];
      }
      const withoutControl = prev.filter((item) => item !== 'Kontrollfahrt ohne Einsatz');
      return withoutControl.includes(act)
        ? withoutControl.filter((item) => item !== act)
        : [...withoutControl, act];
    });
  };

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
      setActionTypes(['Salz gestreut']);
      setPhoto(undefined);
      setSignature(undefined);
      setNotes('');
      setSessionActive(true);
    } finally {
      setStarting(false);
    }
  };

  const handlePhotoUpload = async (file: File) => {
    if (!selectedObject) return;
    setValidationError(null);
    setPhotoModalError(null);
    setUploadingPhoto(true);
    try {
      const actionCaption = actionTypes.join(', ') || 'Winterdienst';
      const watermarked = await createWatermarkedPhoto(file, {
        objectName: selectedObject.name,
        fallbackLat: lat,
        fallbackLng: lng,
        caption: `Winterdienst Nachher-Foto (${actionCaption})`,
        extraStamp: `${tempCelsius.toFixed(1)} °C · ${weatherDesc}`,
      });
      setPhoto(watermarked);
      setShowPhotoModal(false);
    } catch {
      const errMsg = t('winter.photoErr');
      setPhotoModalError(errMsg);
      setValidationError(errMsg);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleCompleteLog = async (exportImmediately: boolean) => {
    if (actionTypes.length === 0) {
      setValidationError(t('winter.actionErr'));
      return;
    }
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
        action_type: actionTypes.join(', '),
        action_types: actionTypes,
        salt_kg: isInspectionOnly ? 0 : Number(saltKg) || 0,
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
                  {formatPropertyOptionLabel(o)}
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

            {/* Action Selection (Multi-Select) & Material */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {t('winter.actionLabel')}
                  </label>
                  <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                    {t('winter.multiSelectHint')}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ACTIONS.map((act) => {
                    const active = actionTypes.includes(act);
                    return (
                      <button
                        key={act}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleAction(act)}
                        className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold text-left transition-colors cursor-pointer min-h-[44px] ${
                          active
                            ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <span>{tWinterAction(act)}</span>
                        {active && <Check className="w-4 h-4 shrink-0" />}
                      </button>
                    );
                  })}
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
                  disabled={isInspectionOnly || actionTypes.length === 0}
                  value={isInspectionOnly ? '0' : saltKg}
                  onChange={(e) => setSaltKg(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 font-mono text-sm text-slate-900 dark:text-white disabled:opacity-50"
                />
              </div>
            </div>

            {/* Mandatory Nachher-Foto (Unified Button -> Kamera / Galerie Modal) */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    {t('winter.photoRequiredTitle', { temp: tempCelsius.toFixed(1) })}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={uploadingPhoto}
                  onClick={() => {
                    setPhotoModalError(null);
                    setShowPhotoModal(true);
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 disabled:opacity-60 px-3.5 py-2 text-xs font-semibold text-white transition-colors cursor-pointer min-h-[40px] whitespace-nowrap"
                >
                  {uploadingPhoto ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  ) : (
                    <Camera className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>
                    {uploadingPhoto
                      ? t('common.photoSending')
                      : photo
                        ? t('winter.photoReplace')
                        : t('winter.photoAdd')}
                  </span>
                </button>
              </div>

              {photo && (
                <div className="relative inline-block w-full max-w-md">
                  <img
                    src={photo.dataUrl}
                    alt={t('winter.photoTake')}
                    referrerPolicy="no-referrer"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 object-cover max-h-64"
                  />
                  <button
                    type="button"
                    onClick={() => setPhoto(undefined)}
                    aria-label={t('common.close')}
                    className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-lg bg-slate-950/75 text-white hover:bg-red-600 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
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
                    {obj?.name ?? t('common.object')} —{' '}
                    {getWinterLogActions(log)
                      .map((act) => tWinterAction(act))
                      .join(', ')}
                    {log.salt_kg > 0 ? ` (${log.salt_kg} kg)` : ''}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {worker?.name ?? t('common.worker')}
                    {log.notes ? ` · ${translateText(log.notes)}` : ''}
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
                    onClick={async () => {
                      let nextLog = log;
                      if (log.notes?.trim()) {
                        const map = await ensureTextsTranslated([log.notes], language);
                        nextLog = { ...log, notes: map[log.notes.trim()] ?? log.notes };
                      }
                      exportWinterLogPDF({ log: nextLog, obj, worker, docLang: docLanguage });
                    }}
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

      {/* Photo Source Choice Modal (Camera vs Gallery) */}
      {showPhotoModal && (
        <CompleteTaskModal
          title={t('winter.photoAdd')}
          hint={t('winter.photoModalHint')}
          taskTitle={selectedObject?.name ?? t('winter.title')}
          subtitle={
            actionTypes.length > 0
              ? actionTypes.map((a) => tWinterAction(a)).join(', ')
              : undefined
          }
          allowWithoutPhoto={false}
          loading={uploadingPhoto}
          error={photoModalError}
          onSelectPhoto={handlePhotoUpload}
          onClose={() => {
            if (uploadingPhoto) return;
            setPhotoModalError(null);
            setShowPhotoModal(false);
          }}
        />
      )}
    </div>
  );
};
