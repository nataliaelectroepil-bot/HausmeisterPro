import { jsPDF } from 'jspdf';
import {
  CATEGORY_LABELS,
  HANDOVER_TYPE_LABELS,
  METER_TYPE_LABELS,
  PDF_LABELS,
  ROOM_LABELS,
  WINTER_ACTION_LABELS,
} from '../i18n/translations';
import {
  CleaningLog,
  DocLanguageCode,
  FacilityTask,
  GardenLog,
  HandoverProtocol,
  MeterReading,
  PropertyObject,
  TimeEntry,
  User,
  WinterLog,
} from '../types/facility';
import {
  formatDateDE,
  formatDateTimeDE,
  formatMinutesAsHoursDE,
  formatTimeDE,
} from './dateUtils';
import { getWinterLogActions } from './objectUtils';

function safePdfText(input: string, docLang: DocLanguageCode): string {
  if (docLang !== 'HR') return input;
  return input
    .replace(/č/g, 'c')
    .replace(/Č/g, 'C')
    .replace(/ć/g, 'c')
    .replace(/Ć/g, 'C')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/š/g, 's')
    .replace(/Š/g, 'S')
    .replace(/ž/g, 'z')
    .replace(/Ž/g, 'Z');
}

function drawBrandHeader(
  doc: jsPDF,
  subtitle: string,
  rightTop: string,
  rightSub: string,
  docLang: DocLanguageCode
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 32, 'F');
  doc.setFillColor(249, 115, 22);
  doc.rect(0, 32, pageWidth, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('HAUSMEISTER PRO', 16, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(203, 213, 225);
  doc.text(safePdfText(subtitle, docLang), 16, 22);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(safePdfText(rightTop, docLang), pageWidth - 16, 14, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(safePdfText(rightSub, docLang), pageWidth - 16, 22, { align: 'right' });
}

export function exportMonthlyTimesheetPDF({
  user,
  monthLabel,
  entries,
  docLang = 'DE',
}: {
  user: User;
  monthLabel: string;
  entries: TimeEntry[];
  docLang?: DocLanguageCode;
}): void {
  const L = PDF_LABELS[docLang] ?? PDF_LABELS.DE;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  drawBrandHeader(
    doc,
    L.timesheetSubtitle,
    monthLabel,
    `${L.created}: ${new Date().toLocaleDateString(L.locale)}`,
    docLang
  );

  // Employee Metadata Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(16, 42, pageWidth - 32, 24, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(safePdfText(L.employee, docLang), 22, 51);
  doc.text(safePdfText(L.employeeId, docLang), 22, 59);
  doc.text(safePdfText(L.region, docLang), 110, 51);
  doc.text(safePdfText(L.email, docLang), 110, 59);

  doc.setFont('helvetica', 'normal');
  doc.text(safePdfText(user.name, docLang), 48, 51);
  doc.text(user.employee_id, 48, 59);
  doc.text(safePdfText(user.region, docLang), 138, 51);
  doc.text(user.email, 138, 59);

  let y = 76;
  doc.setFillColor(30, 41, 59);
  doc.rect(16, y, pageWidth - 32, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);

  doc.text(safePdfText(L.date, docLang), 20, y + 6);
  doc.text(safePdfText(L.start, docLang), 54, y + 6);
  doc.text(safePdfText(L.end, docLang), 80, y + 6);
  doc.text(safePdfText(L.pause, docLang), 106, y + 6);
  doc.text(safePdfText(L.netTime, docLang), 132, y + 6);
  doc.text(safePdfText(L.status, docLang), 166, y + 6);

  y += 10;

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  let totalWorkMinutes = 0;
  let totalPauseMinutes = 0;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  sorted.forEach((entry, idx) => {
    if (y > 258) {
      doc.addPage();
      y = 20;
    }

    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(16, y - 1, pageWidth - 32, 8, 'F');
    }

    totalWorkMinutes += entry.total_work_minutes;
    totalPauseMinutes += entry.total_pause_minutes;

    const statusLabel =
      entry.status === 'beendet'
        ? L.statusClosed
        : entry.status === 'aktiv'
          ? L.statusShiftActive
          : entry.status === 'pause'
            ? L.statusPause
            : L.statusOpen;

    doc.setTextColor(15, 23, 42);
    doc.text(formatDateDE(entry.date), 20, y + 4.5);
    doc.text(formatTimeDE(entry.start_time), 54, y + 4.5);
    doc.text(
      entry.end_time ? formatTimeDE(entry.end_time) : safePdfText(L.active, docLang),
      80,
      y + 4.5
    );
    doc.text(`${entry.total_pause_minutes} ${L.minUnit}`, 106, y + 4.5);
    doc.text(formatMinutesAsHoursDE(entry.total_work_minutes), 132, y + 4.5);
    doc.text(safePdfText(statusLabel, docLang), 166, y + 4.5);

    doc.setDrawColor(226, 232, 240);
    doc.line(16, y + 7, pageWidth - 16, y + 7);
    y += 8;
  });

  y += 6;
  if (y > 245) {
    doc.addPage();
    y = 24;
  }

  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(16, y, pageWidth - 32, 18, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(safePdfText(`${L.workDaysTotal}: ${sorted.length}`, docLang), 22, y + 8);
  doc.text(
    safePdfText(`${L.pausesTotal}: ${totalPauseMinutes} ${L.minUnit}`, docLang),
    22,
    y + 14
  );
  doc.setTextColor(249, 115, 22);
  doc.setFontSize(11);
  doc.text(
    safePdfText(`${L.monthNetTotal}: ${formatMinutesAsHoursDE(totalWorkMinutes)}`, docLang),
    pageWidth - 22,
    y + 11,
    { align: 'right' }
  );

  y += 32;
  doc.setDrawColor(148, 163, 184);
  doc.line(16, y, 88, y);
  doc.line(122, y, pageWidth - 16, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(safePdfText(`${L.sigWorker} (${user.name})`, docLang), 16, y + 5);
  doc.text(safePdfText(L.sigDispatch, docLang), 122, y + 5);

  const safeMonth = monthLabel.replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Stundennachweis_${user.employee_id}_${safeMonth}.pdf`);
}

export function exportDailyWorkdayPDF({
  user,
  entry,
}: {
  user: User;
  entry: TimeEntry;
}): void {
  const docLang: DocLanguageCode = 'DE';
  const L = PDF_LABELS.DE;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  const dateLabel = formatDateDE(entry.date);

  drawBrandHeader(
    doc,
    'TAGESBERICHT / ARBEITSZEITNACHWEIS',
    dateLabel,
    `Erstellt am: ${new Date().toLocaleDateString('de-DE')}`,
    docLang
  );

  // Employee Metadata Box (matching monthly PDF export styling)
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, 42, contentWidth, 24, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Mitarbeiter:', 22, 51);
  doc.text('Personal-Nr.:', 22, 59);
  doc.text('Region:', 110, 51);
  doc.text('E-Mail:', 110, 59);

  doc.setFont('helvetica', 'normal');
  doc.text(sanitizeHelveticaText(user.name || '—'), 48, 51);
  doc.text(sanitizeHelveticaText(user.employee_id || '—'), 48, 59);
  doc.text(sanitizeHelveticaText(user.region || '—'), 138, 51);
  doc.text(sanitizeHelveticaText(user.email || '—'), 138, 59);

  // Single-Day Shift Details Table
  let y = 76;
  doc.setFillColor(30, 41, 59);
  doc.rect(margin, y, contentWidth, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);

  doc.text('Datum', 20, y + 6);
  doc.text('Start', 54, y + 6);
  doc.text('Ende', 80, y + 6);
  doc.text('Pause', 106, y + 6);
  doc.text('Gesamtzeit', 132, y + 6);
  doc.text('Status', 166, y + 6);

  y += 10;

  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y - 1, contentWidth, 9, 'F');

  const statusLabel =
    entry.status === 'beendet'
      ? 'Beendet'
      : entry.status === 'aktiv'
        ? 'Aktiv'
        : entry.status === 'pause'
          ? 'Pause'
          : 'Offen';

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(dateLabel, 20, y + 5);
  doc.text(`${formatTimeDE(entry.start_time)} Uhr`, 54, y + 5);
  doc.text(
    entry.end_time ? `${formatTimeDE(entry.end_time)} Uhr` : 'Laufend',
    80,
    y + 5
  );
  doc.text(`${entry.total_pause_minutes} Min.`, 106, y + 5);
  doc.text(formatMinutesAsHoursDE(entry.total_work_minutes), 132, y + 5);
  doc.text(statusLabel, 166, y + 5);

  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y + 8, pageWidth - margin, y + 8);
  y += 14;

  // Notes / Activity Box
  const noteText =
    entry.notes?.trim() || 'Objektbetreuung & Kontrollgang';
  const preparedNotes = prepareSmartText(
    doc,
    noteText,
    contentWidth - 12,
    9.5,
    'normal'
  );
  const notesBoxHeight = Math.max(20, 12 + preparedNotes.lines.length * 5);

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, notesBoxHeight, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  doc.text('Tätigkeiten & Notizen:', margin + 5, y + 7);
  renderSmartLines(
    doc,
    preparedNotes,
    margin + 5,
    y + 13,
    contentWidth - 10,
    9.5,
    'normal',
    [15, 23, 42],
    5
  );
  y += notesBoxHeight + 8;

  // Daily Summary Highlight Box (matching monthly summary styling)
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, contentWidth, 20, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Schicht: ${formatTimeDE(entry.start_time)} – ${entry.end_time ? formatTimeDE(entry.end_time) : 'Aktiv'}`,
    22,
    y + 8
  );
  doc.text(`Pausenzeit gesamt: ${entry.total_pause_minutes} ${L.minUnit}`, 22, y + 14.5);

  doc.setTextColor(249, 115, 22);
  doc.setFontSize(11);
  doc.text(
    `Gesamtzeit (Netto): ${formatMinutesAsHoursDE(entry.total_work_minutes)}`,
    pageWidth - 22,
    y + 11.5,
    { align: 'right' }
  );

  // Signature Lines at the bottom
  const sigY = Math.max(y + 38, pageHeight - 36);
  doc.setDrawColor(148, 163, 184);
  doc.line(margin, sigY, 88, sigY);
  doc.line(122, sigY, pageWidth - margin, sigY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    sanitizeHelveticaText(`Datum / Unterschrift Mitarbeiter (${user.name})`),
    margin,
    sigY + 5
  );
  doc.text('Datum / Unterschrift Disposition', 122, sigY + 5);

  doc.save(`Tagesbericht_${entry.date}.pdf`);
}

export function exportTasksReportPDF({
  tasks,
  objects,
  users,
  title,
  docLang = 'DE',
}: {
  tasks: FacilityTask[];
  objects: PropertyObject[];
  users: User[];
  title: string;
  docLang?: DocLanguageCode;
}): void {
  const L = PDF_LABELS[docLang] ?? PDF_LABELS.DE;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 26, 'F');
  doc.setFillColor(249, 115, 22);
  doc.rect(0, 26, pageWidth, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(safePdfText(L.tasksHeader, docLang), 14, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(203, 213, 225);
  doc.text(
    safePdfText(`${title}  |  ${L.statusDate}: ${new Date().toLocaleString(L.locale)}`, docLang),
    14,
    20
  );

  let y = 36;
  doc.setFillColor(30, 41, 59);
  doc.rect(14, y, pageWidth - 28, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(safePdfText(L.colTask, docLang), 17, y + 5.5);
  doc.text(safePdfText(L.colObject, docLang), 82, y + 5.5);
  doc.text(safePdfText(L.colCategory, docLang), 142, y + 5.5);
  doc.text(safePdfText(L.colDue, docLang), 184, y + 5.5);
  doc.text(safePdfText(L.colWorker, docLang), 214, y + 5.5);
  doc.text(safePdfText(L.colStatus, docLang), 255, y + 5.5);

  y += 9;
  doc.setFont('helvetica', 'normal');

  tasks.forEach((task, idx) => {
    if (y > 188) {
      doc.addPage();
      y = 18;
    }
    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(14, y - 1, pageWidth - 28, 8, 'F');
    }
    const obj = objects.find((o) => o.id === task.object_id);
    const worker = users.find((u) => u.id === task.assigned_to);
    const statusText =
      task.status === 'erledigt'
        ? L.statusClosed
        : task.status === 'in_bearbeitung'
          ? L.statusShiftActive
          : L.statusOpen;
    const catText = CATEGORY_LABELS[task.category]?.[docLang] ?? task.category;

    doc.setTextColor(15, 23, 42);
    const titlePrepared = prepareSmartText(doc, task.title.slice(0, 34), 62, 8.5, 'normal');
    renderSmartLines(doc, titlePrepared, 17, y + 4.5, 62, 8.5, 'normal', [15, 23, 42], 4.2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(safePdfText((obj?.name ?? '—').slice(0, 30), docLang), 82, y + 4.5);
    doc.text(safePdfText(catText.slice(0, 22), docLang), 142, y + 4.5);
    doc.text(formatDateDE(task.due_date), 184, y + 4.5);
    doc.text(safePdfText((worker?.name ?? L.unassigned).slice(0, 20), docLang), 214, y + 4.5);
    doc.text(safePdfText(statusText, docLang), 255, y + 4.5);

    doc.setDrawColor(226, 232, 240);
    doc.line(14, y + 7, pageWidth - 14, y + 7);
    y += 8;
  });

  doc.save(`Hausmeister_Aufgabenbericht_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// --- MODULE 1: Winterdienst & Streunachweis PDF ---
export function exportWinterLogPDF({
  log,
  obj,
  worker,
  docLang = 'DE',
}: {
  log: WinterLog;
  obj?: PropertyObject;
  worker?: User;
  docLang?: DocLanguageCode;
}): void {
  const L = PDF_LABELS[docLang] ?? PDF_LABELS.DE;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  drawBrandHeader(
    doc,
    L.winterSubtitle,
    `${L.protocolNo} ${log.id.slice(-6).toUpperCase()}`,
    `${L.date}: ${formatDateDE(log.start_time)}`,
    docLang
  );

  // Object & Weather Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(16, 42, pageWidth - 32, 46, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(safePdfText(L.managedObject, docLang), 22, 51);
  doc.text(safePdfText(L.address, docLang), 22, 58);
  doc.text(safePdfText(L.gpsCoords, docLang), 22, 65);
  doc.text(safePdfText(L.weatherTemp, docLang), 22, 72);
  doc.text(safePdfText(L.period, docLang), 22, 79);

  doc.setFont('helvetica', 'normal');
  doc.text(safePdfText(obj?.name ?? '—', docLang), 64, 51);
  doc.text(safePdfText(obj?.address ?? '—', docLang), 64, 58);
  doc.text(`${log.lat.toFixed(5)}, ${log.lng.toFixed(5)}`, 64, 65);
  doc.text(safePdfText(`${log.temp_celsius.toFixed(1)} °C · ${log.weather_desc}`, docLang), 64, 72);
  doc.text(
    safePdfText(
      `${formatDateTimeDE(log.start_time)} ${L.to} ${formatTimeDE(log.end_time)} ${L.oclock}`.trim(),
      docLang
    ),
    64,
    79
  );

  // Action & Material Box
  const actionsList = getWinterLogActions(log);
  const actionText = actionsList
    .map((act) => WINTER_ACTION_LABELS[act]?.[docLang] ?? act)
    .join(', ');
  const actionValueWidth = pageWidth - 16 - 76 - 4;
  const preparedAction = prepareSmartText(doc, actionText, actionValueWidth, 10, 'normal');
  const extraActionH = Math.max(0, preparedAction.lines.length - 1) * 5;
  const actionBoxHeight = 34 + extraActionH;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(16, 94, pageWidth - 32, actionBoxHeight, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(safePdfText(L.actionTaken, docLang), 22, 103);
  doc.text(safePdfText(L.materialUsed, docLang), 22, 111 + extraActionH);
  doc.text(safePdfText(L.crew, docLang), 22, 119 + extraActionH);

  renderSmartLines(
    doc,
    preparedAction,
    76,
    103,
    actionValueWidth,
    10,
    'normal',
    [15, 23, 42],
    5
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(`${log.salt_kg} kg`, 76, 111 + extraActionH);
  doc.text(
    safePdfText(
      worker ? `${worker.name} (${worker.employee_id})` : L.fieldStaff,
      docLang
    ),
    76,
    119 + extraActionH
  );

  const remarksBaseY = 136 + extraActionH;
  if (log.notes) {
    doc.setFont('helvetica', 'bold');
    doc.text(safePdfText(L.remarks, docLang), 16, remarksBaseY);
    const preparedNotes = prepareSmartText(doc, log.notes, pageWidth - 32, 9.5, 'normal');
    renderSmartLines(
      doc,
      { ...preparedNotes, lines: preparedNotes.lines.slice(0, 2) },
      16,
      remarksBaseY + 6,
      pageWidth - 32,
      9.5,
      'normal',
      [15, 23, 42],
      4.5
    );
  }

  // Photo Proof
  const photoStartY = 152 + extraActionH;
  let yAfterPhoto = photoStartY;
  if (log.photo?.dataUrl) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(safePdfText(L.photoProofTitle, docLang), 16, photoStartY);
    try {
      doc.addImage(log.photo.dataUrl, 'JPEG', 16, photoStartY + 4, 115, 68);
      yAfterPhoto = photoStartY + 80;
    } catch {
      doc.setFont('helvetica', 'normal');
      doc.text(safePdfText(L.photoEmbedErr, docLang), 16, photoStartY + 8);
      yAfterPhoto = photoStartY + 20;
    }
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 116, 139);
    doc.text(safePdfText(L.noPhotoAttached, docLang), 16, photoStartY + 4);
    yAfterPhoto = photoStartY + 18;
  }

  // Signature
  const sigY = Math.min(yAfterPhoto + 6, 250);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(safePdfText(L.winterSigTitle, docLang), 16, sigY);
  if (log.signature) {
    try {
      doc.addImage(log.signature, 'PNG', 16, sigY + 3, 60, 20);
    } catch {
      // ignore image add error
    }
  }
  doc.setDrawColor(148, 163, 184);
  doc.line(16, sigY + 25, 95, sigY + 25);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    safePdfText(
      `${L.signedBy}: ${worker?.name ?? L.fieldStaff} · ${formatDateTimeDE(log.end_time)}`,
      docLang
    ),
    16,
    sigY + 30
  );

  doc.save(
    `Streunachweis_${(obj?.name ?? 'Objekt').replace(/[^a-zA-Z0-9]/g, '_')}_${log.start_time.slice(0, 10)}.pdf`
  );
}

// --- MODULE 2: Zählerstand-Erfassung CSV / Excel Export ---
export function exportMeterReadingsCSV({
  readings,
  objects,
  users,
  docLang = 'DE',
}: {
  readings: MeterReading[];
  objects: PropertyObject[];
  users: User[];
  docLang?: DocLanguageCode;
}): void {
  const L = PDF_LABELS[docLang] ?? PDF_LABELS.DE;
  const headers = L.csvHeaders;

  const escapeCsv = (val: string | number) => {
    const str = String(val ?? '').replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = readings.map((r) => {
    const obj = objects.find((o) => o.id === r.object_id);
    const worker = users.find((u) => u.id === r.read_by);
    const diff = Number((r.reading_value - r.previous_value).toFixed(2));
    const meterTypeLabel = METER_TYPE_LABELS[r.meter_type]?.[docLang] ?? r.meter_type;
    return [
      obj?.name ?? r.object_id,
      obj?.address ?? '',
      r.apartment,
      r.meter_number,
      meterTypeLabel,
      formatDateTimeDE(r.read_date),
      String(r.previous_value).replace('.', ','),
      String(r.reading_value).replace('.', ','),
      String(diff).replace('.', ','),
      worker?.name ?? r.read_by,
      r.photo ? `${L.yes} (${formatDateTimeDE(r.photo.timestamp)})` : L.no,
    ]
      .map(escapeCsv)
      .join(';');
  });

  // UTF-8 BOM for clean Umlauts & diacritics in Microsoft Excel
  const csvContent = '\uFEFF' + [headers.map(escapeCsv).join(';'), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Zaehlerstaende_Nebenkosten_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// --- MODULE 3: Wohnungsübergabe-Protokoll PDF ---
export function exportHandoverProtocolPDF({
  protocol,
  obj,
  docLang = 'DE',
}: {
  protocol: HandoverProtocol;
  obj?: PropertyObject;
  docLang?: DocLanguageCode;
}): void {
  const L = PDF_LABELS[docLang] ?? PDF_LABELS.DE;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const typeLabel = HANDOVER_TYPE_LABELS[protocol.type]?.[docLang] ?? protocol.type;

  drawBrandHeader(
    doc,
    `${L.handoverSubtitle} (${typeLabel})`,
    `${L.unit}: ${protocol.apartment}`,
    `${L.date}: ${formatDateDE(protocol.created_at)}`,
    docLang
  );

  // Page 1: Stammdaten & Räume
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(16, 40, pageWidth - 32, 34, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(safePdfText(L.objectLabel, docLang), 21, 48);
  doc.text(safePdfText(L.handoverType, docLang), 21, 55);
  doc.text(safePdfText(L.landlord, docLang), 21, 62);
  doc.text(safePdfText(L.tenant, docLang), 21, 69);

  doc.setFont('helvetica', 'normal');
  const handoverObjDisplay =
    obj?.name &&
    obj?.address &&
    obj.name.trim().toLowerCase() === obj.address.trim().toLowerCase()
      ? obj.address
      : `${obj?.name ?? '—'}${obj?.address ? ` · ${obj.address}` : ''}`;
  doc.text(safePdfText(handoverObjDisplay, docLang), 56, 48);
  doc.text(safePdfText(`${typeLabel} · ${L.aptWord} ${protocol.apartment}`, docLang), 56, 55);
  doc.text(safePdfText(protocol.landlord_name, docLang), 56, 62);
  doc.text(
    safePdfText(`${protocol.tenant_name} (${protocol.tenant_email || L.noEmail})`, docLang),
    56,
    69
  );

  let y = 82;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(safePdfText(L.sec1Rooms, docLang), 16, y);
  y += 5;

  const drawRoomsTableHeader = (startY: number) => {
    doc.setFillColor(30, 41, 59);
    doc.rect(16, startY, pageWidth - 32, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(safePdfText(L.colRoom, docLang), 20, startY + 5.5);
    doc.text(safePdfText(L.colCondition, docLang), 72, startY + 5.5);
    doc.text(safePdfText(L.colFindings, docLang), 112, startY + 5.5);
  };

  drawRoomsTableHeader(y);
  y += 9;

  const getRoomCondLabel = (cond: 'Einwandfrei' | 'Mängel vorhanden') =>
    cond === 'Mängel vorhanden'
      ? docLang === 'EN'
        ? 'Defects Found'
        : docLang === 'HR'
          ? 'Nedostaci'
          : docLang === 'SQ'
            ? 'Ka mangësi'
            : 'Mängel vorhanden'
      : docLang === 'EN'
        ? 'Good Condition'
        : docLang === 'HR'
          ? 'Ispravno'
          : docLang === 'SQ'
            ? 'Pa të meta'
            : 'Einwandfrei';

  const photoTagSuffix = docLang === 'EN' ? ' [Photo attached]' : ' [Foto beigefügt]';

  protocol.rooms_json.forEach((r, idx) => {
    const roomName = ROOM_LABELS[r.room]?.[docLang] ?? r.room;
    const condLabel = getRoomCondLabel(r.condition);
    const notesBase = r.notes?.trim() || L.noDefects;
    const notesDisplay = r.photo?.dataUrl ? `${notesBase}${photoTagSuffix}` : notesBase;

    const preparedRoom = prepareSmartText(doc, roomName, 48, 9, 'bold');
    const preparedCond = prepareSmartText(doc, condLabel, 36, 9, 'normal');
    const preparedNotes = prepareSmartText(doc, notesDisplay, pageWidth - 16 - 112 - 2, 9, 'normal');

    const lineCount = Math.max(
      preparedRoom.lines.length,
      preparedCond.lines.length,
      preparedNotes.lines.length
    );
    const rowHeight = Math.max(10, lineCount * 4.4 + 4.5);

    if (y + rowHeight > 274) {
      doc.addPage();
      y = 20;
      drawRoomsTableHeader(y);
      y += 9;
    }

    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(16, y - 1, pageWidth - 32, rowHeight, 'F');
    }

    renderSmartLines(doc, preparedRoom, 20, y + 4.5, 48, 9, 'bold', [15, 23, 42], 4.4);

    const condColor: [number, number, number] =
      r.condition === 'Mängel vorhanden' ? [220, 38, 38] : [22, 163, 74];
    renderSmartLines(doc, preparedCond, 72, y + 4.5, 36, 9, 'normal', condColor, 4.4);

    renderSmartLines(
      doc,
      preparedNotes,
      112,
      y + 4.5,
      pageWidth - 16 - 112 - 2,
      9,
      'normal',
      [51, 65, 85],
      4.4
    );

    doc.setDrawColor(226, 232, 240);
    doc.line(16, y + rowHeight - 1.5, pageWidth - 16, y + rowHeight - 1.5);
    y += rowHeight;
  });

  // Page 2: Schlüssel, Zählerstände & Doppelte Unterschrift
  doc.addPage();
  drawBrandHeader(
    doc,
    L.handoverSubtitleP2,
    `${L.unit}: ${protocol.apartment}`,
    `${L.date}: ${formatDateDE(protocol.created_at)}`,
    docLang
  );

  y = 44;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(safePdfText(L.sec2Keys, docLang), 16, y);
  y += 6;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(16, y, pageWidth - 32, 24, 2, 2, 'FD');

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.text(safePdfText(`${L.keyFront}: ${protocol.keys_json.haustuer}x`, docLang), 22, y + 9);
  doc.text(safePdfText(`${L.keyApt}: ${protocol.keys_json.wohnungstuer}x`, docLang), 64, y + 9);
  doc.text(safePdfText(`${L.keyMail}: ${protocol.keys_json.briefkasten}x`, docLang), 114, y + 9);
  doc.text(safePdfText(`${L.keyCellar}: ${protocol.keys_json.keller}x`, docLang), 22, y + 18);
  doc.text(safePdfText(`${L.keyGarage}: ${protocol.keys_json.garage}x`, docLang), 64, y + 18);

  y += 34;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(safePdfText(L.sec3Meters, docLang), 16, y);
  y += 6;

  protocol.meters_json.forEach((m) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(safePdfText(`${m.label}:`, docLang), 20, y + 4);
    doc.setFont('helvetica', 'normal');
    doc.text(
      safePdfText(
        `${L.meterNoPrefix} ${m.meter_number || '—'}  |  ${L.readingPrefix} ${m.value || '—'}`,
        docLang
      ),
      64,
      y + 4
    );
    doc.setDrawColor(226, 232, 240);
    doc.line(16, y + 7, pageWidth - 16, y + 7);
    y += 9;
  });

  // Signatures
  y = Math.max(y + 18, 175);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(safePdfText(L.sec4Signatures, docLang), 16, y);

  y += 8;
  if (protocol.signature_landlord) {
    try {
      doc.addImage(protocol.signature_landlord, 'PNG', 16, y, 65, 24);
    } catch {
      // ignore
    }
  }
  if (protocol.signature_tenant) {
    try {
      doc.addImage(protocol.signature_tenant, 'PNG', 114, y, 65, 24);
    } catch {
      // ignore
    }
  }

  doc.setDrawColor(148, 163, 184);
  doc.line(16, y + 27, 92, y + 27);
  doc.line(114, y + 27, pageWidth - 16, y + 27);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(safePdfText(`${L.sigLandlordLbl} (${protocol.landlord_name})`, docLang), 16, y + 32);
  doc.text(safePdfText(`${L.sigTenantLbl} (${protocol.tenant_name})`, docLang), 114, y + 32);

  // Page 3+: Room Photo Documentation (all compressed photos from default + newly added rooms)
  const roomsWithPhotos = protocol.rooms_json.filter((r) => Boolean(r.photo?.dataUrl));
  if (roomsWithPhotos.length > 0) {
    doc.addPage();
    drawBrandHeader(
      doc,
      L.secRoomsPhotos,
      `${L.unit}: ${protocol.apartment}`,
      `${L.date}: ${formatDateDE(protocol.created_at)}`,
      docLang
    );

    let photoY = 44;
    const imgWidth = 84;
    const imgHeight = 54;
    const colGap = 10;

    for (let i = 0; i < roomsWithPhotos.length; i += 2) {
      if (photoY + imgHeight + 22 > 282) {
        doc.addPage();
        photoY = 20;
      }

      for (let col = 0; col < 2; col++) {
        const roomItem = roomsWithPhotos[i + col];
        if (!roomItem?.photo?.dataUrl) continue;

        const x = 16 + col * (imgWidth + colGap);
        const roomName = ROOM_LABELS[roomItem.room]?.[docLang] ?? roomItem.room;
        const condLabel = getRoomCondLabel(roomItem.condition);

        const titlePrepared = prepareSmartText(
          doc,
          `${roomName} (${condLabel})`,
          imgWidth,
          9,
          'bold'
        );
        renderSmartLines(
          doc,
          titlePrepared,
          x,
          photoY,
          imgWidth,
          9,
          'bold',
          roomItem.condition === 'Mängel vorhanden' ? [220, 38, 38] : [15, 23, 42],
          4.2
        );

        const imgTopY = photoY + 3.5;
        const fmt = roomItem.photo.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        try {
          doc.addImage(roomItem.photo.dataUrl, fmt, x, imgTopY, imgWidth, imgHeight);
        } catch {
          doc.setDrawColor(203, 213, 225);
          doc.rect(x, imgTopY, imgWidth, imgHeight);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(100, 116, 139);
          doc.text(safePdfText(L.photoEmbedErr, docLang), x + 3, imgTopY + imgHeight / 2);
        }

        const metaText =
          typeof roomItem.photo.lat === 'number' && typeof roomItem.photo.lng === 'number'
            ? `${formatDateTimeDE(roomItem.photo.timestamp)} | ${roomItem.photo.lat.toFixed(5)}, ${roomItem.photo.lng.toFixed(5)}`
            : formatDateTimeDE(roomItem.photo.timestamp);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        doc.text(safePdfText(metaText, docLang), x, imgTopY + imgHeight + 4.5);

        if (roomItem.notes?.trim()) {
          const notePrepared = prepareSmartText(
            doc,
            roomItem.notes.trim(),
            imgWidth,
            8,
            'normal'
          );
          renderSmartLines(
            doc,
            { ...notePrepared, lines: notePrepared.lines.slice(0, 2) },
            x,
            imgTopY + imgHeight + 9.5,
            imgWidth,
            8,
            'normal',
            [51, 65, 85],
            3.8
          );
        }
      }

      photoY += imgHeight + 24;
    }
  }

  doc.save(
    `Uebergabeprotokoll_${protocol.type}_${protocol.apartment.replace(/[^\p{L}\p{N}_-]+/gu, '_')}.pdf`
  );
}

// --- MODULE 4: Gebäudereinigung Reinigungsnachweis PDF ---
export function exportCleaningReportPDF({
  logs,
  obj,
  users,
  docLang = 'DE',
}: {
  logs: CleaningLog[];
  obj?: PropertyObject;
  users: User[];
  docLang?: DocLanguageCode;
}): void {
  const L = PDF_LABELS[docLang] ?? PDF_LABELS.DE;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  drawBrandHeader(
    doc,
    L.cleaningSubtitle,
    obj?.name ?? L.allObjects,
    `${L.statusDate}: ${new Date().toLocaleDateString(L.locale)}`,
    docLang
  );

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(safePdfText(`${L.objectAddress}: ${obj?.address ?? L.portfolioAll}`, docLang), 16, 42);
  doc.text(safePdfText(`${L.clientLabel}: ${obj?.client_name ?? L.propertyMgmt}`, docLang), 16, 48);

  let y = 58;
  doc.setFillColor(30, 41, 59);
  doc.rect(16, y, pageWidth - 32, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(safePdfText(L.colScanTime, docLang), 19, y + 5.5);
  doc.text(safePdfText(L.colQrPoint, docLang), 56, y + 5.5);
  doc.text(safePdfText(L.colWorker, docLang), 96, y + 5.5);
  doc.text(safePdfText(L.colCheckpoints, docLang), 136, y + 5.5);
  doc.text(safePdfText(L.colStatus, docLang), 166, y + 5.5);
  y += 9;

  doc.setFont('helvetica', 'normal');
  logs.forEach((log, idx) => {
    if (y > 268) {
      doc.addPage();
      y = 20;
    }
    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(16, y - 1, pageWidth - 32, 8, 'F');
    }
    const worker = users.find((u) => u.id === log.user_id);
    const done = log.checklist_json.filter((c) => c.checked).length;

    doc.setTextColor(15, 23, 42);
    doc.text(formatDateTimeDE(log.scan_timestamp), 19, y + 4.5);
    doc.text(log.qr_code_id.slice(0, 18), 56, y + 4.5);
    doc.text(safePdfText((worker?.name ?? '—').slice(0, 18), docLang), 96, y + 4.5);
    doc.text(safePdfText(`${done}/${log.checklist_json.length} ${L.doneWord}`, docLang), 136, y + 4.5);
    doc.text(safePdfText(log.status, docLang), 166, y + 4.5);

    doc.setDrawColor(226, 232, 240);
    doc.line(16, y + 7, pageWidth - 16, y + 7);
    y += 8;
  });

  doc.save(
    `Reinigungsnachweis_${(obj?.name ?? 'Objekte').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
  );
}

// --- MODULE 5: Garten- & Grünflächenpflege Monatlicher Leistungsnachweis PDF ---
export function exportGardenBillingPDF({
  logs,
  obj,
  users,
  docLang = 'DE',
}: {
  logs: GardenLog[];
  obj?: PropertyObject;
  users: User[];
  docLang?: DocLanguageCode;
}): void {
  const L = PDF_LABELS[docLang] ?? PDF_LABELS.DE;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  drawBrandHeader(
    doc,
    L.gardenSubtitle,
    obj?.name ?? L.portfolioWord,
    `${L.statusDate}: ${new Date().toLocaleDateString(L.locale)}`,
    docLang
  );

  let totalMinutes = 0;
  let totalDuenger = 0;
  let totalSamen = 0;
  let totalMulch = 0;
  let totalWaste = 0;

  logs.forEach((l) => {
    totalMinutes += l.duration_minutes;
    totalDuenger += l.materials_json.duenger_kg;
    totalSamen += l.materials_json.rasensamen_kg;
    totalMulch += l.materials_json.rindenmulch_saecke;
    totalWaste += l.waste_volume;
  });

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(16, 40, pageWidth - 32, 28, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(safePdfText(`${L.objectLabel} ${obj?.name ?? L.allObjectsWord}`, docLang), 21, 48);
  doc.setFont('helvetica', 'normal');
  doc.text(
    safePdfText(
      `${L.jobsTotal}: ${logs.length}  |  ${L.workTime}: ${formatMinutesAsHoursDE(totalMinutes)}`,
      docLang
    ),
    21,
    55
  );
  doc.text(
    safePdfText(
      `${L.billableMaterial}: ${L.fertilizerWord} ${totalDuenger} kg · ${L.seedWord} ${totalSamen} kg · ${L.mulchWord} ${totalMulch} · ${L.greenWasteWord} ${totalWaste.toFixed(1)} m3`,
      docLang
    ),
    21,
    62
  );

  let y = 78;
  doc.setFillColor(30, 41, 59);
  doc.rect(16, y, pageWidth - 32, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(safePdfText(L.date, docLang), 19, y + 5.5);
  doc.text(safePdfText(L.colDuration, docLang), 44, y + 5.5);
  doc.text(safePdfText(L.colTasks, docLang), 66, y + 5.5);
  doc.text(safePdfText(L.colMatWaste, docLang), 140, y + 5.5);
  doc.text(safePdfText(L.colWorker, docLang), 175, y + 5.5);
  y += 9;

  doc.setFont('helvetica', 'normal');
  logs.forEach((log, idx) => {
    if (y > 265) {
      doc.addPage();
      y = 20;
    }
    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(16, y - 1, pageWidth - 32, 9, 'F');
    }
    const worker = users.find((u) => u.id === log.user_id);
    const matSummary = `${log.materials_json.duenger_kg}kg D / ${log.materials_json.rindenmulch_saecke}S M / ${log.waste_volume}m3`;

    doc.setTextColor(15, 23, 42);
    doc.text(formatDateDE(log.date), 19, y + 4.5);
    doc.text(`${log.duration_minutes} ${L.minUnit}`, 44, y + 4.5);
    doc.text(safePdfText(log.tasks_json.join(', ').slice(0, 38) || '—', docLang), 66, y + 4.5);
    doc.text(matSummary, 140, y + 4.5);
    doc.text(safePdfText((worker?.name ?? '—').split(' ')[0], docLang), 175, y + 4.5);

    doc.setDrawColor(226, 232, 240);
    doc.line(16, y + 7.5, pageWidth - 16, y + 7.5);
    y += 9;
  });

  doc.save(
    `Leistungsnachweis_Garten_${(obj?.name ?? 'Objekte').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
  );
}

function sanitizeHelveticaText(input: string): string {
  return input
    .replace(/č/g, 'c')
    .replace(/Č/g, 'C')
    .replace(/ć/g, 'c')
    .replace(/Ć/g, 'C')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/š/g, 's')
    .replace(/Š/g, 'S')
    .replace(/ž/g, 'z')
    .replace(/Ž/g, 'Z')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .replace(/ą/g, 'a')
    .replace(/Ą/g, 'A')
    .replace(/ę/g, 'e')
    .replace(/Ę/g, 'E')
    .replace(/ń/g, 'n')
    .replace(/Ń/g, 'N')
    .replace(/ś/g, 's')
    .replace(/Ś/g, 'S')
    .replace(/ź/g, 'z')
    .replace(/Ź/g, 'Z')
    .replace(/ż/g, 'z')
    .replace(/Ż/g, 'Z')
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'G')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 'S')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I');
}

const NON_LATIN1_RE = /[^\u0000-\u00FF]/;
const PDF_PX_PER_MM = 3.779527559 * 3;

interface PreparedSmartText {
  isUnicode: boolean;
  lines: string[];
}

function getSmartFontCss(fontSizePx: number, fontStyle: 'normal' | 'bold' | 'italic'): string {
  const weight = fontStyle === 'bold' ? '700' : fontStyle === 'italic' ? 'italic 400' : '400';
  return `${weight} ${fontSizePx}px "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
}

function wrapCanvasTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidthPx: number
): string[] {
  const paragraphs = text.split(/\r?\n/);
  const lines: string[] = [];
  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push('');
      continue;
    }
    const words = para.split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidthPx || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines.length > 0 ? lines : [''];
}

function prepareSmartText(
  doc: jsPDF,
  text: string,
  maxWidthMm: number,
  fontSizePt: number,
  fontStyle: 'normal' | 'bold' | 'italic'
): PreparedSmartText {
  if (!NON_LATIN1_RE.test(text) || typeof document === 'undefined') {
    doc.setFont('helvetica', fontStyle);
    doc.setFontSize(fontSizePt);
    const asciiLines = doc.splitTextToSize(sanitizeHelveticaText(text), maxWidthMm) as string[];
    return { isUnicode: false, lines: asciiLines.length > 0 ? asciiLines : [''] };
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    doc.setFont('helvetica', fontStyle);
    doc.setFontSize(fontSizePt);
    return { isUnicode: false, lines: doc.splitTextToSize(text, maxWidthMm) as string[] };
  }

  const fontSizeMm = (fontSizePt * 25.4) / 72;
  const fontSizePx = fontSizeMm * PDF_PX_PER_MM;
  ctx.font = getSmartFontCss(fontSizePx, fontStyle);
  const lines = wrapCanvasTextLines(ctx, text, maxWidthMm * PDF_PX_PER_MM);
  return { isUnicode: true, lines };
}

function renderSmartLines(
  doc: jsPDF,
  prepared: PreparedSmartText,
  xMm: number,
  baselineYMm: number,
  maxWidthMm: number,
  fontSizePt: number,
  fontStyle: 'normal' | 'bold' | 'italic',
  colorRgb: [number, number, number],
  lineHeightMm: number
): void {
  if (!prepared.isUnicode || typeof document === 'undefined') {
    doc.setFont('helvetica', fontStyle);
    doc.setFontSize(fontSizePt);
    doc.setTextColor(colorRgb[0], colorRgb[1], colorRgb[2]);
    doc.text(prepared.lines, xMm, baselineYMm);
    return;
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    doc.setFont('helvetica', fontStyle);
    doc.setFontSize(fontSizePt);
    doc.setTextColor(colorRgb[0], colorRgb[1], colorRgb[2]);
    doc.text(prepared.lines, xMm, baselineYMm);
    return;
  }

  const fontSizeMm = (fontSizePt * 25.4) / 72;
  const fontSizePx = fontSizeMm * PDF_PX_PER_MM;
  const lineHeightPx = lineHeightMm * PDF_PX_PER_MM;
  const widthPx = Math.max(1, Math.ceil(maxWidthMm * PDF_PX_PER_MM));
  const baselineOffsetPx = fontSizePx * 0.9;
  const heightPx = Math.max(
    1,
    Math.ceil((prepared.lines.length - 1) * lineHeightPx + fontSizePx * 1.25)
  );

  canvas.width = widthPx;
  canvas.height = heightPx;

  ctx.clearRect(0, 0, widthPx, heightPx);
  ctx.font = getSmartFontCss(fontSizePx, fontStyle);
  ctx.fillStyle = `rgb(${colorRgb[0]}, ${colorRgb[1]}, ${colorRgb[2]})`;
  ctx.textBaseline = 'alphabetic';

  prepared.lines.forEach((line, idx) => {
    ctx.fillText(line, 0, baselineOffsetPx + idx * lineHeightPx);
  });

  const dataUrl = canvas.toDataURL('image/png');
  const heightMm = heightPx / PDF_PX_PER_MM;
  doc.addImage(dataUrl, 'PNG', xMm, baselineYMm - fontSizeMm * 0.9, maxWidthMm, heightMm);
}

export function exportTaskProtocolPDF({
  task,
  obj,
  worker,
  docLang = 'DE',
}: {
  task: FacilityTask;
  obj?: PropertyObject;
  worker?: User;
  docLang?: DocLanguageCode;
}): void {
  const L = PDF_LABELS[docLang] ?? PDF_LABELS.DE;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  const generatedAt = new Date();
  const generatedLabel = `${generatedAt.toLocaleDateString('de-DE')} ${generatedAt.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })}`;

  const txt = (val: string) => sanitizeHelveticaText(safePdfText(val, docLang));

  const labels =
    docLang === 'EN'
      ? {
          subtitle: 'LEISTUNGSNACHWEIS / EINSATZPROTOKOLL (Service Record)',
          orderId: 'Order ID:',
          generated: 'Generated:',
          object: 'Property:',
          address: 'Address:',
          objectCoords: 'Property GPS:',
          category: 'Category:',
          status: 'Status:',
          worker: 'Employee:',
          createdAt: 'Erstellt am:',
          dueAt: 'Due at:',
          completedAt: 'Erledigt am:',
          notCompleted: 'Not yet completed',
          completedGps: 'GPS-Standort bei Abschluss:',
          gpsMissing: 'Not available (GPS permission denied or offline)',
          taskTitle: 'Task:',
          binTypes: 'Bin Types:',
          description: 'Description:',
          checklist: 'Checklist:',
          closingNotes: 'Abschlussnotiz:',
          photosTitle: 'Fotodokumentation:',
          noPhotos: 'No proof photos uploaded.',
          photoErr: 'Proof photo saved (image could not be embedded).',
          sigWorker: 'Unterschrift Mitarbeiter',
          sigClient: 'Unterschrift Auftraggeber',
          legalClause:
            'Elektronischer Leistungsnachweis gemäß Verkehrssicherungspflicht · Digital verification record',
        }
      : {
          subtitle: 'LEISTUNGSNACHWEIS / EINSATZPROTOKOLL',
          orderId: 'Auftrags-ID:',
          generated: 'Erstellt / Druck:',
          object: 'Objekt:',
          address: 'Adresse:',
          objectCoords: 'Objekt-Koordinaten:',
          category: 'Kategorie:',
          status: 'Status / Priorität:',
          worker: 'Mitarbeiter:',
          createdAt: 'Erstellt am:',
          dueAt: 'Fällig am:',
          completedAt: 'Erledigt am:',
          notCompleted: 'Noch nicht abgeschlossen',
          completedGps: 'GPS-Standort bei Abschluss:',
          gpsMissing: 'Nicht verfügbar (GPS nicht freigegeben oder kein Signal)',
          taskTitle: 'Aufgabe:',
          binTypes: 'Tonnenarten:',
          description: 'Beschreibung:',
          checklist: 'Checkliste:',
          closingNotes: 'Abschlussnotiz:',
          photosTitle: 'Fotodokumentation:',
          noPhotos: 'Keine Nachweisfotos hochgeladen.',
          photoErr: 'Nachweisfoto vorhanden (Bildformat nicht direkt einbettbar).',
          sigWorker: 'Datum / Unterschrift Mitarbeiter',
          sigClient: 'Datum / Unterschrift Auftraggeber',
          legalClause: 'Elektronischer Leistungsnachweis gemäß Verkehrssicherungspflicht',
        };

  drawBrandHeader(
    doc,
    labels.subtitle,
    `${labels.orderId} ${task.id}`,
    `${labels.generated} ${generatedLabel}`,
    docLang
  );

  const objectName = obj?.name ?? (task.address || '—');
  const fullAddress = obj?.address ?? task.address ?? '—';
  const objLat = obj?.lat ?? task.lat;
  const objLng = obj?.lng ?? task.lng;
  const objCoordsStr =
    typeof objLat === 'number' &&
    typeof objLng === 'number' &&
    Number.isFinite(objLat) &&
    Number.isFinite(objLng) &&
    !(objLat === 0 && objLng === 0)
      ? `${objLat.toFixed(6)}, ${objLng.toFixed(6)}`
      : '—';

  const statusText =
    task.status === 'erledigt'
      ? docLang === 'EN'
        ? 'Completed'
        : 'Erledigt'
      : task.status === 'in_bearbeitung'
        ? docLang === 'EN'
          ? 'In Progress'
          : 'In Bearbeitung'
        : docLang === 'EN'
          ? 'Open'
          : 'Offen';
  const prioText =
    task.priority === 'dringend'
      ? docLang === 'EN'
        ? 'Urgent'
        : 'Dringend'
      : task.priority === 'hoch'
        ? docLang === 'EN'
          ? 'High'
          : 'Hoch'
        : 'Normal';
  const categoryText = CATEGORY_LABELS[task.category]?.[docLang] ?? task.category;
  const workerText = worker ? `${worker.name} (${worker.employee_id})` : L.unassigned;

  // Box 1: Object & Order Metadata
  let y = 40;
  const addrLines = doc.splitTextToSize(txt(fullAddress), contentWidth - 46);
  const box1Height = Math.max(46, 39 + Math.max(1, addrLines.length) * 5);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, box1Height, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9.5);

  let rowY = y + 7.5;
  const labelX = margin + 5;
  const valueX = margin + 45;

  const drawMetaRow = (label: string, value: string | string[]) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 65, 85);
    doc.text(txt(label), labelX, rowY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    if (Array.isArray(value)) {
      doc.text(value, valueX, rowY);
      rowY += Math.max(1, value.length) * 5 + 1.5;
    } else {
      doc.text(txt(value), valueX, rowY);
      rowY += 6.5;
    }
  };

  drawMetaRow(labels.orderId, task.id);
  drawMetaRow(labels.object, objectName);
  drawMetaRow(labels.address, addrLines);
  drawMetaRow(labels.objectCoords, objCoordsStr);
  drawMetaRow(labels.category, `${categoryText}  |  ${statusText} (${prioText})`);
  drawMetaRow(labels.worker, workerText);

  y += box1Height + 5;

  // Box 2: Timestamps & Worker Completion GPS Audit
  const createdStr = task.created_at ? formatDateTimeDE(task.created_at) : '—';
  const dueStr = task.due_date ? formatDateTimeDE(task.due_date) : '—';
  const completedStr = task.completed_at ? formatDateTimeDE(task.completed_at) : labels.notCompleted;
  const completionGpsStr =
    typeof task.completed_lat === 'number' &&
    typeof task.completed_lng === 'number' &&
    Number.isFinite(task.completed_lat) &&
    Number.isFinite(task.completed_lng)
      ? `${task.completed_lat.toFixed(6)}, ${task.completed_lng.toFixed(6)}${
          typeof task.completed_accuracy === 'number'
            ? ` (+/- ${Math.round(task.completed_accuracy)} m)`
            : ''
        }`
      : labels.gpsMissing;

  const gpsLines = doc.splitTextToSize(txt(completionGpsStr), contentWidth - 58);
  const box2Height = 27 + Math.max(1, gpsLines.length) * 5;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, contentWidth, box2Height, 2, 2, 'FD');

  let auditY = y + 7.5;
  const auditValX = margin + 56;
  doc.setFontSize(9.5);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text(txt(labels.createdAt), labelX, auditY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(`${createdStr}   (${labels.dueAt} ${dueStr})`, auditValX, auditY);
  auditY += 6.5;

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text(txt(labels.completedAt), labelX, auditY);
  doc.setFont('helvetica', task.completed_at ? 'bold' : 'normal');
  doc.setTextColor(task.completed_at ? 5 : 100, task.completed_at ? 150 : 116, task.completed_at ? 105 : 139);
  doc.text(txt(completedStr), auditValX, auditY);
  auditY += 6.5;

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text(txt(labels.completedGps), labelX, auditY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(gpsLines, auditValX, auditY);

  y += box2Height + 7;

  const ensurePageSpace = (neededMm: number) => {
    if (y + neededMm > pageHeight - 24) {
      doc.addPage();
      y = 18;
    }
  };

  // Section 3: Task Details, Checklist & Closing Notes
  const preparedTitle = prepareSmartText(
    doc,
    `${labels.taskTitle} ${task.title}`,
    contentWidth,
    10.5,
    'bold'
  );
  ensurePageSpace(preparedTitle.lines.length * 5.5 + 8);
  renderSmartLines(
    doc,
    preparedTitle,
    margin,
    y,
    contentWidth,
    10.5,
    'bold',
    [15, 23, 42],
    5.5
  );
  y += preparedTitle.lines.length * 5.5 + 3;

  if (task.bin_types && task.bin_types.length > 0) {
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 65, 85);
    const binLine = `${labels.binTypes} ${task.bin_types.join(', ')}`;
    ensurePageSpace(7);
    doc.text(txt(binLine), margin, y);
    y += 6;
  }

  if (task.description?.trim()) {
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 65, 85);
    ensurePageSpace(12);
    doc.text(txt(labels.description), margin, y);
    y += 5;
    const preparedDesc = prepareSmartText(
      doc,
      task.description.trim(),
      contentWidth,
      9.5,
      'normal'
    );
    ensurePageSpace(preparedDesc.lines.length * 4.8 + 4);
    renderSmartLines(
      doc,
      preparedDesc,
      margin,
      y,
      contentWidth,
      9.5,
      'normal',
      [15, 23, 42],
      4.8
    );
    y += preparedDesc.lines.length * 4.8 + 4;
  }

  if (task.checklist_json && task.checklist_json.length > 0) {
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 65, 85);
    ensurePageSpace(10);
    doc.text(txt(labels.checklist), margin, y);
    y += 5;
    task.checklist_json.forEach((item) => {
      const checkLine = `${item.checked ? '[x]' : '[ ]'} ${item.label}`;
      const preparedCheck = prepareSmartText(doc, checkLine, contentWidth - 4, 9, 'normal');
      ensurePageSpace(preparedCheck.lines.length * 4.4 + 2);
      const checkColor: [number, number, number] = item.checked ? [5, 150, 105] : [51, 65, 85];
      renderSmartLines(
        doc,
        preparedCheck,
        margin + 2,
        y,
        contentWidth - 4,
        9,
        'normal',
        checkColor,
        4.4
      );
      y += preparedCheck.lines.length * 4.4 + 1.2;
    });
    y += 3;
  }

  // Closing notes
  const notesText = task.notes?.trim() ? task.notes.trim() : '—';
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  ensurePageSpace(14);
  doc.text(txt(labels.closingNotes), margin, y);
  y += 5;
  const preparedNotes = prepareSmartText(doc, notesText, contentWidth, 9.5, 'normal');
  ensurePageSpace(preparedNotes.lines.length * 4.8 + 6);
  renderSmartLines(
    doc,
    preparedNotes,
    margin,
    y,
    contentWidth,
    9.5,
    'normal',
    [15, 23, 42],
    4.8
  );
  y += preparedNotes.lines.length * 4.8 + 6;

  // Section 4: Photo Documentation
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  ensurePageSpace(12);
  doc.text(txt(`${labels.photosTitle} (${task.photos.length})`), margin, y);
  y += 5;

  if (task.photos.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(txt(labels.noPhotos), margin, y + 2);
    y += 10;
  } else {
    const imgWidth = 84;
    const imgHeight = 52;
    const colGap = 10;

    for (let i = 0; i < task.photos.length; i += 2) {
      ensurePageSpace(imgHeight + 14);
      for (let col = 0; col < 2; col++) {
        const photo = task.photos[i + col];
        if (!photo) continue;
        const x = margin + col * (imgWidth + colGap);
        const fmt = photo.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        try {
          doc.addImage(photo.dataUrl, fmt, x, y, imgWidth, imgHeight);
        } catch {
          doc.setDrawColor(203, 213, 225);
          doc.rect(x, y, imgWidth, imgHeight);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(100, 116, 139);
          doc.text(txt(labels.photoErr), x + 3, y + imgHeight / 2);
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        const photoMeta =
          typeof photo.lat === 'number' && typeof photo.lng === 'number'
            ? `${formatDateTimeDE(photo.timestamp)} | ${photo.lat.toFixed(5)}, ${photo.lng.toFixed(5)}`
            : formatDateTimeDE(photo.timestamp);
        doc.text(txt(photoMeta), x, y + imgHeight + 4);
      }
      y += imgHeight + 11;
    }
  }

  // Section 5: Signature Lines & Legal Footer
  const footerHeight = 46;
  if (y + footerHeight > pageHeight - 10) {
    doc.addPage();
    y = 20;
  }
  const sigBaseY = Math.max(y + 8, pageHeight - 48);

  if (task.signature) {
    try {
      doc.addImage(task.signature, 'PNG', margin, sigBaseY - 2, 54, 18);
    } catch {
      // ignore signature embed error
    }
  }

  const lineY = sigBaseY + 18;
  doc.setDrawColor(148, 163, 184);
  doc.line(margin, lineY, margin + 78, lineY);
  doc.line(margin + 96, lineY, pageWidth - margin, lineY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(txt(labels.sigWorker), margin, lineY + 4.5);
  if (worker?.name) {
    doc.setFontSize(7.5);
    doc.text(txt(worker.name), margin, lineY + 8.5);
  }
  doc.setFontSize(8.5);
  doc.text(txt(labels.sigClient), margin + 96, lineY + 4.5);

  // Legal Clause Footer Box
  const legalY = lineY + 15;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, legalY - 3.5, pageWidth - margin, legalY - 3.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(txt(labels.legalClause), pageWidth / 2, legalY + 1, { align: 'center' });

  const datePart = (task.completed_at || task.due_date || new Date().toISOString()).slice(0, 10);
  const rawPropertyLabel = obj?.name || task.address || task.title || 'Objekt';
  const safePropertyName =
    rawPropertyLabel
      .trim()
      .replace(/[^\p{L}\p{N}_-]+/gu, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 45) || 'Objekt';

  doc.save(`Aufgabe_${safePropertyName}_${datePart}.pdf`);
}

