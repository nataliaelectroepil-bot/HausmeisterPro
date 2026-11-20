import React, { useEffect, useMemo, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  FileDown,
  Save,
  Sprout,
} from 'lucide-react';
import {
  GardenLog,
  GardenMaterials,
  PropertyObject,
  TaskPhoto,
  User,
} from '../../types/facility';
import { formatDateDE, getTodayISODate } from '../../utils/dateUtils';
import { exportGardenBillingPDF } from '../../utils/pdfExport';
import { createWatermarkedPhoto } from '../../utils/photoWatermark';
import { useTranslation } from '../../i18n/LanguageContext';

interface GartenModuleProps {
  objects: PropertyObject[];
  users: User[];
  currentUser: User;
  logs: GardenLog[];
  initialObjectId?: string;
  onCreateLog: (log: Omit<GardenLog, 'id'>) => Promise<void>;
}

const GARDEN_TASKS = [
  'Rasen mähen',
  'Hecke schneiden',
  'Unkraut entfernen',
  'Laub beseitigen',
  'Grünschnitt abtransportiert',
];

export const GartenModule: React.FC<GartenModuleProps> = ({
  objects,
  users,
  currentUser,
  logs,
  initialObjectId,
  onCreateLog,
}) => {
  const { t, tGardenTask, docLanguage } = useTranslation();
  const [objectId, setObjectId] = useState<string>(
    initialObjectId || objects[0]?.id || ''
  );
  const [date, setDate] = useState<string>(getTodayISODate());
  const [durationMinutes, setDurationMinutes] = useState<string>('90');
  const [selectedTasks, setSelectedTasks] = useState<string[]>(['Rasen mähen']);
  const [materials, setMaterials] = useState<GardenMaterials>({
    duenger_kg: 0,
    rasensamen_kg: 0,
    rindenmulch_saecke: 0,
  });
  const [wasteVolume, setWasteVolume] = useState<string>('0.5');
  const [notes, setNotes] = useState('');
  const [beforePhoto, setBeforePhoto] = useState<TaskPhoto | undefined>(undefined);
  const [afterPhoto, setAfterPhoto] = useState<TaskPhoto | undefined>(undefined);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    if (initialObjectId) setObjectId(initialObjectId);
  }, [initialObjectId]);

  const selectedObject = objects.find((o) => o.id === objectId);

  const objectLogs = useMemo(
    () => logs.filter((l) => l.object_id === objectId),
    [logs, objectId]
  );

  const toggleTask = (taskLabel: string) => {
    setSelectedTasks((prev) =>
      prev.includes(taskLabel)
        ? prev.filter((t) => t !== taskLabel)
        : [...prev, taskLabel]
    );
  };

  const handlePhotoUpload = async (
    kind: 'before' | 'after',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !selectedObject) return;
    const watermarked = await createWatermarkedPhoto(file, {
      objectName: selectedObject.name,
      fallbackLat: selectedObject.lat,
      fallbackLng: selectedObject.lng,
      caption: kind === 'before' ? 'Gartenpflege Vorher' : 'Gartenpflege Nachher',
      extraStamp: kind === 'before' ? 'VORHER' : 'NACHHER',
    });
    if (kind === 'before') setBeforePhoto(watermarked);
    else setAfterPhoto(watermarked);
    e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onCreateLog({
      object_id: objectId,
      user_id: currentUser.id,
      date,
      tasks_json: selectedTasks,
      materials_json: materials,
      waste_volume: parseFloat(wasteVolume.replace(',', '.')) || 0,
      duration_minutes: parseInt(durationMinutes, 10) || 60,
      photos: {
        before: beforePhoto,
        after: afterPhoto,
      },
      notes: notes.trim(),
    });
    setNotes('');
    setBeforePhoto(undefined);
    setAfterPhoto(undefined);
    setMaterials({ duenger_kg: 0, rasensamen_kg: 0, rindenmulch_saecke: 0 });
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 2500);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Sprout className="w-6 h-6 text-emerald-500" />
            {t('garden.title')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {t('garden.subtitle')}
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            exportGardenBillingPDF({
              logs: objectLogs.length > 0 ? objectLogs : logs,
              obj: selectedObject,
              users,
              docLang: docLanguage,
            })
          }
          className="flex items-center gap-2 rounded-xl bg-slate-900 dark:bg-orange-500 hover:bg-slate-800 dark:hover:bg-orange-600 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white cursor-pointer min-h-[44px]"
        >
          <FileDown className="w-4 h-4" />
          <span>{t('garden.exportPdf')}</span>
        </button>
      </div>

      {/* Entry Form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              {t('common.object')}
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
              {t('garden.dateLabel')}
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 font-mono text-sm text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              {t('garden.durationLabel')}
            </label>
            <input
              type="number"
              min="15"
              step="5"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 font-mono text-sm text-slate-900 dark:text-white"
            />
          </div>
        </div>

        {/* Task Checkboxes */}
        <div>
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
            {t('garden.tasksLabel')}
          </p>
          <div className="flex flex-wrap gap-2">
            {GARDEN_TASKS.map((taskLabel) => {
              const active = selectedTasks.includes(taskLabel);
              return (
                <button
                  key={taskLabel}
                  type="button"
                  onClick={() => toggleTask(taskLabel)}
                  className={`rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer min-h-[40px] ${
                    active
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {tGardenTask(taskLabel)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Billable Material & Disposal Tracker */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-4 space-y-3">
          <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
            {t('garden.materialsTitle')}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                {t('garden.fertilizer')}
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={materials.duenger_kg}
                onChange={(e) =>
                  setMaterials((m) => ({
                    ...m,
                    duenger_kg: parseFloat(e.target.value) || 0,
                  }))
                }
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                {t('garden.grassSeed')}
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={materials.rasensamen_kg}
                onChange={(e) =>
                  setMaterials((m) => ({
                    ...m,
                    rasensamen_kg: parseFloat(e.target.value) || 0,
                  }))
                }
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                {t('garden.mulch')}
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={materials.rindenmulch_saecke}
                onChange={(e) =>
                  setMaterials((m) => ({
                    ...m,
                    rindenmulch_saecke: parseInt(e.target.value, 10) || 0,
                  }))
                }
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                {t('garden.greenWaste')}
              </label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={wasteVolume}
                onChange={(e) => setWasteVolume(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono text-sm"
              />
            </div>
          </div>
        </div>

        {/* Before / After Photos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                {t('garden.beforePhoto')}
              </span>
              <label className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                <Camera className="w-3.5 h-3.5 text-orange-500" />
                <span>{t('garden.capture')}</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handlePhotoUpload('before', e)}
                />
              </label>
            </div>
            {beforePhoto && (
              <img
                src={beforePhoto.dataUrl}
                alt={t('garden.beforePhoto')}
                referrerPolicy="no-referrer"
                className="w-full h-36 object-cover rounded-lg"
              />
            )}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                {t('garden.afterPhoto')}
              </span>
              <label className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                <Camera className="w-3.5 h-3.5 text-emerald-500" />
                <span>{t('garden.capture')}</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handlePhotoUpload('after', e)}
                />
              </label>
            </div>
            {afterPhoto && (
              <img
                src={afterPhoto.dataUrl}
                alt={t('garden.afterPhoto')}
                referrerPolicy="no-referrer"
                className="w-full h-36 object-cover rounded-lg"
              />
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
            {t('garden.notesLabel')}
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('garden.notesPlaceholder')}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
          />
        </div>

        {savedNotice && (
          <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" /> {t('garden.savedMsg')}
          </p>
        )}

        <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-800">
          <button
            type="submit"
            className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{t('garden.saveBtn')}</span>
          </button>
        </div>
      </form>

      {/* Garden History */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            {t('garden.historyTitle', { count: logs.length })}
          </h2>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {logs.map((log) => {
            const obj = objects.find((o) => o.id === log.object_id);
            const worker = users.find((u) => u.id === log.user_id);
            return (
              <div
                key={log.id}
                className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div>
                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                    {formatDateDE(log.date)} · {log.duration_minutes} {t('common.min')} ·{' '}
                    {worker?.name ?? t('common.worker')}
                  </p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {obj?.name ?? t('common.object')} —{' '}
                    {log.tasks_json.map(tGardenTask).join(', ')}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('garden.materialSummary', {
                      d: log.materials_json.duenger_kg,
                      s: log.materials_json.rasensamen_kg,
                      m: log.materials_json.rindenmulch_saecke,
                      w: log.waste_volume,
                    })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
