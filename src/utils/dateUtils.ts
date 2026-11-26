import { TaskStatus } from '../types/facility';

export const TODAY_ISO = '2026-11-17';

export function getTodayISODate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDateDE(dateStr: string, locale = 'de-DE'): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatShortDateDE(dateStr: string, locale = 'de-DE'): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(locale, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
}

export function formatDateTimeDE(dateStr: string, locale = 'de-DE'): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTimeDE(dateStr?: string, locale = 'de-DE'): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDurationHHMMSS(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatMinutesAsHoursDE(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h} Std. ${String(m).padStart(2, '0')} Min.`;
}

export function isTaskOverdue(dueDate: string, status: TaskStatus): boolean {
  if (status === 'erledigt') return false;
  const due = new Date(dueDate);
  const now = new Date();
  return due.getTime() < now.getTime();
}

export function isDateTomorrow(dueDate: string): boolean {
  if (!dueDate) return false;
  let datePart = dueDate.slice(0, 10);
  if (/(Z|[+-]\d{2}:\d{2})$/i.test(dueDate)) {
    const parsed = new Date(dueDate);
    if (!Number.isNaN(parsed.getTime())) {
      const py = parsed.getFullYear();
      const pm = String(parsed.getMonth() + 1).padStart(2, '0');
      const pd = String(parsed.getDate()).padStart(2, '0');
      datePart = `${py}-${pm}-${pd}`;
    }
  }
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const y = tomorrow.getFullYear();
  const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const day = String(tomorrow.getDate()).padStart(2, '0');
  return datePart === `${y}-${m}-${day}`;
}

export function isOpenTaskForTomorrow(task: {
  status: TaskStatus;
  due_date: string;
}): boolean {
  return task.status === 'offen' && isDateTomorrow(task.due_date);
}

export function getISOWeekAndYear(dateInput: Date | string): { kw: number; year: number } {
  const date = typeof dateInput === 'string' ? new Date(`${dateInput.slice(0, 10)}T12:00:00`) : new Date(dateInput.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  const kw =
    1 +
    Math.round(
      ((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    );
  return { kw, year: date.getFullYear() };
}

export function getWeekStartEnd(year: number, kw: number): { start: Date; end: Date; dates: string[] } {
  const jan4 = new Date(year, 0, 4, 12, 0, 0);
  const dayOfWeek = (jan4.getDay() + 6) % 7; // Monday = 0
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setDate(jan4.getDate() - dayOfWeek);

  const monday = new Date(mondayWeek1);
  monday.setDate(mondayWeek1.getDate() + (kw - 1) * 7);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${day}`);
  }

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: monday, end: sunday, dates };
}

export function getMonthGridDays(year: number, monthIndex: number): string[] {
  const firstDay = new Date(year, monthIndex, 1, 12, 0, 0);
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday = 0
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - startOffset);

  const days: string[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    days.push(`${y}-${m}-${day}`);
  }
  return days;
}
