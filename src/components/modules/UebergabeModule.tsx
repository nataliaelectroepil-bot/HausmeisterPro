import React, { useEffect, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileDown,
  FileSignature,
  Gauge,
  KeyRound,
  Loader2,
  Mail,
  Minus,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  HandoverKeys,
  HandoverMeterEntry,
  HandoverProtocol,
  HandoverRoomCheck,
  HandoverType,
  MeterType,
  PropertyObject,
  User,
} from '../../types/facility';
import { formatDateTimeDE } from '../../utils/dateUtils';
import { exportHandoverProtocolPDF } from '../../utils/pdfExport';
import { createWatermarkedPhoto } from '../../utils/photoWatermark';
import { SignaturePad } from '../SignaturePad';
import { CompleteTaskModal } from '../CompleteTaskModal';
import { useTranslation } from '../../i18n/LanguageContext';
import { useTaskTranslation } from '../../i18n/TaskTranslationContext';
import { ROOM_LABELS } from '../../i18n/translations';

interface UebergabeModuleProps {
  objects: PropertyObject[];
  currentUser: User;
  protocols: HandoverProtocol[];
  initialObjectId?: string;
  onCreateProtocol: (
    protocol: Omit<HandoverProtocol, 'id' | 'created_at'>
  ) => Promise<HandoverProtocol>;
  onJumpToMeters: (objectId: string) => void;
}

const DEFAULT_ROOMS: HandoverRoomCheck[] = [
  { id: 'def_living', room: 'Wohnzimmer', condition: 'Einwandfrei', notes: '' },
  { id: 'def_kitchen', room: 'Küche', condition: 'Einwandfrei', notes: '' },
  { id: 'def_bath', room: 'Bad', condition: 'Einwandfrei', notes: '' },
  { id: 'def_bedroom', room: 'Schlafzimmer', condition: 'Einwandfrei', notes: '' },
  { id: 'def_hall', room: 'Flur', condition: 'Einwandfrei', notes: '' },
  { id: 'def_balcony', room: 'Balkon/Keller', condition: 'Einwandfrei', notes: '' },
];

const ROOM_PRESETS = [
  'Kinderzimmer',
  'Schlafzimmer',
  'Flur',
  'Balkon',
  'Arbeitszimmer',
  'Gäste-WC',
  'Abstellraum',
  'Terrasse',
  'Keller',
  'Garage',
];

export const UebergabeModule: React.FC<UebergabeModuleProps> = ({
  objects,
  currentUser,
  protocols,
  initialObjectId,
  onCreateProtocol,
  onJumpToMeters,
}) => {
  const { t, tHandoverType, tRoom, tMeterType, docLanguage, language } = useTranslation();
  const { translateText, ensureTextsTranslated, registerDynamicTexts } = useTaskTranslation();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [type, setType] = useState<HandoverType>('Einzug');
  const [objectId, setObjectId] = useState<string>(
    initialObjectId || objects[0]?.id || ''
  );
  const [apartment, setApartment] = useState<string>('Whg. 05 (2. OG rechts)');
  const [landlordName, setLandlordName] = useState<string>(
    `${currentUser.name} (${currentUser.employee_id})`
  );
  const [tenantName, setTenantName] = useState<string>('');
  const [tenantEmail, setTenantEmail] = useState<string>('');

  const [rooms, setRooms] = useState<HandoverRoomCheck[]>(() =>
    DEFAULT_ROOMS.map((r) => ({ ...r }))
  );
  const [editedRoomNoteKeys, setEditedRoomNoteKeys] = useState<Set<string>>(() => new Set());
  const [keys, setKeys] = useState<HandoverKeys>({
    haustuer: 2,
    wohnungstuer: 3,
    briefkasten: 2,
    keller: 1,
    garage: 0,
  });
  const [meters, setMeters] = useState<HandoverMeterEntry[]>([
    { label: 'Strom', meter_number: '', value: '' },
    { label: 'Kaltwasser', meter_number: '', value: '' },
    { label: 'Warmwasser', meter_number: '', value: '' },
  ]);

  const [sigLandlord, setSigLandlord] = useState<string | undefined>(undefined);
  const [sigTenant, setSigTenant] = useState<string | undefined>(undefined);
  const [lastCreated, setLastCreated] = useState<HandoverProtocol | null>(null);
  const [uploadingRoomIdx, setUploadingRoomIdx] = useState<number | null>(null);
  const [photoChoiceRoomIdx, setPhotoChoiceRoomIdx] = useState<number | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [showAddRoomPanel, setShowAddRoomPanel] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [exportingPdfId, setExportingPdfId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialObjectId) setObjectId(initialObjectId);
  }, [initialObjectId]);

  useEffect(() => {
    setEditedRoomNoteKeys(new Set());
  }, [language]);

  useEffect(() => {
    const texts: string[] = [];
    for (const r of rooms) {
      if (!(r.room in ROOM_LABELS) && r.room.trim()) {
        texts.push(r.room);
      }
      if (r.notes.trim()) {
        texts.push(r.notes);
      }
    }
    if (texts.length > 0) {
      registerDynamicTexts(texts);
    }
  }, [rooms, registerDynamicTexts]);

  const selectedObject = objects.find((o) => o.id === objectId);

  const handleRoomPhoto = async (idx: number, file: File) => {
    const targetRoom = rooms[idx];
    if (!targetRoom) return;
    setUploadingRoomIdx(idx);
    setPhotoError(null);
    try {
      const roomName = targetRoom.room;
      const objName = selectedObject?.name ?? t('common.object');
      const photo = await createWatermarkedPhoto(file, {
        objectName: `${objName} · ${apartment}`,
        fallbackLat: selectedObject?.lat,
        fallbackLng: selectedObject?.lng,
        caption: `Übergabe ${roomName}`,
      });
      setRooms((prev) =>
        prev.map((r, i) => (i === idx ? { ...r, photo } : r))
      );
      setPhotoChoiceRoomIdx(null);
    } catch (err) {
      setPhotoError(
        err instanceof Error ? err.message : 'Foto konnte nicht verarbeitet werden.'
      );
    } finally {
      setUploadingRoomIdx(null);
    }
  };

  const handleAddRoom = (roomLabel?: string) => {
    const trimmed = (roomLabel ?? newRoomName).trim();
    if (!trimmed) return;
    setRooms((prev) => [
      ...prev,
      {
        id: `room_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        room: trimmed,
        condition: 'Einwandfrei',
        notes: '',
        isCustom: true,
      },
    ]);
    setNewRoomName('');
    setShowAddRoomPanel(false);
  };

  const handleRemoveRoom = (idx: number) => {
    setRooms((prev) => prev.filter((_, i) => i !== idx));
    if (photoChoiceRoomIdx === idx) {
      setPhotoChoiceRoomIdx(null);
    }
  };

  const handleRemoveRoomPhoto = (idx: number) => {
    setRooms((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, photo: undefined } : r))
    );
  };

  const translateProtocolForPdf = async (
    proto: HandoverProtocol
  ): Promise<HandoverProtocol> => {
    const texts: string[] = [];
    for (const r of proto.rooms_json) {
      if (!(r.room in ROOM_LABELS) && r.room.trim()) {
        texts.push(r.room.trim());
      }
      if (r.notes?.trim()) {
        texts.push(r.notes.trim());
      }
    }
    if (texts.length === 0) return proto;
    const translatedMap = await ensureTextsTranslated(texts, language);
    return {
      ...proto,
      rooms_json: proto.rooms_json.map((r) => ({
        ...r,
        room:
          !(r.room in ROOM_LABELS) && r.room.trim()
            ? translatedMap[r.room.trim()] ?? r.room
            : r.room,
        notes: r.notes?.trim()
          ? translatedMap[r.notes.trim()] ?? r.notes
          : r.notes,
      })),
    };
  };

  const handleFinish = async () => {
    if (!tenantName.trim()) {
      setError(t('handover.errTenant'));
      setStep(1);
      return;
    }
    setError(null);
    setExportingPdfId('finish');
    try {
      const created = await onCreateProtocol({
        object_id: objectId,
        apartment: apartment.trim() || 'Wohnung',
        type,
        landlord_name: landlordName.trim(),
        tenant_name: tenantName.trim(),
        tenant_email: tenantEmail.trim(),
        rooms_json: rooms,
        keys_json: keys,
        meters_json: meters,
        signature_landlord: sigLandlord,
        signature_tenant: sigTenant,
      });
      setLastCreated(created);
      const translatedProtocol = await translateProtocolForPdf(created);
      exportHandoverProtocolPDF({
        protocol: translatedProtocol,
        obj: selectedObject,
        docLang: docLanguage,
      });
    } finally {
      setExportingPdfId(null);
    }
  };

  const resetWizard = () => {
    setStep(1);
    setTenantName('');
    setTenantEmail('');
    setRooms(DEFAULT_ROOMS.map((r) => ({ ...r })));
    setEditedRoomNoteKeys(new Set());
    setShowAddRoomPanel(false);
    setNewRoomName('');
    setSigLandlord(undefined);
    setSigTenant(undefined);
    setLastCreated(null);
  };

  const keyLabels: Array<{ key: keyof HandoverKeys; label: string }> = [
    { key: 'haustuer', label: t('handover.keyFront') },
    { key: 'wohnungstuer', label: t('handover.keyApt') },
    { key: 'briefkasten', label: t('handover.keyMail') },
    { key: 'keller', label: t('handover.keyCellar') },
    { key: 'garage', label: t('handover.keyGarage') },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <FileSignature className="w-6 h-6 text-orange-500" />
          {t('handover.title')}
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          {t('handover.subtitle')}
        </p>
      </div>

      {/* Step Indicator */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { num: 1 as const, label: t('handover.step1') },
          { num: 2 as const, label: t('handover.step2') },
          { num: 3 as const, label: t('handover.step3') },
          { num: 4 as const, label: t('handover.step4') },
        ].map((s) => (
          <button
            key={s.num}
            type="button"
            onClick={() => setStep(s.num)}
            className={`rounded-xl border py-2.5 px-2 text-xs font-semibold transition-colors cursor-pointer truncate ${
              step === s.num
                ? 'border-orange-500 bg-slate-900 text-white dark:bg-orange-500'
                : step > s.num
                  ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Wizard Body */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex gap-2">
              {(['Einzug', 'Auszug'] as HandoverType[]).map((ht) => (
                <button
                  key={ht}
                  type="button"
                  onClick={() => setType(ht)}
                  className={`flex-1 rounded-xl border py-2.5 text-sm font-bold transition-colors cursor-pointer ${
                    type === ht
                      ? 'border-orange-500 bg-orange-500 text-white'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {tHandoverType(ht)}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('common.object')}
                </label>
                <select
                  value={objectId}
                  onChange={(e) => setObjectId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
                >
                  {objects.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('handover.unitLabel')}
                </label>
                <input
                  type="text"
                  value={apartment}
                  onChange={(e) => setApartment(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('handover.landlordLabel')}
                </label>
                <input
                  type="text"
                  value={landlordName}
                  onChange={(e) => setLandlordName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('handover.tenantLabel')}
                </label>
                <input
                  type="text"
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  placeholder={t('handover.tenantPlaceholder')}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('handover.tenantEmailLabel')}
                </label>
                <input
                  type="email"
                  value={tenantEmail}
                  onChange={(e) => setTenantEmail(e.target.value)}
                  placeholder="mieter@beispiel.de"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            {rooms.map((roomItem, idx) => {
              const roomKey = roomItem.id || `${roomItem.room}_${idx}`;
              const isUploading = uploadingRoomIdx === idx;
              return (
                <div
                  key={roomKey}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-display text-sm font-bold text-slate-900 dark:text-white truncate">
                        {roomItem.room in ROOM_LABELS
                          ? tRoom(roomItem.room)
                          : translateText(roomItem.room)}
                      </span>
                      {roomItem.photo && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 className="w-3 h-3" />
                          {t('handover.photoAttached')}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {(['Einwandfrei', 'Mängel vorhanden'] as const).map((cond) => (
                        <button
                          key={cond}
                          type="button"
                          onClick={() =>
                            setRooms((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, condition: cond } : r))
                            )
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                            roomItem.condition === cond
                              ? cond === 'Einwandfrei'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-red-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {cond === 'Einwandfrei'
                            ? t('handover.condOk')
                            : t('handover.condDefect')}
                        </button>
                      ))}

                      {roomItem.isCustom && (
                        <button
                          type="button"
                          onClick={() => handleRemoveRoom(idx)}
                          aria-label={t('handover.deleteRoom')}
                          title={t('handover.deleteRoom')}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-red-600 hover:border-red-300 dark:hover:border-red-800 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={
                        editedRoomNoteKeys.has(roomKey)
                          ? roomItem.notes
                          : translateText(roomItem.notes)
                      }
                      onChange={(e) => {
                        const nextVal = e.target.value;
                        setEditedRoomNoteKeys((prev) => {
                          if (prev.has(roomKey)) return prev;
                          const next = new Set(prev);
                          next.add(roomKey);
                          return next;
                        });
                        setRooms((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, notes: nextVal } : r))
                        );
                      }}
                      placeholder={t('handover.roomNotesPlaceholder')}
                      className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-white"
                    />

                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={() => {
                        setPhotoError(null);
                        setPhotoChoiceRoomIdx(idx);
                      }}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 disabled:opacity-60 px-3.5 py-2 text-xs font-semibold text-white transition-colors cursor-pointer min-h-[38px] whitespace-nowrap"
                    >
                      {isUploading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                      ) : (
                        <Camera className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>
                        {isUploading
                          ? t('common.photoSending')
                          : roomItem.photo
                            ? t('handover.replacePhoto')
                            : t('handover.addPhoto')}
                      </span>
                    </button>
                  </div>

                  {roomItem.photo && (
                    <div className="flex items-center gap-3 pt-1">
                      <div className="relative h-16 w-24 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
                        <img
                          src={roomItem.photo.dataUrl}
                          alt={tRoom(roomItem.room)}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveRoomPhoto(idx)}
                          aria-label={t('handover.removePhoto')}
                          title={t('handover.removePhoto')}
                          className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded bg-slate-950/75 text-white hover:bg-red-600 transition-colors cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {formatDateTimeDE(roomItem.photo.timestamp)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add Another Room Section */}
            {!showAddRoomPanel ? (
              <button
                type="button"
                onClick={() => setShowAddRoomPanel(true)}
                className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-orange-500 dark:hover:border-orange-500 py-3 px-4 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:text-orange-600 dark:hover:text-orange-400 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{t('handover.addRoomBtn').replace(/^\+\s*/, '')}</span>
              </button>
            ) : (
              <div className="rounded-xl border border-orange-300 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    {t('handover.addRoomTitle')}
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddRoomPanel(false);
                      setNewRoomName('');
                    }}
                    aria-label={t('common.close')}
                    className="p-1 rounded-lg text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                    {t('handover.presetRoomsLabel')}
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {ROOM_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleAddRoom(preset)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-orange-500 hover:text-orange-600 dark:hover:text-orange-400 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>{tRoom(preset)}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-1">
                  <label
                    htmlFor="custom-room-name"
                    className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5"
                  >
                    {t('handover.customRoomLabel')}
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      id="custom-room-name"
                      type="text"
                      value={newRoomName}
                      onChange={(e) => setNewRoomName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddRoom();
                        }
                      }}
                      placeholder={t('handover.customRoomPlaceholder')}
                      className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-white focus:border-orange-500 focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddRoomPanel(false);
                          setNewRoomName('');
                        }}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        type="button"
                        disabled={!newRoomName.trim()}
                        onClick={() => handleAddRoom()}
                        className="flex items-center gap-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{t('handover.addRoomConfirm')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-3">
                <KeyRound className="w-4 h-4 text-orange-500" />
                {t('handover.keysTitle')}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {keyLabels.map(({ key, label }) => (
                  <div
                    key={key}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-center justify-between"
                  >
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                      {label}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setKeys((prev) => ({
                            ...prev,
                            [key]: Math.max(0, prev[key] - 1),
                          }))
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="font-mono text-sm font-bold w-6 text-center tabular-nums">
                        {keys[key]}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setKeys((prev) => ({ ...prev, [key]: prev[key] + 1 }))
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('handover.metersTitle')}
                </h3>
                <button
                  type="button"
                  onClick={() => onJumpToMeters(objectId)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline cursor-pointer"
                >
                  <Gauge className="w-3.5 h-3.5" />
                  {t('handover.jumpToScanner')}
                </button>
              </div>
              <div className="space-y-2.5">
                {meters.map((m, idx) => (
                  <div
                    key={m.label}
                    className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center rounded-xl border border-slate-200 dark:border-slate-800 p-3"
                  >
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                      {tMeterType(m.label as MeterType)}
                    </span>
                    <input
                      type="text"
                      value={m.meter_number}
                      onChange={(e) =>
                        setMeters((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, meter_number: e.target.value } : item
                          )
                        )
                      }
                      placeholder={t('handover.meterNumberPh')}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 font-mono text-xs"
                    />
                    <input
                      type="text"
                      value={m.value}
                      onChange={(e) =>
                        setMeters((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, value: e.target.value } : item
                          )
                        )
                      }
                      placeholder={t('handover.meterValPh')}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 font-mono text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <SignaturePad
                label={t('handover.sigLandlord', { name: landlordName })}
                value={sigLandlord}
                onChange={setSigLandlord}
              />
              <SignaturePad
                label={t('handover.sigTenant', {
                  name: tenantName || t('handover.tenantFallback'),
                })}
                value={sigTenant}
                onChange={setSigTenant}
              />
            </div>

            {lastCreated && (
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>{t('handover.doneBanner')}</span>
                </div>
                <div className="flex items-center gap-2">
                  {lastCreated.tenant_email && (
                    <a
                      href={`mailto:${encodeURIComponent(lastCreated.tenant_email)}?subject=${encodeURIComponent(
                        `Wohnungsübergabeprotokoll (${lastCreated.type}) – ${selectedObject?.name ?? ''} ${lastCreated.apartment}`
                      )}&body=${encodeURIComponent(
                        `Guten Tag ${lastCreated.tenant_name},\n\nanbei erhalten Sie die Zusammenfassung Ihres digitalen Übergabeprotokolls vom ${formatDateTimeDE(
                          lastCreated.created_at
                        )}. Das vollständige PDF-Protokoll wurde im System hinterlegt.\n\nMit freundlichen Grüßen\n${lastCreated.landlord_name}`
                      )}`}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-white"
                    >
                      <Mail className="w-3.5 h-3.5 text-orange-500" />
                      {t('handover.sendEmail')}
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={resetWizard}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
                  >
                    {t('handover.newProtocol')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>
        )}

        {/* Navigation Footer */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={step === 1}
            onClick={() => setStep((s) => Math.max(1, s - 1) as 1 | 2 | 3 | 4)}
            className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 disabled:opacity-40 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            {t('common.back')}
          </button>

          {step < 4 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(4, s + 1) as 1 | 2 | 3 | 4)}
              className="flex items-center gap-1 rounded-xl bg-slate-900 dark:bg-orange-500 hover:bg-slate-800 dark:hover:bg-orange-600 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white cursor-pointer"
            >
              {t('common.next')}
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={exportingPdfId === 'finish'}
              onClick={() => void handleFinish()}
              className="flex items-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-60 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white cursor-pointer"
            >
              {exportingPdfId === 'finish' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4" />
              )}
              {t('handover.finishBtn')}
            </button>
          )}
        </div>
      </div>

      {/* Saved Handover Protocols */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            {t('handover.historyTitle', { count: protocols.length })}
          </h2>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {protocols.map((p) => {
            const obj = objects.find((o) => o.id === p.object_id);
            const roomNoteSummaries = p.rooms_json
              .filter((r) => r.notes?.trim())
              .map((r) => {
                const rName = r.room in ROOM_LABELS ? tRoom(r.room) : translateText(r.room);
                return `${rName}: ${translateText(r.notes)}`;
              });
            return (
              <div
                key={p.id}
                className="p-4 sm:px-5 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                    {formatDateTimeDE(p.created_at)} · {tHandoverType(p.type)}
                  </p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {obj?.name ?? t('common.object')} — {p.apartment}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('handover.tenantFallback')}: {p.tenant_name}
                  </p>
                  {roomNoteSummaries.length > 0 && (
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                      {roomNoteSummaries.join(' · ')}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={exportingPdfId === p.id}
                  onClick={async () => {
                    setExportingPdfId(p.id);
                    try {
                      const translatedProto = await translateProtocolForPdf(p);
                      exportHandoverProtocolPDF({
                        protocol: translatedProto,
                        obj,
                        docLang: docLanguage,
                      });
                    } finally {
                      setExportingPdfId(null);
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-orange-500 disabled:opacity-60 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer shrink-0"
                >
                  {exportingPdfId === p.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-500" />
                  ) : (
                    <FileDown className="w-3.5 h-3.5 text-orange-500" />
                  )}
                  <span>{t('handover.downloadPdf')}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Room Photo Source Choice Modal (Camera vs Gallery) */}
      {photoChoiceRoomIdx !== null && rooms[photoChoiceRoomIdx] && (
        <CompleteTaskModal
          title={t('handover.photoModalTitle')}
          hint={t('handover.photoModalHint')}
          taskTitle={
            rooms[photoChoiceRoomIdx].room in ROOM_LABELS
              ? tRoom(rooms[photoChoiceRoomIdx].room)
              : translateText(rooms[photoChoiceRoomIdx].room)
          }
          subtitle={`${selectedObject?.name ?? t('common.object')} · ${apartment}`}
          allowWithoutPhoto={false}
          loading={uploadingRoomIdx === photoChoiceRoomIdx}
          error={photoError}
          onSelectPhoto={(file) => handleRoomPhoto(photoChoiceRoomIdx, file)}
          onClose={() => {
            if (uploadingRoomIdx !== null) return;
            setPhotoError(null);
            setPhotoChoiceRoomIdx(null);
          }}
        />
      )}
    </div>
  );
};
