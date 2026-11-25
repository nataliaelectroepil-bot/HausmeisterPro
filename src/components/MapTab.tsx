import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ExternalLink,
  List,
  Loader2,
  Map as MapIcon,
  MapPin,
  Navigation,
  Search,
  Wrench,
  X,
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { useTaskTranslation } from '../i18n/TaskTranslationContext';
import { FacilityTask, PropertyObject } from '../types/facility';
import { formatDateTimeDE, isTaskOverdue } from '../utils/dateUtils';
import { createWatermarkedPhoto } from '../utils/photoWatermark';
import { searchAddressCoordinates } from '../utils/geocoding';
import { CompleteTaskModal } from './CompleteTaskModal';

interface MapTabProps {
  objects: PropertyObject[];
  tasks: FacilityTask[];
  onOpenTaskDetail: (task: FacilityTask) => void;
  onQuickCompleteWithPhoto: (
    task: FacilityTask,
    photoData: Awaited<ReturnType<typeof createWatermarkedPhoto>>
  ) => Promise<void>;
  onOpenModulesForObject: (objectId: string) => void;
}

interface StandaloneTaskPin {
  task: FacilityTask;
  lat: number;
  lng: number;
  address: string;
  color: 'red' | 'blue' | 'green';
}

const GEOCODE_CACHE_KEY = 'hmpro_geocode_cache_v1';

function readGeocodeCache(): Record<string, { lat: number; lng: number }> {
  try {
    const raw = window.localStorage.getItem(GEOCODE_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, { lat: number; lng: number }>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeGeocodeCache(cache: Record<string, { lat: number; lng: number }>): void {
  try {
    window.localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage quota errors
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getPinColorForObject(objTasks: FacilityTask[]): 'red' | 'blue' | 'green' {
  const active = objTasks.filter((t) => t.status !== 'erledigt');
  const hasUrgentOrOverdue = active.some(
    (t) => isTaskOverdue(t.due_date, t.status) || t.priority === 'dringend'
  );
  if (hasUrgentOrOverdue) return 'red';
  if (active.length > 0) return 'blue';
  return 'green';
}

function getPinColorForTask(task: FacilityTask): 'red' | 'blue' | 'green' {
  if (task.status === 'erledigt') return 'green';
  if (isTaskOverdue(task.due_date, task.status) || task.priority === 'dringend') {
    return 'red';
  }
  return 'blue';
}

function createPinIcon(color: 'red' | 'blue' | 'green', selected: boolean, isTaskPin = false) {
  const fill =
    color === 'red' ? '#EF4444' : color === 'blue' ? '#2563EB' : '#10B981';
  const ring = selected ? '#F97316' : '#FFFFFF';
  const scale = selected ? 1.18 : 1;
  const inner = isTaskPin
    ? `<rect x="12.5" y="11.5" width="9" height="9" rx="2" fill="#FFFFFF"/>`
    : `<circle cx="17" cy="16" r="5.5" fill="#FFFFFF"/>`;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${34 * scale}" height="${42 * scale}" viewBox="0 0 34 42">
      <path d="M17 1C8.7 1 2 7.7 2 16c0 10.6 15 25 15 25s15-14.4 15-25C32 7.7 25.3 1 17 1z" fill="${fill}" stroke="${ring}" stroke-width="${selected ? 3 : 2}"/>
      ${inner}
    </svg>
  `;
  return L.divIcon({
    className: 'custom-pin-wrapper',
    html: svg,
    iconSize: [34 * scale, 42 * scale],
    iconAnchor: [17 * scale, 41 * scale],
  });
}

const GERMANY_DEFAULT_CENTER: [number, number] = [51.1657, 10.4515];
const GERMANY_DEFAULT_ZOOM = 6;

function hasValidLatLng(lat?: number, lng?: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0)
  );
}

function hasValidCoords(obj: PropertyObject): boolean {
  return hasValidLatLng(obj.lat, obj.lng);
}

export const MapTab: React.FC<MapTabProps> = ({
  objects,
  tasks,
  onOpenTaskDetail,
  onQuickCompleteWithPhoto,
  onOpenModulesForObject,
}) => {
  const { t, tCategory, tStatus } = useTranslation();
  const { getTaskTitle, getTaskDescription } = useTaskTranslation();
  const [viewMode, setViewMode] = useState<'karte' | 'objektliste'>('karte');
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [selectedStandaloneTaskId, setSelectedStandaloneTaskId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [completeModalTarget, setCompleteModalTarget] = useState<{
    task: FacilityTask;
    meta: { name: string; lat?: number; lng?: number };
  } | null>(null);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [geocodedTaskCoords, setGeocodedTaskCoords] = useState<
    Record<string, { lat: number; lng: number }>
  >({});

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const attemptedGeocodeRef = useRef<Set<string>>(new Set());

  const validObjects = useMemo(() => objects.filter(hasValidCoords), [objects]);
  const validObjectById = useMemo(() => {
    const map = new Map<string, PropertyObject>();
    validObjects.forEach((o) => map.set(o.id, o));
    return map;
  }, [validObjects]);

  // Identify tasks that need their own standalone marker on the map (either not linked to a valid PropertyObject, or having distinct coordinates/address)
  const standaloneTasks = useMemo(() => {
    return tasks.filter((task) => {
      const linkedObj = task.object_id ? validObjectById.get(task.object_id) : undefined;
      const taskHasOwnCoords = hasValidLatLng(task.lat, task.lng);
      const taskAddr = task.address?.trim();

      if (!linkedObj) {
        return taskHasOwnCoords || Boolean(taskAddr);
      }
      if (
        taskHasOwnCoords &&
        (Math.abs((task.lat as number) - linkedObj.lat) > 0.0001 ||
          Math.abs((task.lng as number) - linkedObj.lng) > 0.0001)
      ) {
        return true;
      }
      if (
        taskAddr &&
        taskAddr.toLowerCase() !== linkedObj.address.trim().toLowerCase() &&
        !taskHasOwnCoords
      ) {
        return true;
      }
      return false;
    });
  }, [tasks, validObjectById]);

  // Auto-geocode standalone tasks that have an address but no lat/lng yet
  useEffect(() => {
    let cancelled = false;
    const cache = readGeocodeCache();
    const cachedUpdates: Record<string, { lat: number; lng: number }> = {};
    const pendingToGeocode: Array<{ taskId: string; address: string; cacheKey: string }> = [];

    for (const task of standaloneTasks) {
      if (hasValidLatLng(task.lat, task.lng)) continue;
      const addr = task.address?.trim();
      if (!addr) continue;

      const addrKey = addr.toLowerCase();
      if (!geocodedTaskCoords[task.id] && cache[addrKey] && hasValidLatLng(cache[addrKey].lat, cache[addrKey].lng)) {
        cachedUpdates[task.id] = cache[addrKey];
        continue;
      }

      const attemptKey = `${task.id}::${addrKey}`;
      if (!geocodedTaskCoords[task.id] && !attemptedGeocodeRef.current.has(attemptKey)) {
        attemptedGeocodeRef.current.add(attemptKey);
        pendingToGeocode.push({ taskId: task.id, address: addr, cacheKey: addrKey });
      }
    }

    if (Object.keys(cachedUpdates).length > 0) {
      setGeocodedTaskCoords((prev) => ({ ...prev, ...cachedUpdates }));
    }

    if (pendingToGeocode.length === 0) return;

    const run = async () => {
      for (const item of pendingToGeocode) {
        if (cancelled) return;
        try {
          const result = await searchAddressCoordinates(item.address);
          if (cancelled) return;
          if (hasValidLatLng(result.lat, result.lng)) {
            const coords = { lat: result.lat, lng: result.lng };
            const nextCache = readGeocodeCache();
            nextCache[item.cacheKey] = coords;
            writeGeocodeCache(nextCache);
            setGeocodedTaskCoords((prev) => ({ ...prev, [item.taskId]: coords }));
          }
        } catch {
          // Silently skip unresolvable addresses on background map geocoding
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [standaloneTasks, geocodedTaskCoords]);

  const standaloneTaskPins = useMemo<StandaloneTaskPin[]>(() => {
    const cache = readGeocodeCache();
    const pins: StandaloneTaskPin[] = [];

    for (const task of standaloneTasks) {
      const addr = task.address?.trim() || '';
      let lat: number | undefined;
      let lng: number | undefined;

      if (hasValidLatLng(task.lat, task.lng)) {
        lat = task.lat;
        lng = task.lng;
      } else if (geocodedTaskCoords[task.id]) {
        lat = geocodedTaskCoords[task.id].lat;
        lng = geocodedTaskCoords[task.id].lng;
      } else if (addr && cache[addr.toLowerCase()]) {
        lat = cache[addr.toLowerCase()].lat;
        lng = cache[addr.toLowerCase()].lng;
      }

      if (typeof lat === 'number' && typeof lng === 'number' && hasValidLatLng(lat, lng)) {
        const linkedObj = task.object_id ? objects.find((o) => o.id === task.object_id) : undefined;
        pins.push({
          task,
          lat,
          lng,
          address: addr || linkedObj?.address || '—',
          color: getPinColorForTask(task),
        });
      }
    }

    return pins;
  }, [standaloneTasks, geocodedTaskCoords, objects]);

  const objectsViewportKey = useMemo(
    () => validObjects.map((o) => `${o.id}:${o.lat}:${o.lng}`).join('|'),
    [validObjects]
  );

  const taskPinsViewportKey = useMemo(
    () => standaloneTaskPins.map((p) => `${p.task.id}:${p.lat}:${p.lng}`).join('|'),
    [standaloneTaskPins]
  );

  const tasksByObject = useMemo(() => {
    const map = new Map<string, FacilityTask[]>();
    objects.forEach((o) => map.set(o.id, []));
    tasks.forEach((t) => {
      if (!t.object_id) return;
      const list = map.get(t.object_id) || [];
      list.push(t);
      map.set(t.object_id, list);
    });
    return map;
  }, [objects, tasks]);

  const filteredObjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return objects;
    return objects.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.address.toLowerCase().includes(q) ||
        o.client_name.toLowerCase().includes(q)
    );
  }, [objects, searchQuery]);

  // Initialize Leaflet Map cleanly whenever 'karte' view mounts
  useEffect(() => {
    if (viewMode !== 'karte' || !mapContainerRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: GERMANY_DEFAULT_CENTER,
      zoom: GERMANY_DEFAULT_ZOOM,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    const timer = window.setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 100);

    return () => {
      window.clearTimeout(timer);
      map.remove();
      mapInstanceRef.current = null;
      markersLayerRef.current = null;
    };
  }, [viewMode]);

  // Auto-center & zoom on ALL loaded objects AND standalone task markers (fallback to Germany only if none exist)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (viewMode !== 'karte' || !map) return;

    const applyViewport = () => {
      if (!mapInstanceRef.current) return;
      mapInstanceRef.current.invalidateSize();

      const allPoints: Array<[number, number]> = [
        ...validObjects.map((o) => [o.lat, o.lng] as [number, number]),
        ...standaloneTaskPins.map((p) => [p.lat, p.lng] as [number, number]),
      ];

      if (allPoints.length === 0) {
        mapInstanceRef.current.setView(GERMANY_DEFAULT_CENTER, GERMANY_DEFAULT_ZOOM);
      } else if (allPoints.length === 1) {
        mapInstanceRef.current.setView(allPoints[0], 15);
      } else {
        const bounds = L.latLngBounds(allPoints);
        mapInstanceRef.current.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
      }
    };

    applyViewport();
    const timer = window.setTimeout(applyViewport, 120);
    return () => window.clearTimeout(timer);
  }, [objectsViewportKey, taskPinsViewportKey, viewMode, validObjects, standaloneTaskPins]);

  // Update markers whenever objects, standalone task pins, or selection change
  useEffect(() => {
    if (viewMode !== 'karte' || !markersLayerRef.current || !mapInstanceRef.current) return;
    const layer = markersLayerRef.current;
    layer.clearLayers();

    validObjects.forEach((obj) => {
      const objTasks = tasksByObject.get(obj.id) || [];
      const color = getPinColorForObject(objTasks);
      const marker = L.marker([obj.lat, obj.lng], {
        icon: createPinIcon(color, obj.id === selectedObjectId, false),
      });
      marker.on('click', () => {
        setSelectedStandaloneTaskId(null);
        setSelectedObjectId(obj.id);
        mapInstanceRef.current?.panTo([obj.lat, obj.lng], { animate: true });
      });
      marker.addTo(layer);
    });

    standaloneTaskPins.forEach((pin) => {
      const marker = L.marker([pin.lat, pin.lng], {
        icon: createPinIcon(pin.color, pin.task.id === selectedStandaloneTaskId, true),
      });
      const popupHtml = `
        <div style="min-width:170px;font-family:var(--font-sans)">
          <div style="font-weight:700;font-size:13px;margin-bottom:2px;">${escapeHtml(getTaskTitle(pin.task))}</div>
          <div style="font-size:11px;color:#475569;margin-bottom:4px;">${escapeHtml(pin.address)}</div>
          <div style="font-size:11px;font-weight:600;color:#ea580c;">${escapeHtml(tStatus(pin.task.status))}</div>
        </div>
      `;
      marker.bindPopup(popupHtml);
      marker.on('click', () => {
        setSelectedObjectId(null);
        setSelectedStandaloneTaskId(pin.task.id);
        mapInstanceRef.current?.panTo([pin.lat, pin.lng], { animate: true });
      });
      marker.addTo(layer);
    });
  }, [
    validObjects,
    standaloneTaskPins,
    tasksByObject,
    selectedObjectId,
    selectedStandaloneTaskId,
    viewMode,
    tStatus,
    getTaskTitle,
  ]);

  const selectedObject = objects.find((o) => o.id === selectedObjectId) ?? null;
  const selectedStandalonePin =
    standaloneTaskPins.find((p) => p.task.id === selectedStandaloneTaskId) ?? null;
  const selectedObjectTasks = selectedObject
    ? tasksByObject.get(selectedObject.id) || []
    : [];
  const primaryTask =
    selectedObjectTasks.find(
      (t) => t.status !== 'erledigt' && isTaskOverdue(t.due_date, t.status)
    ) ||
    selectedObjectTasks.find((t) => t.status !== 'erledigt') ||
    selectedObjectTasks[0];

  const handleQuickPhotoComplete = async (
    file: File,
    task: FacilityTask,
    meta: { name: string; lat?: number; lng?: number }
  ) => {
    setUploadingId(task.id);
    setCompleteError(null);
    try {
      const photo = await createWatermarkedPhoto(file, {
        objectName: meta.name,
        fallbackLat: meta.lat,
        fallbackLng: meta.lng,
        caption: getTaskTitle(task),
      });
      await onQuickCompleteWithPhoto(task, photo);
      setCompleteModalTarget(null);
    } catch (err) {
      setCompleteError(err instanceof Error ? err.message : 'Foto konnte nicht verarbeitet werden.');
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Toolbar: View Switch + Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1">
          <button
            type="button"
            onClick={() => setViewMode('karte')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              viewMode === 'karte'
                ? 'bg-slate-900 text-white dark:bg-orange-500'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <MapIcon className="w-4 h-4" />
            <span>{t('map.viewMap')}</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('objektliste')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              viewMode === 'objektliste'
                ? 'bg-slate-900 text-white dark:bg-orange-500'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <List className="w-4 h-4" />
            <span>{t('map.viewList', { count: objects.length })}</span>
          </button>
        </div>

        {/* Clean Unboxed Status Legend */}
        <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500 inline-block" />
            {t('map.legendOverdue')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-600 inline-block" />
            {t('map.legendOpen')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block" />
            {t('map.legendDone')}
          </span>
        </div>
      </div>

      {/* View 1: Interactive Leaflet Map + Bottom/Side Sheet */}
      {viewMode === 'karte' && (
        <div className="relative rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-200 dark:bg-slate-800">
          <div
            ref={mapContainerRef}
            className="w-full h-[calc(100vh-260px)] min-h-[430px] max-h-[680px]"
          />

          {/* Bottom Sheet Card on Object Pin Click */}
          {selectedObject && (
            <div className="absolute bottom-3 left-3 right-3 md:left-auto md:right-4 md:bottom-4 md:w-[420px] z-20 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-4 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>{selectedObject.client_name}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {selectedObject.units_count} {t('common.units')}
                    </span>
                  </div>
                  <h3 className="mt-0.5 font-display text-base font-bold text-slate-900 dark:text-white truncate">
                    {selectedObject.name}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                    <span className="truncate">{selectedObject.address}</span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedObjectId(null)}
                  aria-label={t('common.close')}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {primaryTask ? (
                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {tCategory(primaryTask.category)}
                    </span>
                    <span
                      className={`font-mono tabular-nums ${
                        isTaskOverdue(primaryTask.due_date, primaryTask.status)
                          ? 'text-red-600 dark:text-red-400 font-semibold flex items-center gap-1'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {isTaskOverdue(primaryTask.due_date, primaryTask.status) && (
                        <AlertTriangle className="w-3.5 h-3.5" />
                      )}
                      {t('common.due')}: {formatDateTimeDE(primaryTask.due_date)}
                    </span>
                  </div>

                  <p className="text-sm font-semibold text-slate-900 dark:text-white leading-snug">
                    {getTaskTitle(primaryTask)}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                    {getTaskDescription(primaryTask) || t('map.noFurtherNotes')}
                  </p>
                  <p className="text-[11px] font-mono text-slate-400 tabular-nums">
                    {t('common.created')}: {formatDateTimeDE(primaryTask.created_at)}
                  </p>
                  {primaryTask.status === 'erledigt' && primaryTask.completed_at && (
                    <p className="text-[11px] font-mono font-medium text-emerald-700 dark:text-emerald-300 tabular-nums">
                      {t('taskModal.completedAtLabel')}: {formatDateTimeDE(primaryTask.completed_at)}
                    </p>
                  )}

                  <div className="pt-1 flex flex-wrap items-center gap-2">
                    {primaryTask.status !== 'erledigt' && (
                      <button
                        type="button"
                        disabled={uploadingId === primaryTask.id}
                        onClick={() => {
                          setCompleteError(null);
                          setCompleteModalTarget({
                            task: primaryTask,
                            meta: {
                              name: selectedObject.name,
                              lat: selectedObject.lat,
                              lng: selectedObject.lng,
                            },
                          });
                        }}
                        className="flex-1 min-w-[160px] flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white transition-colors min-h-[44px] cursor-pointer"
                      >
                        {uploadingId === primaryTask.id ? (
                          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                        )}
                        <span>
                          {uploadingId === primaryTask.id
                            ? t('common.photoSending')
                            : t('tasks.completeTask')}
                        </span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onOpenTaskDetail(primaryTask)}
                      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 px-3.5 py-2.5 text-xs font-semibold text-slate-800 dark:text-white transition-colors min-h-[44px] cursor-pointer"
                    >
                      {t('common.details')}
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenModulesForObject(selectedObject.id)}
                      className="flex items-center justify-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-orange-500 px-3 py-2.5 text-xs font-semibold text-slate-800 dark:text-white transition-colors min-h-[44px] cursor-pointer"
                    >
                      <Wrench className="w-3.5 h-3.5 text-orange-500" />
                      <span>{t('common.tools')}</span>
                    </button>

                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${selectedObject.lat},${selectedObject.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 px-3.5 py-2.5 text-xs font-semibold text-white transition-colors min-h-[44px]"
                    >
                      <Navigation className="w-3.5 h-3.5 shrink-0" />
                      <span>{t('map.startNav')}</span>
                    </a>
                  </div>
                </div>
              ) : (
                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    {t('map.allTasksDone')}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenModulesForObject(selectedObject.id)}
                      className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-white hover:border-orange-500 cursor-pointer"
                    >
                      <Wrench className="w-3.5 h-3.5 text-orange-500" />
                      <span>{t('common.tools')}</span>
                    </button>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${selectedObject.lat},${selectedObject.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 px-3 py-2 text-xs font-semibold text-white transition-colors"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>{t('map.startNav')}</span>
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Bottom Sheet Card on Standalone Task Pin Click */}
          {!selectedObject && selectedStandalonePin && (
            <div className="absolute bottom-3 left-3 right-3 md:left-auto md:right-4 md:bottom-4 md:w-[420px] z-20 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-4 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-orange-600 dark:text-orange-400">
                      {t('map.taskPinLabel')}
                    </span>
                    <span aria-hidden="true" className="text-slate-400">
                      ·
                    </span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {tCategory(selectedStandalonePin.task.category)}
                    </span>
                    <span aria-hidden="true" className="text-slate-400">
                      ·
                    </span>
                    <span
                      className={`font-semibold ${
                        selectedStandalonePin.task.status === 'erledigt'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : isTaskOverdue(
                              selectedStandalonePin.task.due_date,
                              selectedStandalonePin.task.status
                            )
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-blue-600 dark:text-blue-400'
                      }`}
                    >
                      {tStatus(selectedStandalonePin.task.status)}
                    </span>
                  </div>
                  <h3 className="mt-1 font-display text-base font-bold text-slate-900 dark:text-white leading-snug">
                    {getTaskTitle(selectedStandalonePin.task)}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                    <span className="truncate">{selectedStandalonePin.address}</span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedStandaloneTaskId(null)}
                  aria-label={t('common.close')}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span
                    className={`font-mono tabular-nums ${
                      isTaskOverdue(
                        selectedStandalonePin.task.due_date,
                        selectedStandalonePin.task.status
                      )
                        ? 'text-red-600 dark:text-red-400 font-semibold flex items-center gap-1'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {isTaskOverdue(
                      selectedStandalonePin.task.due_date,
                      selectedStandalonePin.task.status
                    ) && <AlertTriangle className="w-3.5 h-3.5" />}
                    {t('common.due')}: {formatDateTimeDE(selectedStandalonePin.task.due_date)}
                  </span>
                  <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                    {selectedStandalonePin.lat.toFixed(4)}, {selectedStandalonePin.lng.toFixed(4)}
                  </span>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                  {getTaskDescription(selectedStandalonePin.task) || t('map.noFurtherNotes')}
                </p>
                {selectedStandalonePin.task.status === 'erledigt' &&
                  selectedStandalonePin.task.completed_at && (
                    <p className="text-[11px] font-mono font-medium text-emerald-700 dark:text-emerald-300 tabular-nums">
                      {t('taskModal.completedAtLabel')}:{' '}
                      {formatDateTimeDE(selectedStandalonePin.task.completed_at)}
                    </p>
                  )}

                <div className="pt-1 flex flex-wrap items-center gap-2">
                  {selectedStandalonePin.task.status !== 'erledigt' && (
                    <button
                      type="button"
                      disabled={uploadingId === selectedStandalonePin.task.id}
                      onClick={() => {
                        setCompleteError(null);
                        setCompleteModalTarget({
                          task: selectedStandalonePin.task,
                          meta: {
                            name: selectedStandalonePin.address,
                            lat: selectedStandalonePin.lat,
                            lng: selectedStandalonePin.lng,
                          },
                        });
                      }}
                      className="flex-1 min-w-[160px] flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white transition-colors min-h-[44px] cursor-pointer"
                    >
                      {uploadingId === selectedStandalonePin.task.id ? (
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                      )}
                      <span>
                        {uploadingId === selectedStandalonePin.task.id
                          ? t('common.photoSending')
                          : t('tasks.completeTask')}
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onOpenTaskDetail(selectedStandalonePin.task)}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 px-3.5 py-2.5 text-xs font-semibold text-slate-800 dark:text-white transition-colors min-h-[44px] cursor-pointer"
                  >
                    {t('common.details')}
                  </button>

                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${selectedStandalonePin.lat},${selectedStandalonePin.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 px-3.5 py-2.5 text-xs font-semibold text-white transition-colors min-h-[44px]"
                  >
                    <Navigation className="w-3.5 h-3.5 shrink-0" />
                    <span>{t('map.startNav')}</span>
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* View 2: Searchable Objektliste */}
      {viewMode === 'objektliste' && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('map.searchPlaceholder')}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-orange-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredObjects.map((obj) => {
              const objTasks = tasksByObject.get(obj.id) || [];
              const openCount = objTasks.filter((t) => t.status !== 'erledigt').length;
              const overdueCount = objTasks.filter((t) =>
                isTaskOverdue(t.due_date, t.status)
              ).length;

              return (
                <div
                  key={obj.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="truncate">{obj.client_name}</span>
                      <span className="font-mono tabular-nums shrink-0">
                        {obj.units_count} {t('common.unitsShort')}
                      </span>
                    </div>
                    <h3 className="mt-1 font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="truncate">{obj.name}</span>
                    </h3>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      {obj.address}
                    </p>
                    <p className="mt-1.5 font-mono text-[11px] text-slate-400 tabular-nums">
                      GPS: {obj.lat.toFixed(4)}, {obj.lng.toFixed(4)}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <div className="text-xs font-medium tabular-nums">
                      {overdueCount > 0 ? (
                        <span className="text-red-600 dark:text-red-400 font-semibold">
                          {t('map.overdueAndOpen', { overdue: overdueCount, open: openCount })}
                        </span>
                      ) : openCount > 0 ? (
                        <span className="text-blue-600 dark:text-blue-400 font-semibold">
                          {t('map.openTasksCount', { open: openCount })}
                        </span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          {t('map.legendDone')}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onOpenModulesForObject(obj.id)}
                        className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-orange-500 cursor-pointer"
                      >
                        <Wrench className="w-3 h-3 text-orange-500" />
                        <span>{t('common.tools')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedObjectId(obj.id);
                          setViewMode('karte');
                        }}
                        className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        {t('map.showOnMap')}
                      </button>
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${obj.lat},${obj.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 rounded-lg bg-orange-500 hover:bg-orange-600 px-2.5 py-1.5 text-xs font-semibold text-white"
                      >
                        <span>{t('map.route')}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {completeModalTarget && (
        <CompleteTaskModal
          taskTitle={getTaskTitle(completeModalTarget.task)}
          subtitle={completeModalTarget.meta.name}
          allowWithoutPhoto={false}
          loading={uploadingId === completeModalTarget.task.id}
          error={completeError}
          onSelectPhoto={(file) =>
            handleQuickPhotoComplete(file, completeModalTarget.task, completeModalTarget.meta)
          }
          onClose={() => {
            if (uploadingId) return;
            setCompleteError(null);
            setCompleteModalTarget(null);
          }}
        />
      )}
    </div>
  );
};
