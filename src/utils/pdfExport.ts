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
    doc.text(safePdfText(task.title.slice(0, 34), docLang), 17, y + 4.5);
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
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(16, 94, pageWidth - 32, 34, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.text(safePdfText(L.actionTaken, docLang), 22, 103);
  doc.text(safePdfText(L.materialUsed, docLang), 22, 111);
  doc.text(safePdfText(L.crew, docLang), 22, 119);

  const actionText = WINTER_ACTION_LABELS[log.action_type]?.[docLang] ?? log.action_type;
  doc.setFont('helvetica', 'normal');
  doc.text(safePdfText(actionText, docLang), 76, 103);
  doc.text(`${log.salt_kg} kg`, 76, 111);
  doc.text(
    safePdfText(
      worker ? `${worker.name} (${worker.employee_id})` : L.fieldStaff,
      docLang
    ),
    76,
    119
  );

  if (log.notes) {
    doc.setFont('helvetica', 'bold');
    doc.text(safePdfText(L.remarks, docLang), 16, 136);
    doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(safePdfText(log.notes, docLang), pageWidth - 32), 16, 142);
  }

  // Photo Proof
  let yAfterPhoto = 152;
  if (log.photo?.dataUrl) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(safePdfText(L.photoProofTitle, docLang), 16, 152);
    try {
      doc.addImage(log.photo.dataUrl, 'JPEG', 16, 156, 115, 68);
      yAfterPhoto = 232;
    } catch {
      doc.setFont('helvetica', 'normal');
      doc.text(safePdfText(L.photoEmbedErr, docLang), 16, 160);
      yAfterPhoto = 172;
    }
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 116, 139);
    doc.text(safePdfText(L.noPhotoAttached, docLang), 16, 156);
    yAfterPhoto = 170;
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
  doc.text(safePdfText(`${obj?.name ?? '—'} · ${obj?.address ?? ''}`, docLang), 56, 48);
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

  doc.setFillColor(30, 41, 59);
  doc.rect(16, y, pageWidth - 32, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text(safePdfText(L.colRoom, docLang), 20, y + 5.5);
  doc.text(safePdfText(L.colCondition, docLang), 72, y + 5.5);
  doc.text(safePdfText(L.colFindings, docLang), 112, y + 5.5);
  y += 9;

  doc.setFont('helvetica', 'normal');
  protocol.rooms_json.forEach((r, idx) => {
    if (y > 260) {
      doc.addPage();
      y = 20;
    }
    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(16, y - 1, pageWidth - 32, 10, 'F');
    }
    const roomName = ROOM_LABELS[r.room]?.[docLang] ?? r.room;
    const condLabel =
      r.condition === 'Mängel vorhanden'
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

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(safePdfText(roomName, docLang), 20, y + 5);
    doc.setFont('helvetica', 'normal');
    if (r.condition === 'Mängel vorhanden') {
      doc.setTextColor(220, 38, 38);
    } else {
      doc.setTextColor(22, 163, 74);
    }
    doc.text(safePdfText(condLabel, docLang), 72, y + 5);
    doc.setTextColor(51, 65, 85);
    doc.text(safePdfText((r.notes || L.noDefects).slice(0, 48), docLang), 112, y + 5);

    doc.setDrawColor(226, 232, 240);
    doc.line(16, y + 8.5, pageWidth - 16, y + 8.5);
    y += 10;
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

  doc.save(
    `Uebergabeprotokoll_${protocol.type}_${protocol.apartment.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
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
