import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileDown,
  MapPin,
  QrCode,
  Sparkles,
} from 'lucide-react';
import {
  ChecklistItem,
  CleaningLog,
  PropertyObject,
  TaskPhoto,
  User,
} from '../../types/facility';
import { formatDateTimeDE } from '../../utils/dateUtils';
import { exportCleaningReportPDF } from '../../utils/pdfExport';
import { createWatermarkedPhoto } from '../../utils/photoWatermark';
import { captureCurrentGPS } from '../../utils/weather';
import { QRBarcodeScannerModal } from '../QRBarcodeScannerModal';
import { PhotoUploadButtons } from '../PhotoUploadButtons';
import { useTranslation } from '../../i18n/LanguageContext';
import { useTaskTranslation } from '../../i18n/TaskTranslationContext';

interface ReinigungModuleProps {
  objects: PropertyObject[];
  users: User[];
  currentUser: User;
  logs: CleaningLog[];
  initialObjectId?: string;
  onCreateLog: (log: Omit<CleaningLog, 'id'>) => Promise<void>;
}

const DEFAULT_CLEANING_ITEMS = [
  'Treppenhaus fegen/wischen',
  'Handläufe desinfizieren',
  'Eingangstür Glas reinigen',
  'Aufzug',
  'Kellerflur',
];

export const ReinigungModule: React.FC<ReinigungModuleProps> = ({
  objects,
  users,
  currentUser,
  logs,
  initialObjectId,
  onCreateLog,
}) => {
  const { t, tCleaningItem, docLanguage } = useTranslation();
  const { translateText } = useTaskTranslation();
  const [objectId, setObjectId] = useState<string>(
    initialObjectId || objects[0]?.id || ''
  );
  const [showScanner, setShowScanner] = useState(false);

  // Active Check-In state
  const [checkedInQR, setCheckedInQR] = useState<string | null>(null);
  const [scanTimestamp, setScanTimestamp] = useState<string>('');
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(() =>
    DEFAULT_CLEANING_ITEMS.map((label, i) => ({
      id: `rc_${i}`,
      label,
      checked: false,
    }))
  );
  const [status, setStatus] = useState<'Erledigt' | 'Mängelmeldung'>('Erledigt');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<TaskPhoto | undefined>(undefined);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialObjectId) setObjectId(initialObjectId);
  }, [initialObjectId]);

  const selectedObject = objects.find((o) => o.id === objectId);

  const objectLogs = useMemo(
    () => logs.filter((l) => l.object_id === objectId),
    [logs, objectId]
  );

  const handleQRDetected = async (code: string) => {
    setShowScanner(false);
    setCheckedInQR(code);
    setScanTimestamp(new Date().toISOString());
    if (selectedObject) {
      const gps = await captureCurrentGPS(selectedObject.lat, selectedObject.lng);
      setGpsCoords({ lat: gps.lat, lng: gps.lng });
    }
    setChecklist(
      DEFAULT_CLEANING_ITEMS.map((label, i) => ({
        id: `rc_${Date.now()}_${i}`,
        label,
        checked: false,
      }))
    );
    setStatus('Erledigt');
    setNotes('');
    setPhoto(undefined);
    setError(null);
  };

  const handlePhotoUpload = async (file: File) => {
    if (!selectedObject) return;
    setError(null);
    setUploadingPhoto(true);
    try {
      const watermarked = await createWatermarkedPhoto(file, {
        objectName: selectedObject.name,
        fallbackLat: gpsCoords?.lat ?? selectedObject.lat,
        fallbackLng: gpsCoords?.lng ?? selectedObject.lng,
        caption: `Reinigung ${checkedInQR ?? ''}`,
        extraStamp: status === 'Mängelmeldung' ? 'MÄNGELMELDUNG' : 'Reinigung bestätigt',
      });
      setPhoto(watermarked);
    } catch {
      setError(t('clean.photoErr'));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSaveCleaningLog = async () => {
    if (!checkedInQR) return;
    if (!photo) {
      setError(t('clean.photoErr'));
      return;
    }
    setError(null);
    await onCreateLog({
      object_id: objectId,
      user_id: currentUser.id,
      scan_timestamp: scanTimestamp || new Date().toISOString(),
      qr_code_id: checkedInQR,
      lat: gpsCoords?.lat,
      lng: gpsCoords?.lng,
      checklist_json: checklist,
      photo,
      status,
      notes: notes.trim(),
    });
    setCheckedInQR(null);
    setPhoto(undefined);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-orange-500" />
            {t('clean.title')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {t('clean.subtitle')}
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            exportCleaningReportPDF({
              logs: objectLogs.length > 0 ? objectLogs : logs,
              obj: selectedObject,
              users,
              docLang: docLanguage,
            })
          }
          className="flex items-center gap-2 rounded-xl bg-slate-900 dark:bg-orange-500 hover:bg-slate-800 dark:hover:bg-orange-600 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white cursor-pointer min-h-[44px]"
        >
          <FileDown className="w-4 h-4" />
          <span>{t('clean.exportPdf')}</span>
        </button>
      </div>

      {/* Check-In & Checklist Card */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              {t('clean.selectObj')}
            </label>
            <select
              value={objectId}
              disabled={!!checkedInQR}
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

          {!checkedInQR ? (
            <button
              type="button"
              onClick={() => setShowScanner(true)}
              className="flex items-center justify-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 px-4 py-2.5 text-sm font-bold text-white cursor-pointer min-h-[46px]"
            >
              <QrCode className="w-4 h-4" />
              <span>{t('clean.scanBtn')}</span>
            </button>
          ) : (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-3.5 py-2 text-xs">
              <p className="font-bold text-emerald-700 dark:text-emerald-400">
                {t('clean.verified', { code: checkedInQR })}
              </p>
              <p className="font-mono text-[11px] text-emerald-600 dark:text-emerald-300 tabular-nums">
                {formatDateTimeDE(scanTimestamp)}
              </p>
            </div>
          )}
        </div>

        {checkedInQR && (
          <div className="space-y-5 pt-4 border-t border-slate-200 dark:border-slate-800">
            {gpsCoords && (
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-mono tabular-nums">
                <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                {t('clean.gpsConfirmed', {
                  lat: gpsCoords.lat.toFixed(5),
                  lng: gpsCoords.lng.toFixed(5),
                })}
              </p>
            )}

            {/* Cleaning Checklist */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
                {t('clean.checklistTitle')}
              </h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                {checklist.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center gap-3 px-3.5 py-3 min-h-[44px] bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() =>
                        setChecklist((prev) =>
                          prev.map((c) =>
                            c.id === item.id ? { ...c, checked: !c.checked } : c
                          )
                        )
                      }
                      className="h-4 w-4 rounded text-emerald-600 cursor-pointer"
                    />
                    <span className="text-sm text-slate-800 dark:text-slate-100">
                      {tCleaningItem(item.label)}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Status & Notes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('clean.qualityLabel')}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStatus('Erledigt')}
                    className={`flex-1 rounded-xl border py-2.5 text-xs font-bold cursor-pointer ${
                      status === 'Erledigt'
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {t('clean.statusOk')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus('Mängelmeldung')}
                    className={`flex-1 rounded-xl border py-2.5 text-xs font-bold cursor-pointer ${
                      status === 'Mängelmeldung'
                        ? 'border-red-600 bg-red-600 text-white'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {t('clean.statusDefect')}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('clean.notesLabel')}
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('clean.notesPlaceholder')}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Mandatory Photo */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  {t('clean.photoReq')}
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
                  alt={t('clean.photoTake')}
                  referrerPolicy="no-referrer"
                  className="mt-3 w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-700 object-cover max-h-52"
                />
              )}
            </div>

            {error && (
              <p className="text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setCheckedInQR(null)}
                className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveCleaningLog}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white cursor-pointer"
              >
                {t('clean.saveBtn')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Cleaning Logs History */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            {t('clean.historyTitle', { count: logs.length })}
          </h2>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {logs.map((log) => {
            const obj = objects.find((o) => o.id === log.object_id);
            const worker = users.find((u) => u.id === log.user_id);
            const checkedCount = log.checklist_json.filter((c) => c.checked).length;
            return (
              <div
                key={log.id}
                className="p-4 sm:px-5 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono tabular-nums">
                      {formatDateTimeDE(log.scan_timestamp)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                      {log.qr_code_id}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {obj?.name ?? t('common.object')}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {worker?.name ?? t('common.worker')} · {checkedCount}/
                    {log.checklist_json.length} {t('clean.checkpoints')}
                    {log.notes ? ` · ${translateText(log.notes)}` : ''}
                  </p>
                </div>

                {log.status === 'Erledigt' ? (
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> {t('common.done')}
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" /> {t('clean.defectBadge')}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {showScanner && (
        <QRBarcodeScannerModal
          title={t('clean.scannerTitle')}
          subtitle={t('clean.scannerSub')}
          quickPresets={[
            {
              code: `QR-${objectId.toUpperCase()}-EINGANG`,
              label: `Eingang · ${selectedObject?.name.slice(0, 18) ?? t('common.object')}`,
            },
            {
              code: `QR-${objectId.toUpperCase()}-TREPPENHAUS`,
              label: 'Treppenhaus EG–OG',
            },
            {
              code: `QR-${objectId.toUpperCase()}-KELLER`,
              label: 'Keller & Tiefgarage',
            },
          ]}
          onDetected={handleQRDetected}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
};
