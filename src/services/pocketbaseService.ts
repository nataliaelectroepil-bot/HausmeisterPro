import {
  AppNotification,
  BinSchedule,
  CleaningLog,
  DocLanguageCode,
  FacilityTask,
  GardenLog,
  HandoverProtocol,
  LanguageCode,
  MeterReading,
  PropertyObject,
  TaskLocalizedContent,
  TaskPhoto,
  TimeEntry,
  User,
  WinterLog,
} from '../types/facility';
import { getISOWeekAndYear, getWeekStartEnd } from '../utils/dateUtils';
import { normalizeBinTypes } from '../utils/binMeta';
import { compressTaskPhotoIfNeeded } from '../utils/photoWatermark';

const STORAGE_KEYS = {
  users: 'hmpro_pb_users_v1',
  objects: 'hmpro_pb_objects_v1',
  tasks: 'hmpro_pb_tasks_v1',
  bins: 'hmpro_pb_bins_v1',
  timeEntries: 'hmpro_pb_time_v1',
  notifications: 'hmpro_pb_notifications_v1',
  currentUserId: 'hmpro_pb_current_user_v1',
  uiLanguage: 'hmpro_ui_lang_v1',
  docLanguage: 'hmpro_doc_lang_v1',
  winterLogs: 'hmpro_pb_winter_logs_v1',
  meterReadings: 'hmpro_pb_meter_readings_v1',
  handoverProtocols: 'hmpro_pb_handover_protocols_v1',
  cleaningLogs: 'hmpro_pb_cleaning_logs_v1',
  gardenLogs: 'hmpro_pb_garden_logs_v1',
};

export const pocketbaseConfig = {
  baseUrl: (import.meta.env.VITE_POCKETBASE_URL as string | undefined) || '',
  collections: {
    users: 'users',
    objects: 'objects',
    tasks: 'tasks',
    bin_schedules: 'bin_schedules',
    time_entries: 'time_entries',
    winter_logs: 'winter_logs',
    meter_readings: 'meter_readings',
    handover_protocols: 'handover_protocols',
    cleaning_logs: 'cleaning_logs',
    garden_logs: 'garden_logs',
  },
};

const AUTH_STORAGE_KEY = 'hmpro_pb_auth_v1';

interface PersistedAuthState {
  token: string;
  model: User | null;
}

function readPersistedAuth(): PersistedAuthState {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return { token: '', model: null };
    const parsed = JSON.parse(raw) as Partial<PersistedAuthState>;
    return {
      token: typeof parsed.token === 'string' ? parsed.token : '',
      model: parsed.model && typeof parsed.model === 'object' ? parsed.model : null,
    };
  } catch {
    return { token: '', model: null };
  }
}

function writePersistedAuth(token: string, model: User | null): void {
  try {
    if (!token) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return;
    }
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, model }));
  } catch {
    // Ignore storage quota issues safely
  }
}

const initialPersistedAuth = readPersistedAuth();
let persistedAuthToken: string = initialPersistedAuth.token;
let persistedAuthModel: User | null = initialPersistedAuth.model;

export class PocketBaseApiError extends Error {
  status: number;
  details?: Record<string, unknown>;

  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'PocketBaseApiError';
    this.status = status;
    this.details = details;
  }
}

type PbErrorListener = (message: string) => void;
const pbErrorListeners = new Set<PbErrorListener>();

function emitPbError(message: string): void {
  pbErrorListeners.forEach((listener) => {
    try {
      listener(message);
    } catch {
      // ignore listener errors
    }
  });
}

function extractPocketBaseErrorMessage(
  status: number,
  statusText: string,
  rawBody: string
): { message: string; details?: Record<string, unknown> } {
  if (!rawBody) {
    return { message: `PocketBase greška (HTTP ${status}${statusText ? ` ${statusText}` : ''})` };
  }
  try {
    const parsed = JSON.parse(rawBody) as {
      message?: string;
      data?: Record<string, { code?: string; message?: string } | unknown>;
    };
    const baseMsg =
      typeof parsed.message === 'string' && parsed.message.trim()
        ? parsed.message.trim()
        : `PocketBase greška (HTTP ${status})`;
    const fieldErrors: string[] = [];
    if (parsed.data && typeof parsed.data === 'object') {
      for (const [field, val] of Object.entries(parsed.data)) {
        if (val && typeof val === 'object' && 'message' in val) {
          const fieldMsg = String((val as { message?: unknown }).message || '').trim();
          if (fieldMsg) {
            fieldErrors.push(`${field}: ${fieldMsg}`);
          }
        }
      }
    }
    const fullMessage =
      fieldErrors.length > 0 ? `${baseMsg} (${fieldErrors.join('; ')})` : baseMsg;
    return { message: fullMessage, details: parsed.data };
  } catch {
    return { message: rawBody.slice(0, 300) || `PocketBase greška (HTTP ${status})` };
  }
}

export const pb = {
  authStore: {
    get token(): string {
      return persistedAuthToken;
    },
    get model(): User | null {
      return persistedAuthModel;
    },
    get isValid(): boolean {
      return Boolean(persistedAuthToken && persistedAuthModel);
    },
    save(token: string, model: User | null): void {
      persistedAuthToken = token || '';
      persistedAuthModel = model;
      writePersistedAuth(persistedAuthToken, persistedAuthModel);
    },
    clear(): void {
      persistedAuthToken = '';
      persistedAuthModel = null;
      writePersistedAuth('', null);
    },
  },
};

/**
 * PocketBase REST helper.
 * Active when VITE_POCKETBASE_URL is configured; throws and emits errors on failure instead of swallowing them.
 */
async function pbRequest<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (!pocketbaseConfig.baseUrl.trim()) return null;
  const url = `${pocketbaseConfig.baseUrl.replace(/\/$/, '')}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
        ...(init?.headers || {}),
      },
    });
  } catch (err) {
    const netMsg =
      err instanceof Error ? err.message : 'Mrežna greška pri spajanju na PocketBase server.';
    const fullMsg = `PocketBase veza nije uspjela: ${netMsg}`;
    emitPbError(fullMsg);
    throw new PocketBaseApiError(fullMsg, 0);
  }

  if (!res.ok) {
    const rawBody = await res.text().catch(() => '');
    const { message, details } = extractPocketBaseErrorMessage(res.status, res.statusText, rawBody);
    emitPbError(message);
    throw new PocketBaseApiError(message, res.status, details);
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }
  const text = await res.text();
  if (!text) {
    return undefined as unknown as T;
  }
  return JSON.parse(text) as T;
}

function normalizeTaskRecord(task: FacilityTask): FacilityTask {
  const rawTask = task as FacilityTask & {
    completedAt?: string;
    completedLat?: number | string;
    completedLng?: number | string;
    completedAccuracy?: number | string;
  };
  const rawLat = typeof task.lat === 'number' ? task.lat : Number(task.lat);
  const rawLng = typeof task.lng === 'number' ? task.lng : Number(task.lng);
  const hasCoords =
    Number.isFinite(rawLat) &&
    Number.isFinite(rawLng) &&
    !(rawLat === 0 && rawLng === 0);

  const rawCompletedLat =
    task.completed_lat !== undefined ? Number(task.completed_lat) : Number(rawTask.completedLat);
  const rawCompletedLng =
    task.completed_lng !== undefined ? Number(task.completed_lng) : Number(rawTask.completedLng);
  const hasCompletedCoords =
    Number.isFinite(rawCompletedLat) &&
    Number.isFinite(rawCompletedLng) &&
    !(rawCompletedLat === 0 && rawCompletedLng === 0);

  const rawCompletedAccuracy =
    task.completed_accuracy !== undefined
      ? Number(task.completed_accuracy)
      : Number(rawTask.completedAccuracy);

  const completedAt =
    typeof task.completed_at === 'string' && task.completed_at.trim()
      ? task.completed_at
      : typeof rawTask.completedAt === 'string' && rawTask.completedAt.trim()
        ? rawTask.completedAt
        : undefined;

  return {
    ...task,
    checklist_json: Array.isArray(task.checklist_json) ? task.checklist_json : [],
    photos: Array.isArray(task.photos) ? task.photos : [],
    bin_types: normalizeBinTypes(task.bin_types),
    address: typeof task.address === 'string' && task.address.trim() ? task.address.trim() : undefined,
    lat: hasCoords ? rawLat : undefined,
    lng: hasCoords ? rawLng : undefined,
    completed_at: completedAt,
    completed_lat: hasCompletedCoords ? rawCompletedLat : undefined,
    completed_lng: hasCompletedCoords ? rawCompletedLng : undefined,
    completed_accuracy:
      Number.isFinite(rawCompletedAccuracy) && rawCompletedAccuracy >= 0
        ? rawCompletedAccuracy
        : undefined,
    notes: typeof task.notes === 'string' ? task.notes : '',
    description: typeof task.description === 'string' ? task.description : '',
    signature:
      typeof task.signature === 'string' && task.signature.trim()
        ? task.signature
        : undefined,
    translations:
      task.translations && typeof task.translations === 'object' && !Array.isArray(task.translations)
        ? task.translations
        : undefined,
  };
}

function isoDateOffset(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildSeedData() {
  const today = isoDateOffset(0);
  const yesterday = isoDateOffset(-1);
  const twoDaysAgo = isoDateOffset(-2);
  const tomorrow = isoDateOffset(1);
  const inTwoDays = isoDateOffset(2);
  const inFourDays = isoDateOffset(4);

  const { kw, year } = getISOWeekAndYear(new Date());
  const { dates: kwDates } = getWeekStartEnd(year, kw);
  const nextWeek = kw >= 52 ? { kw: 1, year: year + 1 } : { kw: kw + 1, year };
  const { dates: nextKwDates } = getWeekStartEnd(nextWeek.year, nextWeek.kw);

  const users: User[] = [
    {
      id: 'u1',
      employee_id: 'HM-101',
      name: 'Administrator',
      email: 'sandokanmcroar@gmail.com',
      role: 'admin',
      phone: '+49 171 4829103',
      region: 'München Gesamt (Einsatzleitung)',
      language: 'DE',
    },
    {
      id: 'u2',
      employee_id: 'HM-104',
      name: 'Lukas Wagner',
      email: 'l.wagner@hausmeister-pro.de',
      role: 'worker',
      phone: '+49 172 9104421',
      region: 'München Nord / Schwabing',
      language: 'DE',
    },
    {
      id: 'u3',
      employee_id: 'HM-107',
      name: 'Mehmet Yilmaz',
      email: 'm.yilmaz@hausmeister-pro.de',
      role: 'worker',
      phone: '+49 176 3382910',
      region: 'München Ost / Bogenhausen',
      language: 'DE',
    },
    {
      id: 'u4',
      employee_id: 'HV-201',
      name: 'Dr. Petra König',
      email: 'koenig@isar-grund-hv.de',
      role: 'client_hausverwaltung',
      phone: '+49 89 5510290',
      region: 'Isar-Grund Hausverwaltung GmbH',
      language: 'DE',
    },
  ];

  const objects: PropertyObject[] = [
    {
      id: 'obj1',
      name: 'WEG Leopoldstraße 142',
      address: 'Leopoldstraße 142, 80804 München',
      lat: 48.1686,
      lng: 11.5861,
      client_id: 'u4',
      client_name: 'Isar-Grund Hausverwaltung GmbH',
      units_count: 34,
    },
    {
      id: 'obj2',
      name: 'Wohnanlage Prinzregentenplatz 18',
      address: 'Prinzregentenplatz 18, 81675 München',
      lat: 48.1393,
      lng: 11.6067,
      client_id: 'u4',
      client_name: 'Isar-Grund Hausverwaltung GmbH',
      units_count: 26,
    },
    {
      id: 'obj3',
      name: 'Gewerbepark Landsberger Str. 302',
      address: 'Landsberger Straße 302, 80687 München',
      lat: 48.1419,
      lng: 11.5037,
      client_id: 'u4',
      client_name: 'Bavaria Gewerbebau AG',
      units_count: 14,
    },
    {
      id: 'obj4',
      name: 'Stadthaus Maxvorstadt',
      address: 'Theresienstraße 78, 80333 München',
      lat: 48.1516,
      lng: 11.5712,
      client_id: 'u4',
      client_name: 'Isar-Grund Hausverwaltung GmbH',
      units_count: 18,
    },
    {
      id: 'obj5',
      name: 'Quartier Sendlinger Tor',
      address: 'Lindwurmstraße 45, 80337 München',
      lat: 48.1304,
      lng: 11.5594,
      client_id: 'u4',
      client_name: 'Süddeutsche Immobilien Treuhand',
      units_count: 42,
    },
    {
      id: 'obj6',
      name: 'Residenz Bogenhausen',
      address: 'Ismaninger Straße 94, 81675 München',
      lat: 48.1489,
      lng: 11.6031,
      client_id: 'u4',
      client_name: 'Isar-Grund Hausverwaltung GmbH',
      units_count: 22,
    },
  ];

  const tasks: FacilityTask[] = [
    {
      id: 't1',
      title: 'Tiefgaragen-Einfahrt enteisen & Streugut nachfüllen',
      description:
        'Glättegefahr an der Rampe zur Tiefgarage B. Streubehälter prüfen, mit Split/Salzgemisch auffüllen und Warnhinweis kontrollieren.',
      category: 'Winterdienst',
      status: 'offen',
      priority: 'dringend',
      due_date: `${yesterday}T08:00`,
      created_at: `${twoDaysAgo}T14:20:00Z`,
      object_id: 'obj1',
      assigned_to: 'u2',
      checklist_json: [
        { id: 'c1', label: 'Zufahrtsrampe auf Eisbildung prüfen', checked: false },
        { id: 'c2', label: 'Umweltfreundliches Streugut gleichmäßig ausbringen', checked: false },
        { id: 'c3', label: 'Streugutbox (200L) auf Füllstand prüfen', checked: false },
        { id: 'c4', label: 'Hauseingänge A–C zusätzlich abstreuen', checked: false },
      ],
      notes: 'Mieter aus Whg. 12 hat heute früh Glätte gemeldet.',
      photos: [],
    },
    {
      id: 't2',
      title: 'Defekte Außenbeleuchtung Hofeinfahrt instand setzen',
      description:
        'Zwei LED-Pollerleuchten im Innenhof flackern. Sicherungsautomat in Verteilung UV-Hof prüfen und Leuchtmittel tauschen.',
      category: 'Baustelle / Reparatur',
      status: 'offen',
      priority: 'hoch',
      due_date: `${twoDaysAgo}T16:00`,
      created_at: `${isoDateOffset(-4)}T09:15:00Z`,
      object_id: 'obj5',
      assigned_to: 'u1',
      checklist_json: [
        { id: 'c5', label: 'Spannungsfreiheit in UV-Hof feststellen', checked: true },
        { id: 'c6', label: 'Dichtungen der Pollerleuchte prüfen', checked: false },
        { id: 'c7', label: 'LED-Modul 18W einsetzen und Dämmerungsschalter testen', checked: false },
      ],
      notes: 'Ersatz-LED-Module liegen im Fahrzeug Sprinter M-HP 402.',
      photos: [],
    },
    {
      id: 't3',
      title: 'Treppenhausreinigung Aufgang A & B + Glasfront',
      description:
        'Wöchentliche Unterhaltsreinigung inkl. Briefkastenanlage, Handläufen und Eingangsglastür.',
      category: 'Reinigung',
      status: 'in_bearbeitung',
      priority: 'normal',
      due_date: `${today}T14:30`,
      created_at: `${yesterday}T07:30:00Z`,
      object_id: 'obj2',
      assigned_to: 'u3',
      checklist_json: [
        { id: 'c8', label: 'Stufen und Podeste trocken kehren & feucht wischen', checked: true },
        { id: 'c9', label: 'Handläufe, Klingeltableaus & Aufzugstaster reinigen', checked: true },
        { id: 'c10', label: 'Eingangsglastüren beidseitig streifenfrei abziehen', checked: false },
        { id: 'c11', label: 'Kellerabgang & Müllraum-Vorplatz fegen', checked: false },
      ],
      notes: 'Aufgang A bereits fertig, Aufgang B folgt am Nachmittag.',
      photos: [],
    },
    {
      id: 't4',
      title: 'Herbstlaub im Innenhof & Dachrinnen-Einlauf räumen',
      description:
        'Laubansammlung an den Regenwassereinläufen entfernen und über Grüngutcontainer entsorgen.',
      category: 'Außenanlagenpflege',
      status: 'offen',
      priority: 'normal',
      due_date: `${tomorrow}T10:00`,
      created_at: `${yesterday}T11:00:00Z`,
      object_id: 'obj4',
      assigned_to: 'u2',
      checklist_json: [
        { id: 'c12', label: 'Gehwege und Hofzufahrt mit Laubbläser/Besen räumen', checked: false },
        { id: 'c13', label: 'Gullys und Hofabläufe von Laub befreien', checked: false },
        { id: 'c14', label: 'Grüngutsäcke am Abholpunkt bereitstellen', checked: false },
      ],
      notes: '',
      photos: [],
    },
    {
      id: 't5',
      title: 'Müllstandplatz Hochdruckreinigung & Container-Check',
      description:
        'Standplatz hinter Gebäude C nach Leerung abspritzen und Geruchsbinder ausbringen.',
      category: 'Mülltonnendienst',
      status: 'offen',
      priority: 'normal',
      due_date: `${tomorrow}T15:00`,
      created_at: `${today}T08:00:00Z`,
      object_id: 'obj3',
      assigned_to: 'u1',
      checklist_json: [
        { id: 'c15', label: 'Restmüll- und Papier-Schleuse komplett leeren/fegen', checked: false },
        { id: 'c16', label: 'Bodenablauf im Müllraum reinigen', checked: false },
        { id: 'c17', label: 'Schließzylinder der Müllraumtür ölen', checked: false },
      ],
      notes: 'Schlüssel Nr. 14b für Wasseranschluss im Technikraum.',
      photos: [],
      bin_types: ['Restmüll', 'Papier'],
    },
    {
      id: 't6',
      title: 'Heckenrückschnitt Vorgarten & Sichtdreieck Einfahrt',
      description:
        'Ausfahrtssicht an der Ismaninger Straße freischneiden (max. 80 cm Höhe im Sichtdreieck).',
      category: 'Außenanlagenpflege',
      status: 'offen',
      priority: 'normal',
      due_date: `${inTwoDays}T11:30`,
      created_at: `${today}T09:00:00Z`,
      object_id: 'obj6',
      assigned_to: 'u3',
      checklist_json: [
        { id: 'c18', label: 'Ligusterhecke an Ausfahrt auf 80 cm kürzen', checked: false },
        { id: 'c19', label: 'Schnittgut häckseln oder abtransportieren', checked: false },
      ],
      notes: '',
      photos: [],
    },
    {
      id: 't7',
      title: 'Türschließer Haupteingang neu justieren',
      description:
        'Haupteingangstür schlägt zu hart ins Schloss. Schließgeschwindigkeit und Endschlag am GEZE-Schließer einstellen.',
      category: 'Baustelle / Reparatur',
      status: 'in_bearbeitung',
      priority: 'hoch',
      due_date: `${today}T17:00`,
      created_at: `${yesterday}T16:10:00Z`,
      object_id: 'obj1',
      assigned_to: 'u1',
      checklist_json: [
        { id: 'c20', label: 'Abdeckkappe GEZE TS 4000 abnehmen', checked: true },
        { id: 'c21', label: 'Schließgeschwindigkeit & Endschlag regulieren', checked: false },
        { id: 'c22', label: 'Schließfalle auf Leichtgängigkeit prüfen', checked: false },
      ],
      notes: 'Hydraulikventil 1 um halbe Umdrehung gedrosselt, Feineinstellung folgt.',
      photos: [],
    },
    {
      id: 't8',
      title: 'Winterdienst-Kontrollgang & Streukisten-Inspektion',
      description:
        'Vorab-Kontrolle aller Streugutbehälter und Räumgeräte vor dem angekündigten Kälteeinbruch.',
      category: 'Winterdienst',
      status: 'erledigt',
      priority: 'normal',
      due_date: `${yesterday}T12:00`,
      created_at: `${isoDateOffset(-3)}T08:00:00Z`,
      object_id: 'obj6',
      assigned_to: 'u3',
      checklist_json: [
        { id: 'c23', label: 'Alle 3 Streukisten auf Trockenheit prüfen', checked: true },
        { id: 'c24', label: 'Schneeschaufeln & Streuwagen einsatzbereit melden', checked: true },
      ],
      notes: 'Alle 3 Kisten zu 100 % gefüllt und sauber.',
      photos: [],
      completed_at: `${yesterday}T11:35:00Z`,
    },
    {
      id: 't9',
      title: 'Grundreinigung Aufzugskabine & Spiegelwand',
      description:
        'Edelstahlflächen mit Spezialreiniger pflegen und Führungsschienen der Aufzugstür aussaugen.',
      category: 'Reinigung',
      status: 'offen',
      priority: 'normal',
      due_date: `${inFourDays}T09:00`,
      created_at: `${today}T10:15:00Z`,
      object_id: 'obj5',
      assigned_to: 'u2',
      checklist_json: [
        { id: 'c25', label: 'Türlaufschienen EG–5. OG aussaugen', checked: false },
        { id: 'c26', label: 'Edelstahl-Tableau versiegeln', checked: false },
      ],
      notes: '',
      photos: [],
    },
  ];

  const binSchedules: BinSchedule[] = [
    {
      id: 'b1',
      object_id: 'obj1',
      bin_type: 'Restmüll',
      pickup_date: kwDates[0],
      kw,
      year,
      status_out: true,
      time_out: `${kwDates[0]}T06:18:00`,
      status_in: true,
      time_in: `${kwDates[0]}T15:40:00`,
    },
    {
      id: 'b2',
      object_id: 'obj1',
      bin_type: 'Papier',
      pickup_date: kwDates[1],
      kw,
      year,
      status_out: true,
      time_out: `${kwDates[1]}T06:25:00`,
      status_in: false,
    },
    {
      id: 'b3',
      object_id: 'obj2',
      bin_type: 'Restmüll',
      pickup_date: kwDates[1],
      kw,
      year,
      status_out: true,
      time_out: `${kwDates[1]}T06:42:00`,
      status_in: false,
    },
    {
      id: 'b4',
      object_id: 'obj2',
      bin_type: 'Gelbe Tonne',
      pickup_date: kwDates[2],
      kw,
      year,
      status_out: false,
      status_in: false,
    },
    {
      id: 'b5',
      object_id: 'obj3',
      bin_type: 'Restmüll',
      pickup_date: kwDates[1],
      kw,
      year,
      status_out: true,
      time_out: `${kwDates[1]}T05:55:00`,
      status_in: true,
      time_in: `${kwDates[1]}T16:12:00`,
    },
    {
      id: 'b6',
      object_id: 'obj3',
      bin_type: 'Papier',
      pickup_date: kwDates[3],
      kw,
      year,
      status_out: false,
      status_in: false,
    },
    {
      id: 'b7',
      object_id: 'obj4',
      bin_type: 'Bio',
      pickup_date: kwDates[2],
      kw,
      year,
      status_out: false,
      status_in: false,
    },
    {
      id: 'b8',
      object_id: 'obj4',
      bin_type: 'Gelbe Tonne',
      pickup_date: kwDates[4],
      kw,
      year,
      status_out: false,
      status_in: false,
    },
    {
      id: 'b9',
      object_id: 'obj5',
      bin_type: 'Restmüll',
      pickup_date: kwDates[0],
      kw,
      year,
      status_out: true,
      time_out: `${kwDates[0]}T06:05:00`,
      status_in: true,
      time_in: `${kwDates[0]}T16:30:00`,
    },
    {
      id: 'b10',
      object_id: 'obj5',
      bin_type: 'Bio',
      pickup_date: kwDates[3],
      kw,
      year,
      status_out: false,
      status_in: false,
    },
    {
      id: 'b11',
      object_id: 'obj6',
      bin_type: 'Papier',
      pickup_date: kwDates[2],
      kw,
      year,
      status_out: true,
      time_out: `${kwDates[2]}T06:30:00`,
      status_in: false,
    },
    {
      id: 'b12',
      object_id: 'obj6',
      bin_type: 'Gelbe Tonne',
      pickup_date: kwDates[4],
      kw,
      year,
      status_out: false,
      status_in: false,
    },
    {
      id: 'b13',
      object_id: 'obj1',
      bin_type: 'Restmüll',
      pickup_date: nextKwDates[0],
      kw: nextWeek.kw,
      year: nextWeek.year,
      status_out: false,
      status_in: false,
    },
    {
      id: 'b14',
      object_id: 'obj2',
      bin_type: 'Bio',
      pickup_date: nextKwDates[2],
      kw: nextWeek.kw,
      year: nextWeek.year,
      status_out: false,
      status_in: false,
    },
    {
      id: 'b15',
      object_id: 'obj5',
      bin_type: 'Papier',
      pickup_date: nextKwDates[3],
      kw: nextWeek.kw,
      year: nextWeek.year,
      status_out: false,
      status_in: false,
    },
  ];

  const timeEntries: TimeEntry[] = [
    {
      id: 'te1',
      user_id: 'u1',
      date: isoDateOffset(-7),
      start_time: `${isoDateOffset(-7)}T07:02:00`,
      end_time: `${isoDateOffset(-7)}T16:15:00`,
      total_pause_minutes: 45,
      total_work_minutes: 508,
      status: 'beendet',
      notes: 'Objektkontrolle Nord + Einsatzplanung',
    },
    {
      id: 'te2',
      user_id: 'u1',
      date: isoDateOffset(-6),
      start_time: `${isoDateOffset(-6)}T06:58:00`,
      end_time: `${isoDateOffset(-6)}T15:48:00`,
      total_pause_minutes: 30,
      total_work_minutes: 500,
      status: 'beendet',
      notes: 'Mülltonnenlogistik & Reparatur Leopoldstr.',
    },
    {
      id: 'te3',
      user_id: 'u1',
      date: isoDateOffset(-3),
      start_time: `${isoDateOffset(-3)}T07:10:00`,
      end_time: `${isoDateOffset(-3)}T16:05:00`,
      total_pause_minutes: 35,
      total_work_minutes: 500,
      status: 'beendet',
      notes: 'Winterdienst-Vorbereitung',
    },
    {
      id: 'te4',
      user_id: 'u1',
      date: isoDateOffset(-2),
      start_time: `${isoDateOffset(-2)}T07:00:00`,
      end_time: `${isoDateOffset(-2)}T15:52:00`,
      total_pause_minutes: 30,
      total_work_minutes: 502,
      status: 'beendet',
      notes: 'Abnahme Reinigungsfirma & Wartung',
    },
    {
      id: 'te5',
      user_id: 'u1',
      date: yesterday,
      start_time: `${yesterday}T06:55:00`,
      end_time: `${yesterday}T16:10:00`,
      total_pause_minutes: 45,
      total_work_minutes: 510,
      status: 'beendet',
      notes: 'Begehung Bogenhausen & Sendlinger Tor',
    },
    {
      id: 'te6',
      user_id: 'u2',
      date: today,
      start_time: `${today}T06:30:00`,
      total_pause_minutes: 15,
      total_work_minutes: 185,
      status: 'aktiv',
      notes: 'Tour Nord aktiv',
    },
    {
      id: 'te7',
      user_id: 'u3',
      date: today,
      start_time: `${today}T07:00:00`,
      total_pause_minutes: 30,
      total_work_minutes: 150,
      status: 'pause',
      pause_started_at: new Date().toISOString(),
      notes: 'Mittagspause nach Treppenhausreinigung',
    },
  ];

  const notifications: AppNotification[] = [
    {
      id: 'n1',
      title: 'Überfällige Aufgabe: Winterdienst',
      message: 'WEG Leopoldstraße 142 – Tiefgaragen-Einfahrt enteisen ist seit gestern überfällig.',
      created_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
      read: false,
      type: 'overdue',
      target_tab: 'aufgaben',
    },
    {
      id: 'n2',
      title: 'Mülltonnen-Erinnerung KW ' + kw,
      message: 'In dieser Kalenderwoche stehen noch Abholungen bei Prinzregentenplatz 18 & Maxvorstadt an.',
      created_at: new Date(Date.now() - 1000 * 60 * 110).toISOString(),
      read: false,
      type: 'bin',
      target_tab: 'muelltonnen',
    },
    {
      id: 'n3',
      title: 'Tagesplanung für morgen',
      message: 'Neue Aufgaben für morgen sind im Einsatzplan hinterlegt (Erinnerung 19:00 Uhr).',
      created_at: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
      read: true,
      type: 'reminder',
      target_tab: 'kalender',
    },
  ];

  // --- Seed Data for 5 Specialized Enterprise Modules ---
  const winterLogs: WinterLog[] = [
    {
      id: 'wl1',
      object_id: 'obj1',
      user_id: 'u2',
      start_time: `${yesterday}T05:40:00`,
      end_time: `${yesterday}T06:18:00`,
      lat: 48.1686,
      lng: 11.5861,
      temp_celsius: -2.4,
      weather_desc: 'Leichter Schneefall',
      action_type: 'Salz gestreut',
      salt_kg: 18,
      notes: 'Gehweg Leopoldstraße komplett geräumt und mit Feuchtsalz abgestreut.',
    },
    {
      id: 'wl2',
      object_id: 'obj2',
      user_id: 'u3',
      start_time: `${twoDaysAgo}T06:00:00`,
      end_time: `${twoDaysAgo}T06:22:00`,
      lat: 48.1393,
      lng: 11.6067,
      temp_celsius: 1.8,
      weather_desc: 'Bedeckt / Frostfrei',
      action_type: 'Kontrollfahrt ohne Einsatz',
      salt_kg: 0,
      notes: 'Fahrbahn und Gehwege trocken und griffig.',
    },
  ];

  const meterReadings: MeterReading[] = [
    {
      id: 'mr1',
      object_id: 'obj1',
      apartment: 'Allgemeinstrom / Keller',
      meter_number: '1EMH00884120',
      meter_type: 'Strom',
      reading_value: 24891.4,
      previous_value: 21450.2,
      read_by: 'u1',
      read_date: `${yesterday}T10:15`,
    },
    {
      id: 'mr2',
      object_id: 'obj1',
      apartment: 'Whg. 04 (2. OG links)',
      meter_number: 'KW-2026-441092',
      meter_type: 'Kaltwasser',
      reading_value: 342.8,
      previous_value: 298.1,
      read_by: 'u2',
      read_date: `${yesterday}T11:05`,
    },
    {
      id: 'mr3',
      object_id: 'obj2',
      apartment: 'Heizraum Zentral',
      meter_number: 'WMZ-771204-M',
      meter_type: 'Wärmemengenzähler',
      reading_value: 118420,
      previous_value: 102190,
      read_by: 'u3',
      read_date: `${twoDaysAgo}T14:30`,
    },
  ];

  const handoverProtocols: HandoverProtocol[] = [
    {
      id: 'hp1',
      object_id: 'obj4',
      apartment: 'Whg. 07 (3. OG rechts)',
      type: 'Einzug',
      landlord_name: 'Thomas Berger (HM-101)',
      tenant_name: 'Anna-Lena Hoffmann',
      tenant_email: 'a.hoffmann@beispiel.de',
      rooms_json: [
        { room: 'Wohnzimmer', condition: 'Einwandfrei', notes: 'Parkett frisch versiegelt' },
        { room: 'Küche', condition: 'Einwandfrei', notes: 'EBK inkl. Ceranfeld ohne Mängel' },
        { room: 'Bad', condition: 'Einwandfrei', notes: 'Silikonfugen neu' },
        { room: 'Schlafzimmer', condition: 'Einwandfrei', notes: '' },
        { room: 'Flur', condition: 'Einwandfrei', notes: '' },
        { room: 'Balkon/Keller', condition: 'Mängel vorhanden', notes: 'Kellerlichtschalter klemmt leicht' },
      ],
      keys_json: {
        haustuer: 3,
        wohnungstuer: 3,
        briefkasten: 2,
        keller: 1,
        garage: 1,
      },
      meters_json: [
        { label: 'Strom', meter_number: '1EMH00912044', value: '14220,5 kWh' },
        { label: 'Kaltwasser', meter_number: 'KW-99412', value: '184,2 m³' },
        { label: 'Warmwasser', meter_number: 'WW-99413', value: '91,8 m³' },
      ],
      created_at: `${twoDaysAgo}T15:00:00`,
    },
  ];

  const cleaningLogs: CleaningLog[] = [
    {
      id: 'cl1',
      object_id: 'obj2',
      user_id: 'u3',
      scan_timestamp: `${today}T08:12:00`,
      qr_code_id: 'QR-OBJ2-EINGANG-A',
      lat: 48.1393,
      lng: 11.6067,
      checklist_json: [
        { id: 'rc1', label: 'Treppenhaus fegen/wischen', checked: true },
        { id: 'rc2', label: 'Handläufe desinfizieren', checked: true },
        { id: 'rc3', label: 'Eingangstür Glas reinigen', checked: true },
        { id: 'rc4', label: 'Aufzug', checked: true },
        { id: 'rc5', label: 'Kellerflur', checked: true },
      ],
      status: 'Erledigt',
      notes: 'Alle Etagen EG bis 4. OG komplett gereinigt.',
    },
    {
      id: 'cl2',
      object_id: 'obj5',
      user_id: 'u2',
      scan_timestamp: `${yesterday}T13:45:00`,
      qr_code_id: 'QR-OBJ5-HOF-B',
      lat: 48.1304,
      lng: 11.5594,
      checklist_json: [
        { id: 'rc1', label: 'Treppenhaus fegen/wischen', checked: true },
        { id: 'rc2', label: 'Handläufe desinfizieren', checked: true },
        { id: 'rc3', label: 'Eingangstür Glas reinigen', checked: false },
        { id: 'rc4', label: 'Aufzug', checked: true },
        { id: 'rc5', label: 'Kellerflur', checked: true },
      ],
      status: 'Mängelmeldung',
      notes: 'Kratzer an der inneren Glastür EG festgestellt.',
    },
  ];

  const gardenLogs: GardenLog[] = [
    {
      id: 'gl1',
      object_id: 'obj6',
      user_id: 'u3',
      date: twoDaysAgo,
      tasks_json: ['Hecke schneiden', 'Laub beseitigen', 'Grünschnitt abtransportiert'],
      materials_json: {
        duenger_kg: 0,
        rasensamen_kg: 0,
        rindenmulch_saecke: 6,
      },
      waste_volume: 1.5,
      duration_minutes: 135,
      photos: {},
      notes: 'Vorgartenbeete nach Rückschnitt mit 6 Säcken Rindenmulch abgedeckt.',
    },
    {
      id: 'gl2',
      object_id: 'obj1',
      user_id: 'u2',
      date: isoDateOffset(-5),
      tasks_json: ['Rasen mähen', 'Unkraut entfernen', 'Laub beseitigen'],
      materials_json: {
        duenger_kg: 10,
        rasensamen_kg: 2,
        rindenmulch_saecke: 0,
      },
      waste_volume: 0.8,
      duration_minutes: 95,
      photos: {},
      notes: 'Kahle Stellen am Spielplatz nachgesät und Herbstdünger ausgebracht.',
    },
  ];

  return {
    users,
    objects,
    tasks,
    binSchedules,
    timeEntries,
    notifications,
    winterLogs,
    meterReadings,
    handoverProtocols,
    cleaningLogs,
    gardenLogs,
  };
}

const MAX_LOCAL_IMAGE_DATAURL_CHARS = 450_000;

function stripOversizedImagesForLocalStorage<T>(value: T): T {
  const seen = new WeakSet<object>();
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') {
      if (node.startsWith('data:image/') && node.length > MAX_LOCAL_IMAGE_DATAURL_CHARS) {
        return '';
      }
      return node;
    }
    if (!node || typeof node !== 'object') return node;
    if (seen.has(node as object)) return node;
    seen.add(node as object);

    if (Array.isArray(node)) {
      return node.map(walk);
    }
    const obj = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (
        k === 'dataUrl' &&
        typeof v === 'string' &&
        v.startsWith('data:image/') &&
        (!v.startsWith('data:image/jpeg') || v.length > MAX_LOCAL_IMAGE_DATAURL_CHARS)
      ) {
        out[k] = '';
      } else {
        out[k] = walk(v);
      }
    }
    return out;
  };
  return walk(value) as T;
}

async function compressPhotoList(photos?: TaskPhoto[]): Promise<TaskPhoto[] | undefined> {
  if (!photos) return undefined;
  return Promise.all(photos.map((p) => compressTaskPhotoIfNeeded(p)));
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(fallback));
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T): void {
  try {
    const safeValue = stripOversizedImagesForLocalStorage(value);
    localStorage.setItem(key, JSON.stringify(safeValue));
  } catch {
    // Ignore storage quota issues safely
  }
}

export const pocketbaseService = {
  isPocketBaseEnabled(): boolean {
    return Boolean(pocketbaseConfig.baseUrl.trim());
  },

  subscribePbErrors(listener: PbErrorListener): () => void {
    pbErrorListeners.add(listener);
    return () => {
      pbErrorListeners.delete(listener);
    };
  },

  getAuthToken(): string | null {
    return pb.authStore.token || null;
  },

  clearAuth(): void {
    pb.authStore.clear();
    this.setCurrentUserId(null);
  },

  async restoreSession(): Promise<User | null> {
    const token = pb.authStore.token;
    if (!token) return null;

    if (this.isPocketBaseEnabled()) {
      const baseUrl = pocketbaseConfig.baseUrl.replace(/\/$/, '');
      try {
        const res = await fetch(
          `${baseUrl}/api/collections/${pocketbaseConfig.collections.users}/auth-refresh`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (res.status === 401 || res.status === 403) {
          this.clearAuth();
          return null;
        }

        if (!res.ok) {
          const rawBody = await res.text().catch(() => '');
          const { message } = extractPocketBaseErrorMessage(res.status, res.statusText, rawBody);
          emitPbError(message);
          return pb.authStore.model;
        }

        const data = (await res.json()) as { token?: string; record?: User };
        if (data.record) {
          const nextToken = data.token || token;
          pb.authStore.save(nextToken, data.record);
          this.setCurrentUserId(data.record.id);
          return data.record;
        }
        this.clearAuth();
        return null;
      } catch (err) {
        const netMsg =
          err instanceof Error ? err.message : 'Server nije dostupan.';
        emitPbError(`PocketBase auth-refresh nije uspio: ${netMsg}`);
        return pb.authStore.model;
      }
    }

    try {
      const res = await fetch('/api/auth/session', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.status === 401 || res.status === 403) {
        this.clearAuth();
        return null;
      }
      if (!res.ok) {
        return pb.authStore.model;
      }
      const data = (await res.json()) as {
        user?: { id: string; email: string; role: User['role'] };
      };
      if (!data.user) {
        this.clearAuth();
        return null;
      }
      const usersList = await this.getUsers();
      const matched =
        usersList.find((u) => u.id === data.user?.id) ??
        pb.authStore.model ?? {
          id: data.user.id,
          employee_id: 'HM-101',
          name: 'Administrator',
          email: data.user.email,
          role: data.user.role,
          phone: '',
          region: 'Einsatzleitung',
          language: 'DE' as LanguageCode,
        };
      pb.authStore.save(token, matched);
      this.setCurrentUserId(matched.id);
      return matched;
    } catch {
      return pb.authStore.model;
    }
  },

  async getAuthStatus(): Promise<{
    adminEmail: string;
    adminConfigured: boolean;
    usesEnvPasscode: boolean;
  }> {
    if (this.isPocketBaseEnabled()) {
      return {
        adminEmail: 'sandokanmcroar@gmail.com',
        adminConfigured: true,
        usesEnvPasscode: false,
      };
    }
    try {
      const res = await fetch('/api/auth/status');
      if (res.ok) {
        return (await res.json()) as {
          adminEmail: string;
          adminConfigured: boolean;
          usesEnvPasscode: boolean;
        };
      }
    } catch {
      // ignore
    }
    return {
      adminEmail: 'sandokanmcroar@gmail.com',
      adminConfigured: false,
      usesEnvPasscode: false,
    };
  },

  async setupAdminAccount(
    email: string,
    password: string
  ): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
    try {
      const res = await fetch('/api/auth/setup-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as {
        token?: string;
        user?: { id: string; email: string; role: User['role'] };
        error?: string;
      };
      if (!res.ok || !data.token || !data.user) {
        return { ok: false, error: data.error || 'SETUP_FAILED' };
      }
      const usersList = await this.getUsers();
      const matched =
        usersList.find(
          (u) => u.id === data.user?.id || u.email.toLowerCase() === data.user?.email.toLowerCase()
        ) ?? {
          id: data.user.id,
          employee_id: 'HM-101',
          name: 'Administrator',
          email: data.user.email,
          role: data.user.role,
          phone: '',
          region: 'Einsatzleitung',
          language: 'DE' as LanguageCode,
        };
      pb.authStore.save(data.token, matched);
      return { ok: true, userId: data.user.id };
    } catch {
      return { ok: false, error: 'NETWORK_ERROR' };
    }
  },

  async loginWithCredentials(
    email: string,
    password: string
  ): Promise<{ ok: true; user: User } | { ok: false; error: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    if (this.isPocketBaseEnabled()) {
      try {
        const res = await fetch(
          `${pocketbaseConfig.baseUrl.replace(/\/$/, '')}/api/collections/${pocketbaseConfig.collections.users}/auth-with-password`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identity: normalizedEmail, password }),
          }
        );
        if (!res.ok) {
          const rawBody = await res.text().catch(() => '');
          const { message } = extractPocketBaseErrorMessage(res.status, res.statusText, rawBody);
          return { ok: false, error: message };
        }
        const data = (await res.json()) as { token?: string; record?: User };
        if (!data.token || !data.record) {
          return { ok: false, error: 'INVALID_CREDENTIALS' };
        }
        pb.authStore.save(data.token, data.record);
        return { ok: true, user: data.record };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'NETWORK_ERROR';
        emitPbError(`PocketBase prijava nije uspjela: ${msg}`);
        return { ok: false, error: msg };
      }
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });
      const data = (await res.json()) as {
        token?: string;
        user?: { id: string; email: string; role: User['role'] };
        error?: string;
      };
      if (!res.ok || !data.token || !data.user) {
        return { ok: false, error: data.error || 'INVALID_CREDENTIALS' };
      }
      const usersList = await this.getUsers();
      const matched =
        usersList.find(
          (u) => u.id === data.user?.id || u.email.toLowerCase() === normalizedEmail
        ) ?? {
          id: data.user.id,
          employee_id: 'HM-101',
          name: 'Administrator',
          email: data.user.email,
          role: data.user.role,
          phone: '',
          region: 'Einsatzleitung',
          language: 'DE' as LanguageCode,
        };
      pb.authStore.save(data.token, matched);
      return { ok: true, user: matched };
    } catch {
      return { ok: false, error: 'NETWORK_ERROR' };
    }
  },

  async loginDemoNonAdmin(
    userId: string
  ): Promise<{ ok: true; user: User } | { ok: false; error: string }> {
    try {
      const res = await fetch('/api/auth/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = (await res.json()) as {
        token?: string;
        user?: { id: string };
        error?: string;
      };
      if (!res.ok || !data.token || !data.user) {
        return { ok: false, error: data.error || 'DEMO_LOGIN_NOT_ALLOWED' };
      }
      const usersList = await this.getUsers();
      const matched = usersList.find((u) => u.id === data.user?.id);
      if (!matched || matched.role === 'admin') {
        pb.authStore.clear();
        return { ok: false, error: 'DEMO_LOGIN_NOT_ALLOWED' };
      }
      pb.authStore.save(data.token, matched);
      return { ok: true, user: matched };
    } catch {
      return { ok: false, error: 'NETWORK_ERROR' };
    }
  },

  // Users & Session
  async getUsers(): Promise<User[]> {
    if (this.isPocketBaseEnabled()) {
      const remote = await pbRequest<{ items: User[] }>(
        `/api/collections/${pocketbaseConfig.collections.users}/records?perPage=200`
      );
      return remote?.items ?? [];
    }
    const seed = buildSeedData();
    const stored = readStorage<User[]>(STORAGE_KEYS.users, seed.users);
    const needsAdminEmailSync = stored.some(
      (u) => u.id === 'u1' && u.email === 't.berger@hausmeister-pro.de'
    );
    if (needsAdminEmailSync) {
      const synced = stored.map((u) =>
        u.id === 'u1'
          ? { ...u, name: 'Administrator', email: 'sandokanmcroar@gmail.com' }
          : u
      );
      writeStorage(STORAGE_KEYS.users, synced);
      return synced;
    }
    return stored;
  },

  getCurrentUserId(): string | null {
    return pb.authStore.model?.id ?? null;
  },

  setCurrentUserId(userId: string | null): void {
    try {
      if (!userId) {
        localStorage.removeItem(STORAGE_KEYS.currentUserId);
      } else {
        localStorage.setItem(STORAGE_KEYS.currentUserId, userId);
      }
    } catch {
      // ignore
    }
  },

  async updateUserLanguage(userId: string, language: LanguageCode): Promise<User[]> {
    if (this.isPocketBaseEnabled()) {
      await pbRequest(`/api/collections/${pocketbaseConfig.collections.users}/records/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ language }),
      });
      if (pb.authStore.model?.id === userId) {
        pb.authStore.save(pb.authStore.token, { ...pb.authStore.model, language });
      }
      this.setSavedUiLanguage(language);
      return this.getUsers();
    }
    const list = await this.getUsers();
    const updated = list.map((u) => (u.id === userId ? { ...u, language } : u));
    writeStorage(STORAGE_KEYS.users, updated);
    this.setSavedUiLanguage(language);
    return updated;
  },

  getSavedUiLanguage(): LanguageCode {
    try {
      const val = localStorage.getItem(STORAGE_KEYS.uiLanguage);
      if (val && ['DE', 'HR', 'SQ', 'EN', 'PL', 'TR', 'RU'].includes(val)) {
        return val as LanguageCode;
      }
      return 'DE';
    } catch {
      return 'DE';
    }
  },

  setSavedUiLanguage(lang: LanguageCode): void {
    try {
      localStorage.setItem(STORAGE_KEYS.uiLanguage, lang);
    } catch {
      // ignore
    }
  },

  getCompanyDocLanguage(): DocLanguageCode {
    try {
      const val = localStorage.getItem(STORAGE_KEYS.docLanguage);
      if (val && ['DE', 'EN', 'HR', 'SQ'].includes(val)) {
        return val as DocLanguageCode;
      }
      return 'DE';
    } catch {
      return 'DE';
    }
  },

  setCompanyDocLanguage(lang: DocLanguageCode): void {
    try {
      localStorage.setItem(STORAGE_KEYS.docLanguage, lang);
    } catch {
      // ignore
    }
  },

  // Objects
  async getObjects(): Promise<PropertyObject[]> {
    if (this.isPocketBaseEnabled()) {
      const remote = await pbRequest<{ items: PropertyObject[] }>(
        `/api/collections/${pocketbaseConfig.collections.objects}/records?perPage=200`
      );
      return (remote?.items ?? []).map((obj) => ({
        ...obj,
        lat: Number(obj.lat),
        lng: Number(obj.lng),
        units_count: Number(obj.units_count) || 0,
      }));
    }
    const seed = buildSeedData();
    return readStorage<PropertyObject[]>(STORAGE_KEYS.objects, seed.objects);
  },

  async createObject(input: Omit<PropertyObject, 'id'>): Promise<PropertyObject> {
    if (this.isPocketBaseEnabled()) {
      const hasValidClientId =
        Boolean(input.client_id) && !/^u\d+$/.test(input.client_id);
      const pbPayload: Record<string, unknown> = {
        name: input.name,
        address: input.address,
        lat: Number(input.lat),
        lng: Number(input.lng),
        client_name: input.client_name || '',
        units_count: Number(input.units_count) || 0,
      };
      if (hasValidClientId) {
        pbPayload.client_id = input.client_id;
      }
      const createdRemote = await pbRequest<PropertyObject>(
        `/api/collections/${pocketbaseConfig.collections.objects}/records`,
        {
          method: 'POST',
          body: JSON.stringify(pbPayload),
        }
      );
      if (!createdRemote) {
        throw new PocketBaseApiError('Objekt nije spremljen na PocketBase server.', 500);
      }
      return {
        ...createdRemote,
        lat: Number(createdRemote.lat),
        lng: Number(createdRemote.lng),
        units_count: Number(createdRemote.units_count) || 0,
      };
    }

    const created: PropertyObject = {
      ...input,
      id: `obj_${Date.now()}`,
    };
    const list = await this.getObjects();
    const updated = [...list, created];
    writeStorage(STORAGE_KEYS.objects, updated);
    return created;
  },

  // Tasks
  async getTasks(): Promise<FacilityTask[]> {
    if (this.isPocketBaseEnabled()) {
      const remote = await pbRequest<{ items: FacilityTask[] }>(
        `/api/collections/${pocketbaseConfig.collections.tasks}/records?perPage=200`
      );
      return (remote?.items ?? []).map(normalizeTaskRecord);
    }
    const seed = buildSeedData();
    return readStorage<FacilityTask[]>(STORAGE_KEYS.tasks, seed.tasks).map(normalizeTaskRecord);
  },

  async createTask(input: Omit<FacilityTask, 'id' | 'created_at'>): Promise<FacilityTask> {
    const compressedPhotos = (await compressPhotoList(input.photos)) ?? [];
    if (this.isPocketBaseEnabled()) {
      const pbPayload: Record<string, unknown> = {
        title: input.title,
        description: input.description ?? '',
        category: input.category,
        status: input.status || 'offen',
        priority: input.priority || 'normal',
        due_date: input.due_date,
        object_id: input.object_id,
        assigned_to: input.assigned_to || pb.authStore.model?.id || '',
        checklist_json: input.checklist_json ?? [],
        notes: input.notes ?? '',
        photos: compressedPhotos,
      };
      if (input.bin_types && input.bin_types.length > 0) {
        pbPayload.bin_types = input.bin_types;
      }
      if (input.address && input.address.trim()) {
        pbPayload.address = input.address.trim();
      }
      if (
        typeof input.lat === 'number' &&
        typeof input.lng === 'number' &&
        Number.isFinite(input.lat) &&
        Number.isFinite(input.lng) &&
        !(input.lat === 0 && input.lng === 0)
      ) {
        pbPayload.lat = input.lat;
        pbPayload.lng = input.lng;
      }
      const remoteCreated = await pbRequest<FacilityTask>(
        `/api/collections/${pocketbaseConfig.collections.tasks}/records`,
        {
          method: 'POST',
          body: JSON.stringify(pbPayload),
        }
      );
      if (!remoteCreated) {
        throw new PocketBaseApiError('Zadatak nije spremljen na PocketBase server.', 500);
      }
      return normalizeTaskRecord(remoteCreated);
    }

    const created: FacilityTask = {
      ...input,
      photos: compressedPhotos,
      id: `task_${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    const list = await this.getTasks();
    const updated = [created, ...list];
    writeStorage(STORAGE_KEYS.tasks, updated);
    return created;
  },

  async updateTask(id: string, patch: Partial<FacilityTask>): Promise<FacilityTask[]> {
    const normalizedPatch: Partial<FacilityTask> = patch.photos
      ? { ...patch, photos: await compressPhotoList(patch.photos) }
      : patch;

    if (this.isPocketBaseEnabled()) {
      const pbPatch: Record<string, unknown> = { ...normalizedPatch };
      if (normalizedPatch.status && normalizedPatch.status !== 'erledigt') {
        pbPatch.completed_at = null;
        pbPatch.completed_lat = null;
        pbPatch.completed_lng = null;
        pbPatch.completed_accuracy = null;
      }
      if ('signature' in normalizedPatch && !normalizedPatch.signature) {
        pbPatch.signature = null;
      }
      await pbRequest(`/api/collections/${pocketbaseConfig.collections.tasks}/records/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(pbPatch),
      });
      return this.getTasks();
    }
    const list = await this.getTasks();
    const updated = list.map((t) => {
      if (t.id !== id) return t;
      const merged: FacilityTask = { ...t, ...normalizedPatch };
      if (normalizedPatch.status && normalizedPatch.status !== 'erledigt') {
        merged.completed_at = undefined;
        merged.completed_lat = undefined;
        merged.completed_lng = undefined;
        merged.completed_accuracy = undefined;
      }
      if ('signature' in normalizedPatch && !normalizedPatch.signature) {
        delete merged.signature;
      }
      return merged;
    });
    writeStorage(STORAGE_KEYS.tasks, updated);
    return updated;
  },

  cacheTaskTranslationsLocal(
    updates: Array<{ id: string; translations: Record<string, TaskLocalizedContent> }>
  ): void {
    if (updates.length === 0 || this.isPocketBaseEnabled()) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.tasks);
      if (!raw) return;
      const list = JSON.parse(raw) as FacilityTask[];
      if (!Array.isArray(list)) return;
      const updateMap = new Map(updates.map((u) => [u.id, u.translations]));
      let changed = false;
      const next = list.map((t) => {
        const nextTrans = updateMap.get(t.id);
        if (!nextTrans) return t;
        changed = true;
        return { ...t, translations: nextTrans };
      });
      if (changed) {
        writeStorage(STORAGE_KEYS.tasks, next);
      }
    } catch {
      // Ignore storage errors safely for translation cache
    }
  },

  async deleteTask(id: string): Promise<FacilityTask[]> {
    if (this.isPocketBaseEnabled()) {
      await pbRequest(`/api/collections/${pocketbaseConfig.collections.tasks}/records/${id}`, {
        method: 'DELETE',
      });
      return this.getTasks();
    }
    const list = await this.getTasks();
    const updated = list.filter((t) => t.id !== id);
    writeStorage(STORAGE_KEYS.tasks, updated);
    return updated;
  },

  // Bin Schedules
  async getBinSchedules(): Promise<BinSchedule[]> {
    if (this.isPocketBaseEnabled()) {
      const remote = await pbRequest<{ items: BinSchedule[] }>(
        `/api/collections/${pocketbaseConfig.collections.bin_schedules}/records?perPage=200`
      );
      return remote?.items ?? [];
    }
    const seed = buildSeedData();
    return readStorage<BinSchedule[]>(STORAGE_KEYS.bins, seed.binSchedules);
  },

  async createBinSchedules(items: Array<Omit<BinSchedule, 'id'>>): Promise<BinSchedule[]> {
    if (this.isPocketBaseEnabled()) {
      for (const item of items) {
        await pbRequest(
          `/api/collections/${pocketbaseConfig.collections.bin_schedules}/records`,
          {
            method: 'POST',
            body: JSON.stringify(item),
          }
        );
      }
      return this.getBinSchedules();
    }
    const existing = await this.getBinSchedules();
    const created = items.map((item, idx) => ({
      ...item,
      id: `bin_${Date.now()}_${idx}`,
    }));
    const updated = [...existing, ...created];
    writeStorage(STORAGE_KEYS.bins, updated);
    return updated;
  },

  async updateBinSchedule(id: string, patch: Partial<BinSchedule>): Promise<BinSchedule[]> {
    const safePatch: Partial<BinSchedule> = patch.photo
      ? { ...patch, photo: await compressTaskPhotoIfNeeded(patch.photo) }
      : patch;

    if (this.isPocketBaseEnabled()) {
      const pbPatch: Record<string, unknown> = { ...safePatch };
      if (safePatch.status_out === false) {
        pbPatch.time_out = null;
      }
      if (safePatch.status_in === false) {
        pbPatch.time_in = null;
      }
      await pbRequest(
        `/api/collections/${pocketbaseConfig.collections.bin_schedules}/records/${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify(pbPatch),
        }
      );
      return this.getBinSchedules();
    }
    const list = await this.getBinSchedules();
    const updated = list.map((b) => (b.id === id ? { ...b, ...safePatch } : b));
    writeStorage(STORAGE_KEYS.bins, updated);
    return updated;
  },

  // Time Entries
  async getTimeEntries(): Promise<TimeEntry[]> {
    if (this.isPocketBaseEnabled()) {
      const activeUser = pb.authStore.model;
      const filterParam =
        activeUser && activeUser.role !== 'admin'
          ? `&filter=${encodeURIComponent(`user_id="${activeUser.id}"`)}`
          : '';
      const remote = await pbRequest<{ items: TimeEntry[] }>(
        `/api/collections/${pocketbaseConfig.collections.time_entries}/records?perPage=200${filterParam}`
      );
      return remote?.items ?? [];
    }
    const seed = buildSeedData();
    return readStorage<TimeEntry[]>(STORAGE_KEYS.timeEntries, seed.timeEntries);
  },

  async upsertTimeEntry(entry: TimeEntry): Promise<TimeEntry[]> {
    const activeUserId = pb.authStore.model?.id || entry.user_id;
    const boundEntry: TimeEntry = { ...entry, user_id: activeUserId };

    if (this.isPocketBaseEnabled()) {
      const isLocalTempId = boundEntry.id.startsWith('te_');
      if (!isLocalTempId) {
        await pbRequest<TimeEntry>(
          `/api/collections/${pocketbaseConfig.collections.time_entries}/records/${boundEntry.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify(boundEntry),
          }
        );
        return this.getTimeEntries();
      }

      const { id: _ignoredLocalId, ...createPayload } = boundEntry;
      await pbRequest<TimeEntry>(
        `/api/collections/${pocketbaseConfig.collections.time_entries}/records`,
        {
          method: 'POST',
          body: JSON.stringify(createPayload),
        }
      );
      return this.getTimeEntries();
    }

    const list = await this.getTimeEntries();
    const exists = list.some((e) => e.id === boundEntry.id);
    const updated = exists
      ? list.map((e) => (e.id === boundEntry.id ? boundEntry : e))
      : [boundEntry, ...list];
    writeStorage(STORAGE_KEYS.timeEntries, updated);
    return updated;
  },

  // Notifications
  async getNotifications(): Promise<AppNotification[]> {
    const seed = buildSeedData();
    return readStorage<AppNotification[]>(STORAGE_KEYS.notifications, seed.notifications);
  },

  async markNotificationRead(id: string): Promise<AppNotification[]> {
    const list = await this.getNotifications();
    const updated = list.map((n) => (n.id === id ? { ...n, read: true } : n));
    writeStorage(STORAGE_KEYS.notifications, updated);
    return updated;
  },

  async markAllNotificationsRead(): Promise<AppNotification[]> {
    const list = await this.getNotifications();
    const updated = list.map((n) => ({ ...n, read: true }));
    writeStorage(STORAGE_KEYS.notifications, updated);
    return updated;
  },

  // --- MODULE 1: Winterdienst (winter_logs) ---
  async getWinterLogs(): Promise<WinterLog[]> {
    if (this.isPocketBaseEnabled()) {
      const remote = await pbRequest<{ items: WinterLog[] }>(
        `/api/collections/${pocketbaseConfig.collections.winter_logs}/records?perPage=200`
      );
      return remote?.items ?? [];
    }
    const seed = buildSeedData();
    return readStorage<WinterLog[]>(STORAGE_KEYS.winterLogs, seed.winterLogs);
  },

  async createWinterLog(input: Omit<WinterLog, 'id'>): Promise<WinterLog[]> {
    const safeInput: Omit<WinterLog, 'id'> = input.photo
      ? { ...input, photo: await compressTaskPhotoIfNeeded(input.photo) }
      : input;

    if (this.isPocketBaseEnabled()) {
      await pbRequest(`/api/collections/${pocketbaseConfig.collections.winter_logs}/records`, {
        method: 'POST',
        body: JSON.stringify(safeInput),
      });
      return this.getWinterLogs();
    }
    const created: WinterLog = { ...safeInput, id: `wl_${Date.now()}` };
    const list = await this.getWinterLogs();
    const updated = [created, ...list];
    writeStorage(STORAGE_KEYS.winterLogs, updated);
    return updated;
  },

  // --- MODULE 2: Zählerstände (meter_readings) ---
  async getMeterReadings(): Promise<MeterReading[]> {
    if (this.isPocketBaseEnabled()) {
      const remote = await pbRequest<{ items: MeterReading[] }>(
        `/api/collections/${pocketbaseConfig.collections.meter_readings}/records?perPage=200`
      );
      return remote?.items ?? [];
    }
    const seed = buildSeedData();
    return readStorage<MeterReading[]>(STORAGE_KEYS.meterReadings, seed.meterReadings);
  },

  async createMeterReading(input: Omit<MeterReading, 'id'>): Promise<MeterReading[]> {
    const safeInput: Omit<MeterReading, 'id'> = input.photo
      ? { ...input, photo: await compressTaskPhotoIfNeeded(input.photo) }
      : input;

    if (this.isPocketBaseEnabled()) {
      await pbRequest(`/api/collections/${pocketbaseConfig.collections.meter_readings}/records`, {
        method: 'POST',
        body: JSON.stringify(safeInput),
      });
      return this.getMeterReadings();
    }
    const created: MeterReading = { ...safeInput, id: `mr_${Date.now()}` };
    const list = await this.getMeterReadings();
    const updated = [created, ...list];
    writeStorage(STORAGE_KEYS.meterReadings, updated);
    return updated;
  },

  // --- MODULE 3: Wohnungsübergabe (handover_protocols) ---
  async getHandoverProtocols(): Promise<HandoverProtocol[]> {
    if (this.isPocketBaseEnabled()) {
      const remote = await pbRequest<{ items: HandoverProtocol[] }>(
        `/api/collections/${pocketbaseConfig.collections.handover_protocols}/records?perPage=200`
      );
      return remote?.items ?? [];
    }
    const seed = buildSeedData();
    return readStorage<HandoverProtocol[]>(STORAGE_KEYS.handoverProtocols, seed.handoverProtocols);
  },

  async createHandoverProtocol(
    input: Omit<HandoverProtocol, 'id' | 'created_at'>
  ): Promise<{ created: HandoverProtocol; all: HandoverProtocol[] }> {
    const safeRooms = await Promise.all(
      input.rooms_json.map(async (r) =>
        r.photo ? { ...r, photo: await compressTaskPhotoIfNeeded(r.photo) } : r
      )
    );
    const safeInput: Omit<HandoverProtocol, 'id' | 'created_at'> = {
      ...input,
      rooms_json: safeRooms,
    };

    if (this.isPocketBaseEnabled()) {
      const createdRemote = await pbRequest<HandoverProtocol>(
        `/api/collections/${pocketbaseConfig.collections.handover_protocols}/records`,
        {
          method: 'POST',
          body: JSON.stringify({
            ...safeInput,
            created_at: new Date().toISOString(),
          }),
        }
      );
      if (!createdRemote) {
        throw new PocketBaseApiError('Zapisnik nije spremljen na PocketBase server.', 500);
      }
      const all = await this.getHandoverProtocols();
      return { created: createdRemote, all };
    }
    const created: HandoverProtocol = {
      ...safeInput,
      id: `hp_${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    const list = await this.getHandoverProtocols();
    const updated = [created, ...list];
    writeStorage(STORAGE_KEYS.handoverProtocols, updated);
    return { created, all: updated };
  },

  // --- MODULE 4: Gebäudereinigung (cleaning_logs) ---
  async getCleaningLogs(): Promise<CleaningLog[]> {
    if (this.isPocketBaseEnabled()) {
      const remote = await pbRequest<{ items: CleaningLog[] }>(
        `/api/collections/${pocketbaseConfig.collections.cleaning_logs}/records?perPage=200`
      );
      return remote?.items ?? [];
    }
    const seed = buildSeedData();
    return readStorage<CleaningLog[]>(STORAGE_KEYS.cleaningLogs, seed.cleaningLogs);
  },

  async createCleaningLog(input: Omit<CleaningLog, 'id'>): Promise<CleaningLog[]> {
    const safeInput: Omit<CleaningLog, 'id'> = input.photo
      ? { ...input, photo: await compressTaskPhotoIfNeeded(input.photo) }
      : input;

    if (this.isPocketBaseEnabled()) {
      await pbRequest(`/api/collections/${pocketbaseConfig.collections.cleaning_logs}/records`, {
        method: 'POST',
        body: JSON.stringify(safeInput),
      });
      return this.getCleaningLogs();
    }
    const created: CleaningLog = { ...safeInput, id: `cl_${Date.now()}` };
    const list = await this.getCleaningLogs();
    const updated = [created, ...list];
    writeStorage(STORAGE_KEYS.cleaningLogs, updated);
    return updated;
  },

  // --- MODULE 5: Garten- & Grünflächenpflege (garden_logs) ---
  async getGardenLogs(): Promise<GardenLog[]> {
    if (this.isPocketBaseEnabled()) {
      const remote = await pbRequest<{ items: GardenLog[] }>(
        `/api/collections/${pocketbaseConfig.collections.garden_logs}/records?perPage=200`
      );
      return remote?.items ?? [];
    }
    const seed = buildSeedData();
    return readStorage<GardenLog[]>(STORAGE_KEYS.gardenLogs, seed.gardenLogs);
  },

  async createGardenLog(input: Omit<GardenLog, 'id'>): Promise<GardenLog[]> {
    const safePhotos = {
      before: input.photos.before
        ? await compressTaskPhotoIfNeeded(input.photos.before)
        : undefined,
      after: input.photos.after
        ? await compressTaskPhotoIfNeeded(input.photos.after)
        : undefined,
    };
    const safeInput: Omit<GardenLog, 'id'> = {
      ...input,
      photos: safePhotos,
    };

    if (this.isPocketBaseEnabled()) {
      await pbRequest(`/api/collections/${pocketbaseConfig.collections.garden_logs}/records`, {
        method: 'POST',
        body: JSON.stringify(safeInput),
      });
      return this.getGardenLogs();
    }
    const created: GardenLog = { ...safeInput, id: `gl_${Date.now()}` };
    const list = await this.getGardenLogs();
    const updated = [created, ...list];
    writeStorage(STORAGE_KEYS.gardenLogs, updated);
    return updated;
  },

  resetAllData(): void {
    Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
  },
};
