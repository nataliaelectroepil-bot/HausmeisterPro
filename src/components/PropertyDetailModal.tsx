import React, { useMemo } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  ExternalLink,
  Home,
  KeyRound,
  Mail,
  MapPin,
  Navigation,
  Phone,
  User as UserIcon,
  Wrench,
  X,
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { useTaskTranslation } from '../i18n/TaskTranslationContext';
import { FacilityTask, PropertyObject, User } from '../types/facility';
import { formatDateTimeDE, isTaskOverdue } from '../utils/dateUtils';

interface PropertyDetailModalProps {
  objectItem: PropertyObject;
  tasks: FacilityTask[];
  users: User[];
  onClose: () => void;
  onOpenModules: (objectId: string) => void;
  onShowOnMap: (objectId: string) => void;
  onCreateTaskForObject: (objectId: string) => void;
  onOpenTaskDetail: (task: FacilityTask) => void;
}

export const PropertyDetailModal: React.FC<PropertyDetailModalProps> = ({
  objectItem,
  tasks,
  users,
  onClose,
  onOpenModules,
  onShowOnMap,
  onCreateTaskForObject,
  onOpenTaskDetail,
}) => {
  const { t, tCategory, tStatus, tPriority, locale } = useTranslation();
  const { getTaskTitle, getTaskDescription } = useTaskTranslation();

  const clientUser = useMemo(
    () =>
      objectItem.client_id
        ? users.find((u) => u.id === objectItem.client_id)
        : undefined,
    [users, objectItem.client_id]
  );

  const hasValidCoords =
    Number.isFinite(objectItem.lat) &&
    Number.isFinite(objectItem.lng) &&
    !(objectItem.lat === 0 && objectItem.lng === 0);

  const { openTasks, completedTasks } = useMemo(() => {
    const open = tasks
      .filter((task) => task.status !== 'erledigt')
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
    const completed = tasks
      .filter((task) => task.status === 'erledigt')
      .sort((a, b) =>
        (b.completed_at || b.due_date).localeCompare(a.completed_at || a.due_date)
      );
    return { openTasks: open, completedTasks: completed };
  }, [tasks]);

  const accessNotesText = [
    objectItem.key_info,
    objectItem.access_notes,
    objectItem.notes,
  ]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join(' · ');

  const renderTaskCard = (task: FacilityTask) => {
    const overdue = isTaskOverdue(task.due_date, task.status);
    const worker = users.find((u) => u.id === task.assigned_to);
    const desc = getTaskDescription(task);

    const statusBadgeClass =
      task.status === 'erledigt'
        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
        : task.status === 'in_bearbeitung'
        ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60'
        : 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60';

    const priorityBadgeClass =
      task.priority === 'dringend'
        ? 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/60'
        : task.priority === 'hoch'
        ? 'bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800/60'
        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700';

    return (
      <div
        key={task.id}
        role="button"
        tabIndex={0}
        onClick={() => onOpenTaskDetail(task)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenTaskDetail(task);
          }
        }}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 hover:border-orange-400 dark:hover:border-orange-500 p-3.5 transition-colors cursor-pointer space-y-2"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-orange-600 dark:text-orange-400">
              {tCategory(task.category)}
            </p>
            <h4 className="font-display text-sm font-bold text-slate-900 dark:text-white leading-snug">
              {getTaskTitle(task)}
            </h4>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <span
              className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${priorityBadgeClass}`}
            >
              {tPriority(task.priority)}
            </span>
            <span
              className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass}`}
            >
              {tStatus(task.status)}
            </span>
            {overdue && (
              <span className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
                <AlertTriangle className="w-3 h-3" />
                Überfällig
              </span>
            )}
          </div>
        </div>

        {desc && (
          <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
            {desc}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums pt-1">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            Fällig: {formatDateTimeDE(task.due_date, locale)}
          </span>
          {task.status === 'erledigt' && task.completed_at ? (
            <span className="text-emerald-700 dark:text-emerald-300 font-medium">
              Erledigt am: {formatDateTimeDE(task.completed_at, locale)}
            </span>
          ) : worker ? (
            <span className="font-sans">{worker.name}</span>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[45] flex items-end sm:items-center justify-center bg-slate-950/75 backdrop-blur-sm sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="property-detail-title"
    >
      <div
        className="w-full sm:max-w-3xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Quick Actions */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-orange-600 dark:text-orange-400">
                  Objektdetails
                </span>
                {objectItem.client_name && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{objectItem.client_name}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums font-semibold">
                  {objectItem.units_count} {t('common.unitsShort')}
                </span>
              </div>
              <h2
                id="property-detail-title"
                className="mt-1 font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2"
              >
                <Building2 className="w-5 h-5 text-orange-500 shrink-0" />
                <span className="truncate">{objectItem.name}</span>
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Schließen"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Actions Row */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenModules(objectItem.id)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-orange-500 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer min-h-[38px]"
            >
              <Wrench className="w-3.5 h-3.5 text-orange-500" />
              <span>Tools</span>
            </button>

            <button
              type="button"
              onClick={() => onShowOnMap(objectItem.id)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer min-h-[38px]"
            >
              <MapPin className="w-3.5 h-3.5 text-blue-500" />
              <span>Auf Karte</span>
            </button>

            {hasValidCoords && (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${objectItem.lat},${objectItem.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 px-3 py-2 text-xs font-semibold text-white transition-colors min-h-[38px]"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>Route</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Property Information Section */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Objektinformationen
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3.5 space-y-1">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-orange-500" />
                  Objektname / WEG-Titel
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {objectItem.name}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3.5 space-y-1">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Home className="w-3.5 h-3.5 text-orange-500" />
                  Anzahl Einheiten
                </p>
                <p className="font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                  {objectItem.units_count} WE
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3.5 space-y-1">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-orange-500" />
                  Vollständige Adresse
                </p>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {objectItem.address || '—'}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3.5 space-y-1">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Navigation className="w-3.5 h-3.5 text-orange-500" />
                  GPS-Koordinaten
                </p>
                <p className="font-mono text-sm font-medium text-slate-800 dark:text-slate-100 tabular-nums">
                  {hasValidCoords
                    ? `${objectItem.lat.toFixed(5)}, ${objectItem.lng.toFixed(5)}`
                    : 'Nicht hinterlegt'}
                </p>
              </div>

              {(objectItem.client_name || clientUser) && (
                <div className="sm:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3.5 space-y-1.5">
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <UserIcon className="w-3.5 h-3.5 text-orange-500" />
                    Hausverwaltung &amp; Kontakt
                  </p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {objectItem.client_name || clientUser?.region || '—'}
                  </p>
                  {clientUser && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                      <span className="font-medium">{clientUser.name}</span>
                      {clientUser.phone && (
                        <a
                          href={`tel:${clientUser.phone}`}
                          className="inline-flex items-center gap-1 hover:text-orange-600 dark:hover:text-orange-400"
                        >
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-mono">{clientUser.phone}</span>
                        </a>
                      )}
                      {clientUser.email && (
                        <a
                          href={`mailto:${clientUser.email}`}
                          className="inline-flex items-center gap-1 hover:text-orange-600 dark:hover:text-orange-400"
                        >
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span>{clientUser.email}</span>
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}

              {accessNotesText && (
                <div className="sm:col-span-2 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-950/30 p-3.5 space-y-1">
                  <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5" />
                    Zugangshinweise &amp; Schlüsselinfo
                  </p>
                  <p className="text-xs sm:text-sm text-amber-950 dark:text-amber-100">
                    {accessNotesText}
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Associated Tasks Section */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Zugeordnete Aufgaben ({tasks.length})
                </h3>
              </div>

              <button
                type="button"
                onClick={() => onCreateTaskForObject(objectItem.id)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors cursor-pointer min-h-[38px]"
              >
                <span>+ Neue Aufgabe für dieses Objekt</span>
              </button>
            </div>

            {/* Offene Aufgaben */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="font-display text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Offene Aufgaben</span>
                  <span className="rounded-md bg-blue-100 dark:bg-blue-950/60 px-2 py-0.5 font-mono text-xs text-blue-700 dark:text-blue-300 tabular-nums">
                    {openTasks.length}
                  </span>
                </h4>
              </div>

              {openTasks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-500 dark:text-slate-400 text-center">
                  Keine offenen Aufgaben für dieses Objekt vorhanden.
                </div>
              ) : (
                <div className="space-y-2.5">{openTasks.map(renderTaskCard)}</div>
              )}
            </div>

            {/* Erledigte Aufgaben */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <h4 className="font-display text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>Erledigte Aufgaben</span>
                  <span className="rounded-md bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 font-mono text-xs text-emerald-700 dark:text-emerald-300 tabular-nums">
                    {completedTasks.length}
                  </span>
                </h4>
              </div>

              {completedTasks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-500 dark:text-slate-400 text-center">
                  Noch keine erledigten Aufgaben für dieses Objekt.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {completedTasks.map(renderTaskCard)}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer min-h-[40px]"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
};
