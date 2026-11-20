import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileDown,
  Globe,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  DocLanguageCode,
  FacilityTask,
  PropertyObject,
  TimeEntry,
  User,
} from '../types/facility';
import { formatDateTimeDE, formatTimeDE, getTodayISODate, isTaskOverdue } from '../utils/dateUtils';
import { exportTasksReportPDF } from '../utils/pdfExport';
import { useTranslation } from '../i18n/LanguageContext';
import { DOC_LANGUAGE_OPTIONS, PDF_LABELS } from '../i18n/translations';

interface AdminDispatcherTabProps {
  users: User[];
  objects: PropertyObject[];
  tasks: FacilityTask[];
  timeEntries: TimeEntry[];
  onAssignTask: (taskId: string, userId: string) => Promise<void>;
  onOpenTaskDetail: (task: FacilityTask) => void;
}

export const AdminDispatcherTab: React.FC<AdminDispatcherTabProps> = ({
  users,
  objects,
  tasks,
  timeEntries,
  onAssignTask,
  onOpenTaskDetail,
}) => {
  const { t, tCategory, tStatus, docLanguage, setDocLanguage } = useTranslation();
  const [filterWorker, setFilterWorker] = useState<string>('alle');
  const todayStr = getTodayISODate();

  const fieldWorkers = useMemo(
    () => users.filter((u) => u.role === 'worker' || u.role === 'admin'),
    [users]
  );

  const overdueTasksCount = tasks.filter((t) => isTaskOverdue(t.due_date, t.status)).length;
  const openTasksCount = tasks.filter((t) => t.status !== 'erledigt').length;
  const doneTasksCount = tasks.filter((t) => t.status === 'erledigt').length;

  const filteredTasks = useMemo(() => {
    if (filterWorker === 'alle') return tasks;
    return tasks.filter((t) => t.assigned_to === filterWorker);
  }, [tasks, filterWorker]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-orange-500" />
            {t('admin.title')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {t('admin.subtitle')}
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            exportTasksReportPDF({
              tasks: filteredTasks,
              objects,
              users,
              docLang: docLanguage,
              title:
                filterWorker === 'alle'
                  ? docLanguage === 'DE'
                    ? 'Gesamtauswertung aller Objekte'
                    : `${PDF_LABELS[docLanguage].tasksHeader} (${PDF_LABELS[docLanguage].allObjects})`
                  : `${
                      docLanguage === 'DE' ? 'Auswertung Mitarbeiter' : PDF_LABELS[docLanguage].colWorker
                    }: ${users.find((u) => u.id === filterWorker)?.name ?? ''}`,
            })
          }
          className="flex items-center gap-2 rounded-xl bg-slate-900 dark:bg-orange-500 hover:bg-slate-800 dark:hover:bg-orange-600 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white transition-colors cursor-pointer min-h-[44px]"
        >
          <FileDown className="w-4 h-4" />
          <span>{t('admin.exportTasksPdf')}</span>
        </button>
      </div>

      {/* Official PDF Document Language Setting (Company Legal Export Language) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
            <Globe className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
              {t('admin.docLangLabel')}
            </p>
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t('admin.docLangHint')}
            </p>
          </div>
        </div>
        <select
          value={docLanguage}
          onChange={(e) => setDocLanguage(e.target.value as DocLanguageCode)}
          aria-label={t('admin.docLangLabel')}
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-900 dark:text-white min-h-[44px] shrink-0"
        >
          {DOC_LANGUAGE_OPTIONS.map((opt) => (
            <option key={opt.code} value={opt.code}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('admin.kpiOpen')}</p>
          <p className="mt-1 font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {openTasksCount}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('admin.kpiOverdue')}</p>
          <p className="mt-1 font-mono text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums">
            {overdueTasksCount}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('admin.kpiDone')}</p>
          <p className="mt-1 font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {doneTasksCount}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('admin.kpiObjects')}</p>
          <p className="mt-1 font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {objects.length}
          </p>
        </div>
      </div>

      {/* Live Worker Shift Status */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <h2 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-orange-500" />
          {t('admin.liveStatusTitle', { count: fieldWorkers.length })}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {fieldWorkers.map((worker) => {
            const todayShift = timeEntries.find(
              (e) => e.user_id === worker.id && e.date === todayStr
            );
            const assignedOpen = tasks.filter(
              (tItem) => tItem.assigned_to === worker.id && tItem.status !== 'erledigt'
            ).length;

            const shiftLabel = !todayShift
              ? t('time.statusNotStarted')
              : todayShift.status === 'aktiv'
                ? t('admin.shiftActiveSince', { time: formatTimeDE(todayShift.start_time) })
                : todayShift.status === 'pause'
                  ? t('admin.inPause')
                  : t('admin.shiftEndedAt', { time: formatTimeDE(todayShift.end_time) });

            const shiftColor = !todayShift
              ? 'text-slate-500 dark:text-slate-400'
              : todayShift.status === 'aktiv'
                ? 'text-emerald-600 dark:text-emerald-400'
                : todayShift.status === 'pause'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-600 dark:text-slate-300';

            return (
              <div
                key={worker.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {worker.name}
                  </p>
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {worker.employee_id}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {worker.region}
                </p>
                <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
                  <span className={`font-semibold ${shiftColor}`}>{shiftLabel}</span>
                  <span className="font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                    {t('admin.openCount', { count: assignedOpen })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dispatcher Task Assignment Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            {t('admin.assignTitle')}
          </h2>
          <select
            value={filterWorker}
            onChange={(e) => setFilterWorker(e.target.value)}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100"
          >
            <option value="alle">{t('admin.allWorkers')}</option>
            {fieldWorkers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.employee_id})
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4 font-semibold">{t('admin.colTaskObj')}</th>
                <th className="py-3 px-4 font-semibold">{t('admin.colCategory')}</th>
                <th className="py-3 px-4 font-semibold">{t('admin.colDue')}</th>
                <th className="py-3 px-4 font-semibold">{t('admin.colStatus')}</th>
                <th className="py-3 px-4 font-semibold">{t('admin.colAssign')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredTasks.map((task) => {
                const obj = objects.find((o) => o.id === task.object_id);
                const overdue = isTaskOverdue(task.due_date, task.status);
                return (
                  <tr
                    key={task.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => onOpenTaskDetail(task)}
                        className="text-left hover:text-orange-600 dark:hover:text-orange-400 cursor-pointer"
                      >
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {task.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {obj?.name ?? '—'}
                        </p>
                      </button>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {tCategory(task.category)}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs tabular-nums whitespace-nowrap">
                      <span
                        className={
                          overdue
                            ? 'text-red-600 dark:text-red-400 font-semibold flex items-center gap-1'
                            : 'text-slate-600 dark:text-slate-300'
                        }
                      >
                        {overdue && <AlertTriangle className="w-3.5 h-3.5" />}
                        {formatDateTimeDE(task.due_date)}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-xs font-semibold">
                      {task.status === 'erledigt' ? (
                        <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> {tStatus('erledigt')}
                        </span>
                      ) : task.status === 'in_bearbeitung' ? (
                        <span className="text-amber-600 dark:text-amber-400">
                          {tStatus('in_bearbeitung')}
                        </span>
                      ) : (
                        <span className="text-red-600 dark:text-red-400">
                          {tStatus('offen')}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={task.assigned_to}
                        onChange={(e) => onAssignTask(task.id, e.target.value)}
                        aria-label={`Mitarbeiter für ${task.title} zuweisen`}
                        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-100"
                      >
                        {fieldWorkers.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
