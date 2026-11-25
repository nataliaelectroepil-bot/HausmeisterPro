import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  FileText,
  Loader2,
  Lock,
  MapPin,
  PenTool,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { useTaskTranslation } from '../i18n/TaskTranslationContext';
import {
  ChecklistItem,
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
import { ConfirmDialog } from './ConfirmDialog';
import { PhotoUploadButtons } from './PhotoUploadButtons';

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
  const { t, tCategory, tStatus, tBin, docLanguage, language } = useTranslation();
  const { getTaskTitle, getTaskDescription, ensureTaskTranslated } = useTaskTranslation();
  const [draftStatus, setDraftStatus] = useState<TaskStatus>(task.status);
  const [draftChecklist, setDraftChecklist] = useState<ChecklistItem[]>(() =>
    task.checklist_json.map((c) => ({ ...c }))
  );
  const [draftNotes, setDraftNotes] = useState(task.notes);
  const [draftPhotos, setDraftPhotos] = useState<TaskPhoto[]>(() => [...task.photos]);
  const [draftSignature, setDraftSignature] = useState<string | undefined>(() => task.signature);
  const [isEditing, setIsEditing] = useState(false);
  const [newCheckItem, setNewCheckItem] = useState('');
  const [savingChanges, setSavingChanges] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<TaskPhoto | null>(null);
  const [pendingReopenStatus, setPendingReopenStatus] = useState<TaskStatus | null>(null);

  const displayTitle = getTaskTitle(task);
  const displayDescription = getTaskDescription(task);

  // Signature pad refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const [hasDrawnSignature, setHasDrawnSignature] = useState(false);

  // Reset drafts cleanly when opening a different task
  useEffect(() => {
    setDraftStatus(task.status);
    setDraftChecklist(task.checklist_json.map((c) => ({ ...c })));
    setDraftNotes(task.notes);
    setDraftPhotos([...task.photos]);
    setDraftSignature(task.signature);
    setIsEditing(false);
    setHasDrawnSignature(false);
    setNewCheckItem('');
    setSavedNotice(false);
    setPendingReopenStatus(null);
  }, [task.id]);

  const isReadOnly = task.status === 'erledigt' && !isEditing;

  const hasChecklistChanged =
    draftChecklist.length !== task.checklist_json.length ||
    draftChecklist.some((item, idx) => {
      const orig = task.checklist_json[idx];
      return !orig || orig.id !== item.id || orig.label !== item.label || orig.checked !== item.checked;
    });

  const hasPhotosChanged =
    draftPhotos.length !== task.photos.length ||
    draftPhotos.some((item, idx) => item.id !== task.photos[idx]?.id);

  const hasSignatureChanged =
    (draftSignature ?? '') !== (task.signature ?? '') || hasDrawnSignature;

  const hasUnsavedChanges =
    draftStatus !== task.status ||
    draftNotes !== task.notes ||
    hasChecklistChanged ||
    hasPhotosChanged ||
    hasSignatureChanged;

  const showEditFooter = isEditing || hasUnsavedChanges;

  const overdue = isTaskOverdue(task.due_date, draftStatus);
  const completedChecks = draftChecklist.filter((c) => c.checked).length;

  const handleToggleChecklist = (itemId: string) => {
    if (isReadOnly) return;
    setDraftChecklist((prev) =>
      prev.map((c) => (c.id === itemId ? { ...c, checked: !c.checked } : c))
    );
  };

  const handleAddChecklistItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    const label = newCheckItem.trim();
    if (!label) return;
    setDraftChecklist((prev) => [
      ...prev,
      { id: `chk_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, label, checked: false },
    ]);
    setNewCheckItem('');
  };

  const handleStatusChange = (status: TaskStatus) => {
    if (isReadOnly) return;
    if (task.status === 'erledigt' && draftStatus === 'erledigt' && status !== 'erledigt') {
      setPendingReopenStatus(status);
      return;
    }
    setDraftStatus(status);
  };

  const handleSaveChanges = async () => {
    setSavingChanges(true);
    try {
      const pendingDrawnDataUrl =
        !draftSignature && hasDrawnSignature && canvasRef.current
          ? canvasRef.current.toDataURL('image/png')
          : undefined;
      const finalSignature = draftSignature ?? pendingDrawnDataUrl;

      await onUpdateTask(task.id, {
        status: draftStatus,
        checklist_json: draftChecklist,
        notes: draftNotes,
        photos: draftPhotos,
        signature: finalSignature,
        completed_at:
          draftStatus === 'erledigt'
            ? task.completed_at || new Date().toISOString()
            : undefined,
      });
      setDraftSignature(finalSignature);
      setHasDrawnSignature(false);
      setIsEditing(false);
      setSavedNotice(true);
      window.setTimeout(() => setSavedNotice(false), 2500);
    } finally {
      setSavingChanges(false);
    }
  };

  const handleCancelChanges = () => {
    setDraftStatus(task.status);
    setDraftChecklist(task.checklist_json.map((c) => ({ ...c })));
    setDraftNotes(task.notes);
    setDraftPhotos([...task.photos]);
    setDraftSignature(task.signature);
    setHasDrawnSignature(false);
    clearSignaturePad();
    setNewCheckItem('');
    setPendingReopenStatus(null);
    if (task.status === 'erledigt' && isEditing) {
      setIsEditing(false);
      return;
    }
    onClose();
  };

  const handlePhotoUpload = async (file: File, markCompleted = false) => {
    if (isReadOnly && !markCompleted) return;
    setUploadingPhoto(true);
    try {
      const watermarked = await createWatermarkedPhoto(file, {
        objectName: objectItem?.name ?? t('common.object'),
        fallbackLat: objectItem?.lat,
        fallbackLng: objectItem?.lng,
        caption: displayTitle,
      });
      const nextPhotos = [...draftPhotos, watermarked];
      setDraftPhotos(nextPhotos);

      if (isEditing && !markCompleted) {
        return;
      }

      await onUpdateTask(task.id, {
        photos: nextPhotos,
        notes: draftNotes,
        checklist_json: draftChecklist,
        ...(markCompleted
          ? { status: 'erledigt', completed_at: task.completed_at || new Date().toISOString() }
          : {}),
      });
      if (markCompleted) {
        setDraftStatus('erledigt');
      }
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = async (photoId: string) => {
    if (isReadOnly) return;
    const nextPhotos = draftPhotos.filter((p) => p.id !== photoId);
    setDraftPhotos(nextPhotos);
    if (isEditing) {
      return;
    }
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
    if (isReadOnly) return;
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawnSignature) return;
    const dataUrl = canvas.toDataURL('image/png');
    setDraftSignature(dataUrl);
    setHasDrawnSignature(false);
    if (!isEditing) {
      await onUpdateTask(task.id, { signature: dataUrl });
    }
  };

  const clearSavedSignature = async () => {
    if (isReadOnly) return;
    clearSignaturePad();
    setDraftSignature(undefined);
    setHasDrawnSignature(false);
    if (!isEditing) {
      await onUpdateTask(task.id, { signature: undefined });
    }
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const draftTask: FacilityTask = {
        ...task,
        status: draftStatus,
        checklist_json: draftChecklist,
        notes: draftNotes,
        photos: draftPhotos,
        signature: draftSignature,
        completed_at:
          draftStatus === 'erledigt'
            ? task.completed_at || new Date().toISOString()
            : undefined,
      };
      const translatedTask = await ensureTaskTranslated(draftTask, language);
      exportTaskProtocolPDF({
        task: translatedTask,
        obj: objectItem,
        worker: assignee,
        docLang: docLanguage,
      });
    } finally {
      setExportingPdf(false);
    }
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
              {displayTitle}
            </h2>
            {isReadOnly && (
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                <Lock className="w-3 h-3" />
                {t('taskModal.readOnlyLocked')}
              </span>
            )}
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
                  const active = draftStatus === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      disabled={isReadOnly || savingChanges}
                      onClick={() => handleStatusChange(st)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                        isReadOnly
                          ? 'cursor-not-allowed opacity-75'
                          : 'cursor-pointer disabled:opacity-60'
                      } ${
                        active
                          ? st === 'erledigt'
                            ? 'bg-emerald-600 text-white opacity-100'
                            : st === 'in_bearbeitung'
                              ? 'bg-amber-500 text-slate-950 opacity-100'
                              : 'bg-red-600 text-white opacity-100'
                          : isReadOnly
                            ? 'bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500'
                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {tStatus(st)}
                    </button>
                  );
                })}
              </div>
              {(draftStatus === 'erledigt' || task.completed_at) && (
                <div
                  className={`mt-2.5 pt-2 border-t border-slate-200/80 dark:border-slate-700/80 text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5 font-mono ${
                    draftStatus !== 'erledigt' ? 'opacity-50 line-through' : ''
                  }`}
                >
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
          {displayDescription && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                {t('taskModal.description')}
              </h3>
              <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                {displayDescription}
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
                  total: draftChecklist.length,
                })}
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              {draftChecklist.map((item) => (
                <label
                  key={item.id}
                  className={`flex items-center gap-3 px-3.5 py-3 min-h-[44px] bg-white dark:bg-slate-900 transition-colors ${
                    isReadOnly
                      ? 'cursor-default opacity-90'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={item.checked}
                    disabled={isReadOnly}
                    onChange={() => handleToggleChecklist(item.id)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
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

            {!isReadOnly && (
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
            )}
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
              {savedNotice ? (
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  {t('common.saved')}
                </span>
              ) : draftNotes !== task.notes ? (
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                  {t('taskModal.unsavedChanges')}
                </span>
              ) : null}
            </div>
            <textarea
              id="task-notes"
              rows={3}
              value={draftNotes}
              readOnly={isReadOnly}
              disabled={isReadOnly}
              onChange={(e) => setDraftNotes(e.target.value)}
              placeholder={t('taskModal.notesPlaceholder')}
              className={`w-full rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-sm focus:outline-none ${
                isReadOnly
                  ? 'bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300 cursor-not-allowed'
                  : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-orange-500'
              }`}
            />
          </div>

          {/* Photo Documentation with GPS & Timestamp Watermark */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('taskModal.photosTitle', { count: draftPhotos.length })}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('taskModal.photosHint')}
                </p>
              </div>
              {!isReadOnly && (
                <PhotoUploadButtons
                  onSelectFile={(file) => handlePhotoUpload(file, false)}
                  loading={uploadingPhoto}
                  loadingLabel={t('common.photoSending')}
                  compact
                />
              )}
            </div>

            {uploadingPhoto && (
              <p className="text-xs text-orange-600 dark:text-orange-400 font-medium mb-2">
                {t('taskModal.uploadingPhoto')}
              </p>
            )}

            {draftPhotos.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                {t('taskModal.noPhotos')}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {draftPhotos.map((photo) => (
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
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(photo.id)}
                        aria-label={t('common.delete')}
                        className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-slate-950/75 text-white hover:bg-red-600 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
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
              {draftSignature && !isReadOnly && (
                <button
                  type="button"
                  onClick={() => void clearSavedSignature()}
                  className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                >
                  {t('taskModal.resetSignature')}
                </button>
              )}
            </div>

            {draftSignature ? (
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 flex items-center justify-between gap-4">
                <img
                  src={draftSignature}
                  alt={t('taskModal.signed')}
                  className="h-16 bg-white rounded-lg border border-slate-200 p-1 object-contain"
                />
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  {t('taskModal.signed')}
                </span>
              </div>
            ) : isReadOnly ? (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                {t('taskModal.noSignature')}
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
                      onClick={() => void saveSignature()}
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
          {showEditFooter ? (
            <>
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                {hasUnsavedChanges ? t('taskModal.unsavedChanges') : t('taskModal.editModeActive')}
              </span>
              <div className="flex flex-wrap items-center gap-2 ml-auto">
                <button
                  type="button"
                  disabled={savingChanges}
                  onClick={handleCancelChanges}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-60 cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  disabled={savingChanges}
                  onClick={() => void handleSaveChanges()}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-sm transition-colors cursor-pointer whitespace-nowrap"
                >
                  {savingChanges ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>
                    {savingChanges ? t('common.saving') : t('taskModal.saveChanges')}
                  </span>
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                {t('common.close')}
              </button>

              <div className="flex flex-wrap items-center gap-2">
                {task.status === 'erledigt' && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Pencil className="w-4 h-4 text-orange-500" />
                    <span>{t('taskModal.edit')}</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={exportingPdf}
                  onClick={() => void handleExportPdf()}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 ${
                    task.status === 'erledigt'
                      ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-sm'
                      : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {exportingPdf ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}
                  <span>{t('tasks.pdfProtocol')}</span>
                </button>

                {task.status !== 'erledigt' && (
                  <PhotoUploadButtons
                    onSelectFile={(file) => handlePhotoUpload(file, true)}
                    loading={uploadingPhoto}
                    loadingLabel={t('common.photoSending')}
                    variant="emerald"
                  />
                )}
              </div>
            </>
          )}
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
      {/* Reopen Completed Task Confirmation */}
      {pendingReopenStatus && (
        <ConfirmDialog
          title={t('confirm.reopenTaskTitle')}
          message={t('confirm.reopenTaskMessage')}
          detail={displayTitle}
          confirmLabel={t('confirm.reopenTaskConfirm')}
          onConfirm={() => {
            setDraftStatus(pendingReopenStatus);
            setPendingReopenStatus(null);
          }}
          onCancel={() => setPendingReopenStatus(null)}
        />
      )}
    </div>
  );
};
