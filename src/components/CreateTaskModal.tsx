import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Camera,
  Check,
  CheckCircle2,
  Loader2,
  MapPin,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import {
  BinType,
  ChecklistItem,
  FacilityTask,
  PropertyObject,
  TaskCategory,
  TaskPhoto,
  TaskPriority,
  User,
} from '../types/facility';
import { BIN_TYPE_ORDER, BIN_VISUAL_META } from '../utils/binMeta';
import { getTodayISODate } from '../utils/dateUtils';
import { searchAddressCoordinates } from '../utils/geocoding';
import { createWatermarkedPhoto } from '../utils/photoWatermark';

interface CreateTaskModalProps {
  objects: PropertyObject[];
  users: User[];
  currentUser: User;
  defaultDate?: string;
  onClose: () => void;
  onCreateObject: (obj: Omit<PropertyObject, 'id'>) => Promise<PropertyObject>;
  onCreateTask: (task: Omit<FacilityTask, 'id' | 'created_at'>) => Promise<void>;
}

const CATEGORIES: TaskCategory[] = [
  'Mülltonnendienst',
  'Reinigung',
  'Außenanlagenpflege',
  'Winterdienst',
  'Baustelle / Reparatur',
];

const DEFAULT_CHECKLISTS: Record<TaskCategory, string[]> = {
  Mülltonnendienst: [
    'Tonnenstandplatz auf Sauberkeit prüfen',
    'Behälter ordnungsgemäß bereitstellen / zurückstellen',
  ],
  Reinigung: [
    'Eingangsbereich & Treppenhaus kehren/wischen',
    'Handläufe & Briefkästen reinigen',
    'Glasflächen prüfen',
  ],
  Außenanlagenpflege: [
    'Gehwege und Zufahrten fegen',
    'Grünflächen / Beete von Unrat befreien',
  ],
  Winterdienst: [
    'Gehwege & Hauseingänge räumen',
    'Streugut ausbringen & Streukiste prüfen',
  ],
  'Baustelle / Reparatur': [
    'Schadensbild dokumentieren',
    'Instandsetzung / Sicherung durchführen',
    'Funktionsprüfung nach Abschluss',
  ],
};

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
  objects,
  users,
  currentUser,
  defaultDate,
  onClose,
  onCreateObject,
  onCreateTask,
}) => {
  const { t, tCategory, tPriority } = useTranslation();
  const workers = users.filter((u) => u.role === 'worker' || u.role === 'admin');

  const [category, setCategory] = useState<TaskCategory>('Reinigung');
  const [selectedBinTypes, setSelectedBinTypes] = useState<BinType[]>([]);
  const [binValidationError, setBinValidationError] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [addressMode, setAddressMode] = useState<'existing' | 'manual' | 'newObject'>(
    objects.length > 0 ? 'existing' : 'manual'
  );
  const [objectId, setObjectId] = useState<string>(objects[0]?.id ?? '');
  const [assignedTo, setAssignedTo] = useState<string>(currentUser.id);
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [dueDate, setDueDate] = useState<string>(defaultDate || getTodayISODate());
  const [dueTime, setDueTime] = useState<string>('10:00');
  const [photos, setPhotos] = useState<TaskPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [savingObject, setSavingObject] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Manual standalone task address + auto-geocoding
  const [manualAddress, setManualAddress] = useState('');
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [manualGeocodedFor, setManualGeocodedFor] = useState('');

  // New Object inline creation + Nominatim geocoding
  const [newObjName, setNewObjName] = useState('');
  const [newObjAddress, setNewObjAddress] = useState('');
  const [newObjLat, setNewObjLat] = useState<string>('');
  const [newObjLng, setNewObjLng] = useState<string>('');
  const [newObjGeocodedFor, setNewObjGeocodedFor] = useState('');
  const [geocodingLoading, setGeocodingLoading] = useState(false);
  const [geocodingStatus, setGeocodingStatus] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!objectId && objects.length > 0) {
      setObjectId(objects[0].id);
    }
  }, [objects, objectId]);

  const selectedObject = objects.find((o) => o.id === objectId);

  const parseCoords = (latStr: string, lngStr: string): { lat: number; lng: number } | null => {
    const lat = parseFloat(latStr.replace(',', '.'));
    const lng = parseFloat(lngStr.replace(',', '.'));
    if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
      return { lat, lng };
    }
    return null;
  };

  const handleGeocode = async (target: 'manual' | 'newObject') => {
    const addr = (target === 'manual' ? manualAddress : newObjAddress).trim();
    setGeocodingLoading(true);
    setGeocodingStatus(null);
    setModalError(null);
    try {
      const result = await searchAddressCoordinates(addr);
      if (target === 'manual') {
        setManualLat(result.lat.toFixed(5));
        setManualLng(result.lng.toFixed(5));
        setManualGeocodedFor(addr.toLowerCase());
      } else {
        setNewObjLat(result.lat.toFixed(5));
        setNewObjLng(result.lng.toFixed(5));
        setNewObjGeocodedFor(addr.toLowerCase());
      }
      setGeocodingStatus({
        type: 'success',
        text: t('createTask.coordsFound', {
          lat: result.lat.toFixed(5),
          lng: result.lng.toFixed(5),
        }),
      });
    } catch (err) {
      setGeocodingStatus({
        type: 'error',
        text: err instanceof Error ? err.message : t('createTask.coordsErrFail'),
      });
    } finally {
      setGeocodingLoading(false);
    }
  };

  const resolveCoordsForAddress = async (
    addr: string,
    latStr: string,
    lngStr: string,
    geocodedFor: string
  ): Promise<{ lat: number; lng: number }> => {
    const normalizedAddr = addr.trim().toLowerCase();
    const existingParsed = parseCoords(latStr, lngStr);
    if (existingParsed && (!geocodedFor || geocodedFor === normalizedAddr)) {
      return existingParsed;
    }
    const result = await searchAddressCoordinates(addr.trim());
    return { lat: result.lat, lng: result.lng };
  };

  const handleSaveNewObject = async () => {
    setModalError(null);
    if (!newObjName.trim() || !newObjAddress.trim()) {
      setGeocodingStatus({
        type: 'error',
        text: t('createTask.coordsErrEmpty'),
      });
      return;
    }

    let coords: { lat: number; lng: number };
    try {
      setGeocodingLoading(true);
      coords = await resolveCoordsForAddress(
        newObjAddress,
        newObjLat,
        newObjLng,
        newObjGeocodedFor
      );
      setNewObjLat(coords.lat.toFixed(5));
      setNewObjLng(coords.lng.toFixed(5));
      setNewObjGeocodedFor(newObjAddress.trim().toLowerCase());
    } catch (err) {
      setGeocodingStatus({
        type: 'error',
        text: err instanceof Error ? err.message : t('createTask.coordsErrFail'),
      });
      return;
    } finally {
      setGeocodingLoading(false);
    }

    const clientUser = users.find((u) => u.role === 'client_hausverwaltung');
    setSavingObject(true);
    try {
      const created = await onCreateObject({
        name: newObjName.trim(),
        address: newObjAddress.trim(),
        lat: coords.lat,
        lng: coords.lng,
        client_id: clientUser?.id ?? '',
        client_name: clientUser?.region || '',
        units_count: 16,
      });
      setObjectId(created.id);
      setAddressMode('existing');
      setNewObjName('');
      setNewObjAddress('');
      setNewObjLat('');
      setNewObjLng('');
      setNewObjGeocodedFor('');
      setGeocodingStatus(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Objekt nije spremljen na server.';
      setGeocodingStatus({ type: 'error', text: msg });
      setModalError(msg);
    } finally {
      setSavingObject(false);
    }
  };

  const handlePhotoAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fallbackManualCoords =
      addressMode === 'manual'
        ? parseCoords(manualLat, manualLng)
        : addressMode === 'newObject'
        ? parseCoords(newObjLat, newObjLng)
        : null;
    const watermarked = await createWatermarkedPhoto(file, {
      objectName:
        addressMode === 'existing'
          ? selectedObject?.name ?? t('common.object')
          : newObjName.trim() || manualAddress.trim() || newObjAddress.trim() || t('common.object'),
      fallbackLat:
        addressMode === 'existing' ? selectedObject?.lat : fallbackManualCoords?.lat,
      fallbackLng:
        addressMode === 'existing' ? selectedObject?.lng : fallbackManualCoords?.lng,
    });
    setPhotos((prev) => [...prev, watermarked]);
    e.target.value = '';
  };

  const toggleBinType = (bin: BinType) => {
    setBinValidationError(false);
    setSelectedBinTypes((prev) =>
      prev.includes(bin) ? prev.filter((item) => item !== bin) : [...prev, bin]
    );
  };

  const getBinOptionLabel = (bin: BinType): string => {
    switch (bin) {
      case 'Restmüll':
        return t('createTask.binRestmuell');
      case 'Bio':
        return t('createTask.binBio');
      case 'Papier':
        return t('createTask.binPapier');
      case 'Gelbe Tonne':
        return t('createTask.binGelb');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    if (!title.trim()) return;
    if (category === 'Mülltonnendienst' && selectedBinTypes.length === 0) {
      setBinValidationError(true);
      return;
    }

    if (addressMode === 'existing' && !objectId) {
      setModalError(t('createTask.addrRequired'));
      return;
    }
    if (addressMode === 'manual' && !manualAddress.trim()) {
      setModalError(t('createTask.addrRequired'));
      return;
    }
    if (addressMode === 'newObject' && !newObjAddress.trim()) {
      setModalError(t('createTask.addrRequired'));
      return;
    }

    setSubmitting(true);
    try {
      const checklist: ChecklistItem[] = DEFAULT_CHECKLISTS[category].map((label, idx) => ({
        id: `chk_${Date.now()}_${idx}`,
        label,
        checked: false,
      }));

      let finalObjectId = addressMode === 'existing' ? objectId : '';
      let taskAddress: string | undefined;
      let taskLat: number | undefined;
      let taskLng: number | undefined;

      if (addressMode === 'existing') {
        const obj = objects.find((o) => o.id === objectId);
        if (obj) {
          taskAddress = obj.address;
          taskLat = obj.lat;
          taskLng = obj.lng;
        }
      } else if (addressMode === 'manual') {
        const cleanAddr = manualAddress.trim();
        const coords = await resolveCoordsForAddress(
          cleanAddr,
          manualLat,
          manualLng,
          manualGeocodedFor
        );
        setManualLat(coords.lat.toFixed(5));
        setManualLng(coords.lng.toFixed(5));
        setManualGeocodedFor(cleanAddr.toLowerCase());
        taskAddress = cleanAddr;
        taskLat = coords.lat;
        taskLng = coords.lng;

        const matchingObj = objects.find(
          (o) => o.address.trim().toLowerCase() === cleanAddr.toLowerCase()
        );
        if (matchingObj) {
          finalObjectId = matchingObj.id;
        }
      } else if (addressMode === 'newObject') {
        const cleanAddr = newObjAddress.trim();
        const coords = await resolveCoordsForAddress(
          cleanAddr,
          newObjLat,
          newObjLng,
          newObjGeocodedFor
        );
        setNewObjLat(coords.lat.toFixed(5));
        setNewObjLng(coords.lng.toFixed(5));
        setNewObjGeocodedFor(cleanAddr.toLowerCase());

        const clientUser = users.find((u) => u.role === 'client_hausverwaltung');
        const createdObj = await onCreateObject({
          name: newObjName.trim() || cleanAddr,
          address: cleanAddr,
          lat: coords.lat,
          lng: coords.lng,
          client_id: clientUser?.id ?? '',
          client_name: clientUser?.region || '',
          units_count: 16,
        });
        finalObjectId = createdObj.id;
        taskAddress = createdObj.address;
        taskLat = createdObj.lat;
        taskLng = createdObj.lng;
      }

      const taskPayload: Omit<FacilityTask, 'id' | 'created_at'> = {
        title: title.trim(),
        description: description.trim(),
        category,
        status: 'offen',
        priority,
        due_date: `${dueDate}T${dueTime}`,
        object_id: finalObjectId,
        assigned_to: assignedTo,
        checklist_json: checklist,
        notes: '',
        photos,
        bin_types: category === 'Mülltonnendienst' ? selectedBinTypes : undefined,
        address: taskAddress,
        lat: taskLat,
        lng: taskLng,
      };

      try {
        await onCreateTask(taskPayload);
      } catch (taskErr) {
        const msg = taskErr instanceof Error ? taskErr.message.toLowerCase() : '';
        // If PocketBase schema requires object_id on tasks, auto-create & link a PropertyObject with the geocoded coordinates
        if (
          addressMode === 'manual' &&
          !finalObjectId &&
          taskAddress &&
          typeof taskLat === 'number' &&
          typeof taskLng === 'number' &&
          (msg.includes('object_id') || msg.includes('cannot be blank') || msg.includes('failed to create'))
        ) {
          const clientUser = users.find((u) => u.role === 'client_hausverwaltung');
          const createdObj = await onCreateObject({
            name: title.trim() || taskAddress,
            address: taskAddress,
            lat: taskLat,
            lng: taskLng,
            client_id: clientUser?.id ?? '',
            client_name: clientUser?.region || '',
            units_count: 1,
          });
          await onCreateTask({
            ...taskPayload,
            object_id: createdObj.id,
          });
        } else {
          throw taskErr;
        }
      }

      onClose();
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : 'Spremanje zadatka na PocketBase nije uspjelo.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/75 backdrop-blur-sm sm:p-4">
      <div className="w-full sm:max-w-xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            {t('createTask.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Art des Jobs */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              {t('createTask.jobType')}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setCategory(cat);
                    setBinValidationError(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    category === cat
                      ? 'bg-orange-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {tCategory(cat)}
                </button>
              ))}
            </div>
          </div>

          {/* Pflichtauswahl Tonnenart / Farbe bei Mülltonnendienst */}
          {category === 'Mülltonnendienst' && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3.5 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
                    <Trash2 className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                    <span>{t('createTask.binTypesLabel')}</span>
                  </label>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {t('createTask.binTypesHint')}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {BIN_TYPE_ORDER.map((bin) => {
                  const selected = selectedBinTypes.includes(bin);
                  const meta = BIN_VISUAL_META[bin];
                  return (
                    <button
                      key={bin}
                      type="button"
                      onClick={() => toggleBinType(bin)}
                      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition-all cursor-pointer min-h-[42px] ${
                        selected
                          ? meta.activeCardClass
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className={`h-3.5 w-3.5 rounded-full shrink-0 ${meta.dotClass} ${
                            selected ? 'ring-2 ring-white/80' : ''
                          }`}
                        />
                        <span className="truncate">{getBinOptionLabel(bin)}</span>
                      </span>
                      {selected && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              {binValidationError && selectedBinTypes.length === 0 && (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('createTask.binTypesRequired')}</span>
                </p>
              )}
            </div>
          )}

          {/* Aufgabentitel */}
          <div>
            <label
              htmlFor="new-task-title"
              className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5"
            >
              {t('createTask.taskTitle')}
            </label>
            <input
              id="new-task-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('createTask.taskTitlePlaceholder')}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:border-orange-500 focus:outline-none"
            />
          </div>

          {/* Adresse / Objekt + Manuelle Adresse + Neues Objekt anlegen */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <label
                htmlFor="new-task-object"
                className="text-xs font-semibold text-slate-600 dark:text-slate-300"
              >
                {t('createTask.objectLabel')}
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                {objects.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setAddressMode('existing');
                      setGeocodingStatus(null);
                      setModalError(null);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                      addressMode === 'existing'
                        ? 'bg-slate-900 text-white dark:bg-orange-500'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {t('createTask.useSelection')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setAddressMode('manual');
                    setGeocodingStatus(null);
                    setModalError(null);
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    addressMode === 'manual'
                      ? 'bg-slate-900 text-white dark:bg-orange-500'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <MapPin className="w-3 h-3" />
                  <span>{t('createTask.manualAddress')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddressMode('newObject');
                    setGeocodingStatus(null);
                    setModalError(null);
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    addressMode === 'newObject'
                      ? 'bg-slate-900 text-white dark:bg-orange-500'
                      : 'bg-slate-100 dark:bg-slate-800 text-orange-600 dark:text-orange-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <Plus className="w-3 h-3" />
                  <span>{t('createTask.newObject')}</span>
                </button>
              </div>
            </div>

            {addressMode === 'existing' && (
              <select
                id="new-task-object"
                value={objectId}
                onChange={(e) => setObjectId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:border-orange-500 focus:outline-none"
              >
                {objects.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} — {o.address}
                  </option>
                ))}
              </select>
            )}

            {addressMode === 'manual' && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3.5 space-y-2.5">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                  {t('createTask.objAddrLabel')}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={manualAddress}
                    onChange={(e) => {
                      setManualAddress(e.target.value);
                      if (e.target.value.trim().toLowerCase() !== manualGeocodedFor) {
                        setManualLat('');
                        setManualLng('');
                      }
                    }}
                    placeholder={t('createTask.objAddrPlaceholder')}
                    className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-orange-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void handleGeocode('manual')}
                    disabled={geocodingLoading || !manualAddress.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-orange-500 hover:bg-slate-800 dark:hover:bg-orange-600 disabled:opacity-50 px-3 py-2 text-xs font-semibold text-white whitespace-nowrap cursor-pointer"
                  >
                    {geocodingLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Search className="w-3.5 h-3.5" />
                    )}
                    <span>{t('createTask.findCoords')}</span>
                  </button>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t('createTask.manualAddrHint')}
                </p>

                {geocodingStatus && (
                  <p
                    className={`text-xs font-medium flex items-center gap-1 ${
                      geocodingStatus.type === 'success'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {geocodingStatus.type === 'success' && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {geocodingStatus.text}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {t('createTask.lat')}
                    </label>
                    <input
                      type="text"
                      value={manualLat}
                      onChange={(e) => setManualLat(e.target.value)}
                      placeholder="auto"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {t('createTask.lng')}
                    </label>
                    <input
                      type="text"
                      value={manualLng}
                      onChange={(e) => setManualLng(e.target.value)}
                      placeholder="auto"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            )}

            {addressMode === 'newObject' && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3.5 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    {t('createTask.objNameLabel')}
                  </label>
                  <input
                    type="text"
                    value={newObjName}
                    onChange={(e) => setNewObjName(e.target.value)}
                    placeholder={t('createTask.objNamePlaceholder')}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    {t('createTask.objAddrLabel')}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      value={newObjAddress}
                      onChange={(e) => {
                        setNewObjAddress(e.target.value);
                        if (e.target.value.trim().toLowerCase() !== newObjGeocodedFor) {
                          setNewObjLat('');
                          setNewObjLng('');
                        }
                      }}
                      placeholder={t('createTask.objAddrPlaceholder')}
                      className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => void handleGeocode('newObject')}
                      disabled={geocodingLoading || !newObjAddress.trim()}
                      className="flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-orange-500 hover:bg-slate-800 dark:hover:bg-orange-600 disabled:opacity-50 px-3 py-2 text-xs font-semibold text-white whitespace-nowrap cursor-pointer"
                    >
                      {geocodingLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Search className="w-3.5 h-3.5" />
                      )}
                      <span>{t('createTask.findCoords')}</span>
                    </button>
                  </div>
                </div>

                {geocodingStatus && (
                  <p
                    className={`text-xs font-medium flex items-center gap-1 ${
                      geocodingStatus.type === 'success'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {geocodingStatus.type === 'success' && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {geocodingStatus.text}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {t('createTask.lat')}
                    </label>
                    <input
                      type="text"
                      value={newObjLat}
                      onChange={(e) => setNewObjLat(e.target.value)}
                      placeholder="auto"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {t('createTask.lng')}
                    </label>
                    <input
                      type="text"
                      value={newObjLng}
                      onChange={(e) => setNewObjLng(e.target.value)}
                      placeholder="auto"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveNewObject}
                    disabled={savingObject || geocodingLoading}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
                  >
                    {savingObject ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <MapPin className="w-3.5 h-3.5" />
                    )}
                    {savingObject ? t('common.saving') : t('createTask.saveSelectObj')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Date, Time, Priority */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="due-date"
                className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5"
              >
                {t('createTask.date')}
              </label>
              <input
                id="due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-mono text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label
                htmlFor="due-time"
                className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5"
              >
                {t('createTask.time')}
              </label>
              <input
                id="due-time"
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-mono text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label
                htmlFor="task-priority"
                className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5"
              >
                {t('createTask.priority')}
              </label>
              <select
                id="task-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
              >
                <option value="normal">{tPriority('normal')}</option>
                <option value="hoch">{tPriority('hoch')}</option>
                <option value="dringend">{tPriority('dringend')}</option>
              </select>
            </div>
          </div>

          {/* Assigned Worker */}
          <div>
            <label
              htmlFor="task-assignee"
              className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5"
            >
              {t('createTask.assignWorker')}
            </label>
            <select
              id="task-assignee"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
            >
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.employee_id}) — {w.region}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="task-desc"
              className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5"
            >
              {t('createTask.descLabel')}
            </label>
            <textarea
              id="task-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('createTask.descPlaceholder')}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-sm text-slate-900 dark:text-white"
            />
          </div>

          {/* Photo Attachment */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {t('createTask.attachPhoto')}
              </span>
              <label className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                <Camera className="w-3.5 h-3.5 text-orange-500" />
                <span>{t('createTask.choosePhoto')}</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handlePhotoAdd}
                />
              </label>
            </div>
            {photos.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pt-1">
                {photos.map((p) => (
                  <img
                    key={p.id}
                    src={p.dataUrl}
                    alt={t('createTask.choosePhoto')}
                    referrerPolicy="no-referrer"
                    className="h-16 w-20 object-cover rounded-lg border border-slate-200 dark:border-slate-700"
                  />
                ))}
              </div>
            )}
          </div>

          {modalError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 px-3.5 py-2.5 text-xs font-semibold text-red-700 dark:text-red-300"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="break-words">{modalError}</span>
            </div>
          )}

          {/* Footer Submit */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={
                submitting ||
                !title.trim() ||
                (addressMode === 'existing' && !objectId) ||
                (addressMode === 'manual' && !manualAddress.trim()) ||
                (addressMode === 'newObject' && !newObjAddress.trim()) ||
                (category === 'Mülltonnendienst' && selectedBinTypes.length === 0)
              }
              className="rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 px-5 py-2.5 text-sm font-semibold text-white transition-colors cursor-pointer"
            >
              {submitting ? t('common.saving') : t('createTask.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
