import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileDown,
  FileSignature,
  Gauge,
  KeyRound,
  Mail,
  Minus,
  Plus,
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
import { PhotoUploadButtons } from '../PhotoUploadButtons';
import { useTranslation } from '../../i18n/LanguageContext';

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
  { room: 'Wohnzimmer', condition: 'Einwandfrei', notes: '' },
  { room: 'Küche', condition: 'Einwandfrei', notes: '' },
  { room: 'Bad', condition: 'Einwandfrei', notes: '' },
  { room: 'Schlafzimmer', condition: 'Einwandfrei', notes: '' },
  { room: 'Flur', condition: 'Einwandfrei', notes: '' },
  { room: 'Balkon/Keller', condition: 'Einwandfrei', notes: '' },
];

export const UebergabeModule: React.FC<UebergabeModuleProps> = ({
  objects,
  currentUser,
  protocols,
  initialObjectId,
  onCreateProtocol,
  onJumpToMeters,
}) => {
  const { t, tHandoverType, tRoom, tMeterType, docLanguage } = useTranslation();
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialObjectId) setObjectId(initialObjectId);
  }, [initialObjectId]);

  const selectedObject = objects.find((o) => o.id === objectId);

  const handleRoomPhoto = async (idx: number, file: File) => {
    if (!selectedObject) return;
    setUploadingRoomIdx(idx);
    try {
      const roomName = rooms[idx].room;
      const photo = await createWatermarkedPhoto(file, {
        objectName: `${selectedObject.name} · ${apartment}`,
        fallbackLat: selectedObject.lat,
        fallbackLng: selectedObject.lng,
        caption: `Übergabe ${roomName}`,
      });
      setRooms((prev) =>
        prev.map((r, i) => (i === idx ? { ...r, photo } : r))
      );
    } finally {
      setUploadingRoomIdx(null);
    }
  };

  const handleFinish = async () => {
    if (!tenantName.trim()) {
      setError(t('handover.errTenant'));
      setStep(1);
      return;
    }
    setError(null);
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
    exportHandoverProtocolPDF({
      protocol: created,
      obj: selectedObject,
      docLang: docLanguage,
    });
  };

  const resetWizard = () => {
    setStep(1);
    setTenantName('');
    setTenantEmail('');
    setRooms(DEFAULT_ROOMS.map((r) => ({ ...r })));
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
            {rooms.map((roomItem, idx) => (
              <div
                key={roomItem.room}
                className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    {tRoom(roomItem.room)}
                  </span>
                  <div className="flex gap-1.5">
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
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={roomItem.notes}
                    onChange={(e) =>
                      setRooms((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, notes: e.target.value } : r))
                      )
                    }
                    placeholder={t('handover.roomNotesPlaceholder')}
                    className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                  <PhotoUploadButtons
                    compact
                    loading={uploadingRoomIdx === idx}
                    onSelectFile={(file) => handleRoomPhoto(idx, file)}
                  />
                </div>
              </div>
            ))}
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
              onClick={handleFinish}
              className="flex items-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white cursor-pointer"
            >
              <FileDown className="w-4 h-4" />
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
            return (
              <div
                key={p.id}
                className="p-4 sm:px-5 flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                    {formatDateTimeDE(p.created_at)} · {tHandoverType(p.type)}
                  </p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {obj?.name ?? t('common.object')} — {p.apartment}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('handover.tenantFallback')}: {p.tenant_name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    exportHandoverProtocolPDF({
                      protocol: p,
                      obj,
                      docLang: docLanguage,
                    })
                  }
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-orange-500 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5 text-orange-500" />
                  <span>{t('handover.downloadPdf')}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
