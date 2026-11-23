import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  FileText,
  ImagePlus,
  MapPin,
  PenTool,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import {
  FacilityTask,
  PropertyObject,
  TaskPhoto,
  TaskStatus,
  User,
} from '../types/facility';
import { formatDateTimeDE, isTaskOverdue } from '../utils/dateUtils';
import { createWatermarkedPhoto } from '../utils/photoWatermark';
import { BIN_VISUAL_META } from '../utils/binMeta';
import { exportTaskProtocolPDF } from '../utils/pdfExport';

interface TaskDetailModalProps {
  task: FacilityTask;
  objectItem?: PropertyObject;
  assignee?: User;
  onClose: () => void;
  onUpdateTask: (taskId: string, patch: Partial<FacilityTask>) => Promise<void>;
}

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  task,
  objectItem,
  assignee,
  onClose,
  onUpdateTask,
}) => {
  const { t, tCategory, tStatus, tBin, docLanguage } = useTranslation();
  const [notes, setNotes] = useState(task.notes);
  const [newCheckItem, setNewCheckItem] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<TaskPhoto | null>(null);

  // Signature pad refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const [hasDrawnSignature, setHasDrawnSignature] = useState(false);

  useEffect(() => {
    setNotes(task.notes);
  }, [task.id, task.notes]);

  const overdue = isTaskOverdue(task.due_date, task.status);
  const completedChecks = task.checklist_json.filter((c) => c.checked).length;

  const handleToggleChecklist = async (itemId: string) => {
    const updated = task.checklist_json.map((c) =>
      c.id === itemId ? { ...c, checked: !c.checked } : c
    );
    await onUpdateTask(task.id, { checklist_json: updated });
  };

  const handleAddChecklistItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = newCheckItem.trim();
    if (!label) return;
    const updated = [
      ...task.checklist_json,
      { id: `chk_${Date.now()}`, label, checked: false },
    ];
    setNewCheckItem('');
    await onUpdateTask(task.id, { checklist_json: updated });
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    await onUpdateTask(task.id, { notes });
    setSavingNotes(false);
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 2000);
  };

  const handleStatusChange = async (status: TaskStatus) => {
    setUpdatingStatus(true);
    try {
      await onUpdateTask(task.id, {
        status,
        completed_at: status === 'erledigt' ? new Date().toISOString() : undefined,
      });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handlePhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    markCompleted = false
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const watermarked = await createWatermarkedPhoto(file, {
        objectName: objectItem?.name ?? t('common.object'),
        fallbackLat: objectItem?.lat,
        fallbackLng: objectItem?.lng,
        caption: task.title,
      });
      const nextPhotos = [...task.photos, watermarked];
      await onUpdateTask(task.id, {
        photos: nextPhotos,
        notes,
        ...(markCompleted
          ? { status: 'erledigt', completed_at: new Date().toISOString() }
          : {}),
      });
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleRemovePhoto = async (photoId: string) => {
    const nextPhotos = task.photos.filter((p) => p.id !== photoId);
    await onUpdateTask(task.id, { photos: nextPhotos });
  };

  // Signature drawing handlers
  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pt = getCanvasPoint(e);
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    isDrawingRef.current = true;
    setHasDrawnSignature(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const pt = getCanvasPoint(e);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
  };

  const handlePointerUp = () => {
    isDrawingRef.current = false;
  };

  const clearSignaturePad = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasDrawnSignature(false);
  };

  const saveSignature = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawnSignature) return;
    const dataUrl = canvas.toDataURL('image/png');
    await onUpdateTask(task.id, { signature: dataUrl });
  };

  const clearSavedSignature = async () => {
    clearSignaturePad();
    await onUpdateTask(task.id, { signature: undefined });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/75 backdrop-blur-sm sm:p-4">
      <div className="w-full sm:max-w-2xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-orange-600 dark:text-orange-400">
                {tCategory(task.category)}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {t('common.due')}: {formatDateTimeDE(task.due_date)}
              </span>
              {overdue && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-red-600 dark:text-red-400">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {t('common.overdue')}
                  </span>
                </>
              )}
            </div>
            <h2 className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-white leading-snug">
              {task.title}
            </h2>
            {task.bin_types && task.bin_types.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {task.bin_types.map((bin) => {
                  const meta = BIN_VISUAL_META[bin];
                  return (
                    <span
                      key={bin}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold ${meta.badgeClass}`}
                    >
                      <span className={`h-2 w-2 rounded-full ${meta.dotClass} ring-1 ring-white/50`} />
                      <span>{tBin(bin)}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Object & Assignee info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3.5 text-sm">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t('taskModal.objectAddress')}
              </p>
              <p className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                {objectItem?.name ?? (task.address || t('taskModal.unknownObject'))}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                <span>{objectItem?.address ?? task.address ?? '—'}</span>
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t('taskModal.assigneeStatus')}
              </p>
              <p className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                {assignee ? `${assignee.name} (${assignee.employee_id})` : t('common.unassigned')}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {(['offen', 'in_bearbeitung', 'erledigt'] as TaskStatus[]).map((st) => {
                  const active = task.status === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      disabled={updatingStatus}
                      onClick={() => handleStatusChange(st)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 ${
                        active
                          ? st === 'erledigt'
                            ? 'bg-emerald-600 text-white'
                            : st === 'in_bearbeitung'
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-red-600 text-white'
                          : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {tStatus(st)}
                    </button>
                  );
                })}
              </div>
              {(task.status === 'erledigt' || task.completed_at) && (
                <div className="mt-2.5 pt-2 border-t border-slate-200/80 dark:border-slate-700/80 text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5 font-mono">
                  {task.completed_at && (
                    <p>
                      <span className="font-sans font-semibold text-emerald-700 dark:text-emerald-400">
                        {t('taskModal.completedAtLabel')}:
                      </span>{' '}
                      {formatDateTimeDE(task.completed_at)}
                    </p>
                  )}
                  <p>
                    <span className="font-sans font-semibold text-slate-600 dark:text-slate-300">
                      {t('taskModal.completedGpsLabel')}:
                    </span>{' '}
                    {typeof task.completed_lat === 'number' && typeof task.completed_lng === 'number'
                      ? `${task.completed_lat.toFixed(6)}, ${task.completed_lng.toFixed(6)}${
                          typeof task.completed_accuracy === 'number'
                            ? ` (± ${Math.round(task.completed_accuracy)} m)`
                            : ''
                        }`
                      : t('taskModal.gpsUnavailable')}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          {task.description && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                {t('taskModal.description')}
              </h3>
              <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                {task.description}
              </p>
            </div>
          )}

          {/* Interactive Checklist */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {t('taskModal.checklist', { category: tCategory(task.category) })}
              </h3>
              <span className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                {t('taskModal.checklistProgress', {
                  done: completedChecks,
                  total: task.checklist_json.length,
                })}
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              {task.checklist_json.map((item) => (
                <label
                  key={item.id}
                  className="flex items-center gap-3 px-3.5 py-3 min-h-[44px] bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => handleToggleChecklist(item.id)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span
                    className={`text-sm ${
                      item.checked
                        ? 'line-through text-slate-400 dark:text-slate-500'
                        : 'text-slate-800 dark:text-slate-100'
                    }`}
                  >
                    {item.label}
                  </span>
                </label>
              ))}
            </div>

            <form onSubmit={handleAddChecklistItem} className="mt-2.5 flex gap-2">
              <input
                type="text"
                value={newCheckItem}
                onChange={(e) => setNewCheckItem(e.target.value)}
                placeholder={t('taskModal.addCheckItem')}
                className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-orange-500 focus:outline-none"
              />
              <button
                type="submit"
                className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('common.add')}
              </button>
            </form>
          </div>

          {/* Berichtnotizen */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="task-notes"
                className="text-sm font-bold text-slate-900 dark:text-white"
              >
                {t('taskModal.reportNotes')}
              </label>
              {savedNotice && (
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  {t('common.saved')}
                </span>
              )}
            </div>
            <textarea
              id="task-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('taskModal.notesPlaceholder')}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-sm text-slate-900 dark:text-white focus:border-orange-500 focus:outline-none"
            />
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={handleSaveNotes}
                disabled={savingNotes}
                className="flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-white transition-colors cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                {savingNotes ? t('common.saving') : t('taskModal.saveNote')}
              </button>
            </div>
          </div>

          {/* Photo Documentation with GPS & Timestamp Watermark */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('taskModal.photosTitle', { count: task.photos.length })}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('taskModal.photosHint')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer min-h-[40px]">
                  <Camera className="w-3.5 h-3.5 text-orange-500" />
                  <span>{t('common.camera')}</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => handlePhotoUpload(e, false)}
                  />
                </label>
                <label className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer min-h-[40px]">
                  <ImagePlus className="w-3.5 h-3.5 text-slate-500" />
                  <span>{t('common.gallery')}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handlePhotoUpload(e, false)}
                  />
                </label>
              </div>
            </div>

            {uploadingPhoto && (
              <p className="text-xs text-orange-600 dark:text-orange-400 font-medium mb-2">
                {t('taskModal.uploadingPhoto')}
              </p>
            )}

            {task.photos.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                {t('taskModal.noPhotos')}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {task.photos.map((photo) => (
                  <div
                    key={photo.id}
                    className="group relative rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-100 dark:bg-slate-800"
                  >
                    <button
                      type="button"
                      onClick={() => setPreviewPhoto(photo)}
                      className="block w-full aspect-[4/3] cursor-pointer"
                    >
                      <img
                        src={photo.dataUrl}
                        alt={formatDateTimeDE(photo.timestamp)}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(photo.id)}
                      aria-label={t('common.delete')}
                      className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-slate-950/75 text-white hover:bg-red-600 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Digital Signature Pad */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <PenTool className="w-4 h-4 text-slate-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('taskModal.signatureTitle')}
                </h3>
              </div>
              {task.signature && (
                <button
                  type="button"
                  onClick={clearSavedSignature}
                  className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                >
                  {t('taskModal.resetSignature')}
                </button>
              )}
            </div>

            {task.signature ? (
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 flex items-center justify-between gap-4">
                <img
                  src={task.signature}
                  alt={t('taskModal.signed')}
                  className="h-16 bg-white rounded-lg border border-slate-200 p-1 object-contain"
                />
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  {t('taskModal.signed')}
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white overflow-hidden">
                  <canvas
                    ref={canvasRef}
                    width={600}
                    height={150}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                    className="w-full h-32 touch-none cursor-crosshair block"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {t('taskModal.signHint')}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={clearSignaturePad}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      {t('common.delete')}
                    </button>
                    <button
                      type="button"
                      onClick={saveSignature}
                      disabled={!hasDrawnSignature}
                      className="rounded-lg bg-slate-900 dark:bg-orange-500 disabled:opacity-40 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-orange-600 cursor-pointer"
                    >
                      {t('taskModal.saveSignature')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sticky Footer CTA */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            {t('common.close')}
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                exportTaskProtocolPDF({
                  task,
                  obj: objectItem,
                  worker: assignee,
                  docLang: docLanguage,
                })
              }
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                task.status === 'erledigt'
                  ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-sm'
                  : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>{t('tasks.pdfProtocol')}</span>
            </button>

            {task.status !== 'erledigt' && (
              <label className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white cursor-pointer transition-colors">
                <Camera className="w-4 h-4" />
                <span>{t('common.photoCompleteBtn')}</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handlePhotoUpload(e, true)}
                />
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Photo Lightbox */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setPreviewPhoto(null)}
        >
          <div className="relative max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="absolute -top-10 right-0 flex items-center gap-1 text-xs font-semibold text-white hover:text-orange-400 cursor-pointer"
            >
              <X className="w-4 h-4" /> {t('common.close')}
            </button>
            <img
              src={previewPhoto.dataUrl}
              alt={formatDateTimeDE(previewPhoto.timestamp)}
              referrerPolicy="no-referrer"
              className="w-full max-h-[82vh] object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
