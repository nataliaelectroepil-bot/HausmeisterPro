export type UserRole = 'worker' | 'admin' | 'client_hausverwaltung';

export type LanguageCode = 'DE' | 'HR' | 'SQ' | 'EN' | 'PL' | 'TR' | 'RU';
export type DocLanguageCode = 'DE' | 'EN' | 'HR' | 'SQ';

export interface User {
  id: string;
  employee_id: string;
  name: string;
  email: string;
  role: UserRole;
  phone: string;
  region: string;
  language?: LanguageCode;
}

export interface PropertyObject {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  client_id: string;
  client_name: string;
  units_count: number;
}

export type TaskCategory =
  | 'Mülltonnendienst'
  | 'Reinigung'
  | 'Außenanlagenpflege'
  | 'Winterdienst'
  | 'Baustelle / Reparatur';

export type TaskStatus = 'offen' | 'in_bearbeitung' | 'erledigt';
export type TaskPriority = 'normal' | 'hoch' | 'dringend';

export interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

export interface TaskPhoto {
  id: string;
  dataUrl: string;
  timestamp: string;
  lat?: number;
  lng?: number;
  caption?: string;
}

export interface FacilityTask {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string; // ISO string YYYY-MM-DDTHH:mm
  created_at: string;
  object_id: string;
  assigned_to: string; // user.id
  checklist_json: ChecklistItem[];
  notes: string;
  photos: TaskPhoto[];
  bin_types?: BinType[];
  signature?: string; // base64 PNG dataUrl
  completed_at?: string;
}

export type BinType = 'Restmüll' | 'Papier' | 'Gelbe Tonne' | 'Bio';

export interface BinSchedule {
  id: string;
  object_id: string;
  bin_type: BinType;
  pickup_date: string; // YYYY-MM-DD
  kw: number;
  year: number;
  status_out: boolean;
  time_out?: string; // ISO timestamp
  status_in: boolean;
  time_in?: string; // ISO timestamp
  photo?: TaskPhoto;
  recurring_group_id?: string;
}

export type ShiftStatus = 'nicht_begonnen' | 'aktiv' | 'pause' | 'beendet';

export interface TimeEntry {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  start_time: string; // ISO timestamp
  end_time?: string; // ISO timestamp
  total_pause_minutes: number;
  total_work_minutes: number;
  status: ShiftStatus;
  pause_started_at?: string;
  notes?: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  created_at: string;
  read: boolean;
  type: 'overdue' | 'reminder' | 'bin' | 'system';
  target_tab?: ActiveTab;
}

// --- 5 Specialized Enterprise Modules ---

export type WinterActionType =
  | 'Schnee geräumt'
  | 'Salz gestreut'
  | 'Splitt gestreut'
  | 'Kontrollfahrt ohne Einsatz';

export interface WinterLog {
  id: string;
  object_id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  lat: number;
  lng: number;
  temp_celsius: number;
  weather_desc: string;
  action_type: WinterActionType;
  salt_kg: number;
  photo?: TaskPhoto;
  signature?: string;
  notes?: string;
  pdf_url?: string;
}

export type MeterType =
  | 'Strom'
  | 'Kaltwasser'
  | 'Warmwasser'
  | 'Gas'
  | 'Wärmemengenzähler';

export interface MeterReading {
  id: string;
  object_id: string;
  apartment: string;
  meter_number: string;
  meter_type: MeterType;
  reading_value: number;
  previous_value: number;
  photo?: TaskPhoto;
  read_by: string; // user.id
  read_date: string; // YYYY-MM-DDTHH:mm
}

export type HandoverType = 'Einzug' | 'Auszug';

export interface HandoverRoomCheck {
  room: string;
  condition: 'Einwandfrei' | 'Mängel vorhanden';
  notes: string;
  photo?: TaskPhoto;
}

export interface HandoverKeys {
  haustuer: number;
  wohnungstuer: number;
  briefkasten: number;
  keller: number;
  garage: number;
}

export interface HandoverMeterEntry {
  label: string;
  meter_number: string;
  value: string;
}

export interface HandoverProtocol {
  id: string;
  object_id: string;
  apartment: string;
  type: HandoverType;
  landlord_name: string;
  tenant_name: string;
  tenant_email: string;
  rooms_json: HandoverRoomCheck[];
  keys_json: HandoverKeys;
  meters_json: HandoverMeterEntry[];
  signature_landlord?: string;
  signature_tenant?: string;
  created_at: string;
}

export interface CleaningLog {
  id: string;
  object_id: string;
  user_id: string;
  scan_timestamp: string;
  qr_code_id: string;
  lat?: number;
  lng?: number;
  checklist_json: ChecklistItem[];
  photo?: TaskPhoto;
  status: 'Erledigt' | 'Mängelmeldung';
  notes?: string;
}

export interface GardenMaterials {
  duenger_kg: number;
  rasensamen_kg: number;
  rindenmulch_saecke: number;
}

export interface GardenLog {
  id: string;
  object_id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  tasks_json: string[];
  materials_json: GardenMaterials;
  waste_volume: number; // m³ / Anhänger
  duration_minutes: number;
  photos: {
    before?: TaskPhoto;
    after?: TaskPhoto;
  };
  notes?: string;
}

export type ActiveTab =
  | 'karte'
  | 'aufgaben'
  | 'muelltonnen'
  | 'kalender'
  | 'arbeitszeit'
  | 'disposition'
  | 'winterdienst'
  | 'zaehlerstand'
  | 'uebergabe'
  | 'reinigung'
  | 'garten';
