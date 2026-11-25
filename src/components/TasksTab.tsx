import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileText,
  Loader2,
  MapPin,
  Search,
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { useTaskTranslation } from '../i18n/TaskTranslationContext';
import {
  FacilityTask,
  PropertyObject,
  TaskCategory,
  TaskStatus,
  User,
} from '../types/facility';
import { formatDateTimeDE, isTaskOverdue } from '../utils/dateUtils';
import { createWatermarkedPhoto } from '../utils/photoWatermark';
import { BIN_VISUAL_META } from '../utils/binMeta';
import { exportTaskProtocolPDF } from '../utils/pdfExport';
import { CompleteTaskModal } from './CompleteTaskModal';

interface TasksTabProps {
  tasks: FacilityTask[];
  objects: PropertyObject[];
  users: User[];
  onOpenTaskDetail: (task: FacilityTask) => void;
  onQuickCompleteWithPhoto: (
    task: FacilityTask,
    photo: Awaited<ReturnType<typeof createWatermarkedPhoto>>
  ) => Promise<void>;
  onCompleteWithoutPhoto: (task: FacilityTask) => Promise<void>;
}

const CATEGORY_FILTERS: Array<'Alle' | TaskCategory> = [
  'Alle',
  'Mülltonnendienst',
  'Reinigung',
  'Außenanlagenpflege',
  'Winterdienst',
  'Baustelle / Reparatur',
];

export const TasksTab: React.FC<TasksTabProps> = ({
  tasks,
  objects,
  users,
  onOpenTaskDetail,
  onQuickCompleteWithPhoto,
  onCompleteWithoutPhoto,
}) => {
  const { t, tCategory, tStatus, tPriority, tBin, docLanguage, language, locale } = useTranslation();
  const { getTaskTitle, getTaskDescription, ensureTaskTranslated } = useTaskTranslation();
  const [selectedCategory, setSelectedCategory] = useState<'Alle' | TaskCategory>('Alle');
  const [selectedStatus, setSelectedStatus] = useState<TaskStatus>('offen');
  const [searchQuery, setSearchQuery] = useState('');
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [completeModalTask, setCompleteModalTask] = useState<FacilityTask | null>(null);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [exportingPdfId, setExportingPdfId] = useState<string | null>(null);

  const categoryFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tasks.filter((tItem) => {
      if (selectedCategory !== 'Alle' && tItem.category !== selectedCategory) return false;
      if (!q) return true;
      const obj = objects.find((o) => o.id === tItem.object_id);
      const trTitle = getTaskTitle(tItem).toLowerCase();
      const trDesc = getTaskDescription(tItem).toLowerCase();
      return (
        tItem.title.toLowerCase().includes(q) ||
        tItem.description.toLowerCase().includes(q) ||
        trTitle.includes(q) ||
        trDesc.includes(q) ||
        (obj?.name.toLowerCase().includes(q) ?? false) ||
        (obj?.address.toLowerCase().includes(q) ?? false)
      );
    });
  }, [tasks, objects, selectedCategory, searchQuery, getTaskTitle, getTaskDescription]);

  const counts = useMemo(() => {
    return {
      offen: categoryFiltered.filter((tItem) => tItem.status === 'offen').length,
      in_bearbeitung: categoryFiltered.filter((tItem) => tItem.status === 'in_bearbeitung').length,
      erledigt: categoryFiltered.filter((tItem) => tItem.status === 'erledigt').length,
    };
  }, [categoryFiltered]);

  const visibleTasks = useMemo(() => {
    return categoryFiltered
      .filter((tItem) => tItem.status === selectedStatus)
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
  }, [categoryFiltered, selectedStatus]);

  const handleQuickPhoto = async (
    file: File,
    task: FacilityTask,
    obj?: PropertyObject
  ) => {
    setCompletingTaskId(task.id);
    setCompleteError(null);
    try {
      const photo = await createWatermarkedPhoto(file, {
        objectName: obj?.name ?? (task.address || t('common.object')),
        fallbackLat: obj?.lat ?? task.lat,
        fallbackLng: obj?.lng ?? task.lng,
        caption: getTaskTitle(task),
      });
      await onQuickCompleteWithPhoto(task, photo);
      setCompleteModalTask(null);
    } catch (err) {
      setCompleteError(
        err instanceof Error ? err.message : 'Foto konnte nicht verarbeitet werden.'
      );
    } finally {
      setCompletingTaskId(null);
    }
  };

  const handleContinueWithoutPhoto = async (task: FacilityTask) => {
    setCompletingTaskId(task.id);
    setCompleteError(null);
    try {
      await onCompleteWithoutPhoto(task);
      setCompleteModalTask(null);
    } catch (err) {
      setCompleteError(
        err instanceof Error ? err.message : 'Aufgabe konnte nicht abgeschlossen werden.'
      );
    } finally {
      setCompletingTaskId(null);
    }
  };

  const handleExportPdf = async (task: FacilityTask, obj?: PropertyObject, worker?: User) => {
    setExportingPdfId(task.id);
    try {
      const translatedTask = await ensureTaskTranslated(task, language);
      exportTaskProtocolPDF({
        task: translatedTask,
        obj,
        worker,
        docLang: docLanguage,
      });
    } finally {
      setExportingPdfId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            {t('tasks.title')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {t('tasks.subtitle')}
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('tasks.searchPlaceholder')}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-10 pr-3.5 py-2 text-sm text-slate-900 dark:text-white focus:border-orange-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Service Category Filter Buttons */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {CATEGORY_FILTERS.map((cat) => {
          const active = selectedCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[38px] cursor-pointer ${
                active
                  ? 'bg-slate-900 text-white dark:bg-orange-500'
                  : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {cat === 'Alle' ? t('common.all') : tCategory(cat)}
            </button>
          );
        })}
      </div>

      {/* Status Tabs with Counters */}
      <div className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5">
        <button
          type="button"
          onClick={() => setSelectedStatus('offen')}
          className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs sm:text-sm font-semibold transition-colors cursor-pointer min-h-[44px] ${
            selectedStatus === 'offen'
              ? 'bg-red-600 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <span>{tStatus('offen')}</span>
          <span
            className={`font-mono text-xs px-1.5 py-0.5 rounded-md tabular-nums ${
              selectedStatus === 'offen'
                ? 'bg-red-700 text-white'
                : 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400'
            }`}
          >
            {counts.offen}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedStatus('in_bearbeitung')}
          className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs sm:text-sm font-semibold transition-colors cursor-pointer min-h-[44px] ${
            selectedStatus === 'in_bearbeitung'
              ? 'bg-amber-500 text-slate-950'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <span className="truncate">{tStatus('in_bearbeitung')}</span>
          <span
            className={`font-mono text-xs px-1.5 py-0.5 rounded-md tabular-nums ${
              selectedStatus === 'in_bearbeitung'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
            }`}
          >
            {counts.in_bearbeitung}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedStatus('erledigt')}
          className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs sm:text-sm font-semibold transition-colors cursor-pointer min-h-[44px] ${
            selectedStatus === 'erledigt'
              ? 'bg-emerald-600 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <span>{tStatus('erledigt')}</span>
          <span
            className={`font-mono text-xs px-1.5 py-0.5 rounded-md tabular-nums ${
              selectedStatus === 'erledigt'
                ? 'bg-emerald-700 text-white'
                : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {counts.erledigt}
          </span>
        </button>
      </div>

      {/* Task Cards Grid */}
      {visibleTasks.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <p className="font-display text-base font-semibold text-slate-900 dark:text-white">
            {t('tasks.emptyTitle')}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t('tasks.emptySub')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visibleTasks.map((task) => {
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
                  {/* Unboxed Metadata Row */}
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

                    {overdue ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
                        <AlertTriangle className="w-3 h-3" />
                        {t('common.overdue')}
                      </span>
                    ) : task.priority === 'dringend' ? (
                      <span className="text-xs font-bold text-red-600 dark:text-red-400">
                        {tPriority('dringend')}
                      </span>
                    ) : null}
                  </div>

                  {/* Title */}
                  <h3 className="mt-2 font-display text-base font-bold text-slate-900 dark:text-white group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors leading-snug">
                    {getTaskTitle(task)}
                  </h3>
                  {task.description && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                      {getTaskDescription(task)}
                    </p>
                  )}

                  {/* Object & Address */}
                  <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span>
                      <strong className="font-semibold text-slate-800 dark:text-slate-100">
                        {obj?.name ?? (task.address || t('common.object'))}
                      </strong>{' '}
                      · {obj?.address ?? task.address ?? '—'}
                    </span>
                  </p>

                  {task.bin_types && task.bin_types.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
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

                {/* Footer Row */}
                <div
                  className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    <span className="flex items-center gap-1">
                      <ClipboardCheck className="w-3.5 h-3.5 text-slate-400" />
                      {checkedCount}/{task.checklist_json.length}
                    </span>
                    {worker && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-sans">{worker.name}</span>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 ml-auto">
                    <button
                      type="button"
                      disabled={exportingPdfId === task.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleExportPdf(task, obj, worker);
                      }}
                      className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors cursor-pointer min-h-[40px] whitespace-nowrap disabled:opacity-60 ${
                        task.status === 'erledigt'
                          ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-sm'
                          : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {exportingPdfId === task.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <FileText className="w-3.5 h-3.5" />
                      )}
                      <span>{t('tasks.pdfProtocol')}</span>
                    </button>

                    {task.status !== 'erledigt' ? (
                      <button
                        type="button"
                        disabled={completingTaskId === task.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCompleteError(null);
                          setCompleteModalTask(task);
                        }}
                        className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 px-3.5 py-2 text-xs font-semibold text-white transition-colors cursor-pointer min-h-[40px] whitespace-nowrap"
                      >
                        {completingTaskId === task.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {completingTaskId === task.id
                            ? t('tasks.completing')
                            : t('tasks.completeTask')}
                        </span>
                      </button>
                    ) : (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" />
                          {t('common.completed')}
                        </span>
                        {task.completed_at && (
                          <span className="font-mono text-[11px] font-medium text-emerald-700 dark:text-emerald-300 tabular-nums">
                            {t('taskModal.completedAtLabel')}: {formatDateTimeDE(task.completed_at, locale)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {completeModalTask && (() => {
        const modalObj = objects.find((o) => o.id === completeModalTask.object_id);
        return (
          <CompleteTaskModal
            taskTitle={getTaskTitle(completeModalTask)}
            subtitle={modalObj?.name ?? completeModalTask.address}
            allowWithoutPhoto={true}
            loading={completingTaskId === completeModalTask.id}
            error={completeError}
            onSelectPhoto={(file) =>
              handleQuickPhoto(file, completeModalTask, modalObj)
            }
            onContinueWithoutPhoto={() =>
              handleContinueWithoutPhoto(completeModalTask)
            }
            onClose={() => {
              if (completingTaskId) return;
              setCompleteError(null);
              setCompleteModalTask(null);
            }}
          />
        );
      })()}
    </div>
  );
};
