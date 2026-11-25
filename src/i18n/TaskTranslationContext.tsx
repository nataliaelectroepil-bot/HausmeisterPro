import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ChecklistItem,
  CleaningLog,
  FacilityTask,
  GardenLog,
  HandoverProtocol,
  LanguageCode,
  TaskLocalizedContent,
  WinterLog,
} from '../types/facility';
import { useTranslation } from './LanguageContext';
import { ROOM_LABELS } from './translations';

const STORAGE_CACHE_KEY = 'hmpro_task_translations_v1';
const MAX_LOCAL_CACHE_ENTRIES = 2000;

function readCache(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, string>): void {
  try {
    const keys = Object.keys(cache);
    if (keys.length > MAX_LOCAL_CACHE_ENTRIES) {
      const trimmed: Record<string, string> = {};
      for (const k of keys.slice(keys.length - MAX_LOCAL_CACHE_ENTRIES)) {
        trimmed[k] = cache[k];
      }
      window.localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(trimmed));
      return;
    }
    window.localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage quota issues safely
  }
}

function isTranslatableText(text?: string): text is string {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  // Skip strings that only contain digits, whitespace, or punctuation
  return /[\p{L}]/u.test(trimmed);
}

function getLangEntry(
  task: Pick<FacilityTask, 'translations'>,
  targetLang: LanguageCode
): TaskLocalizedContent | undefined {
  if (!task.translations) return undefined;
  return task.translations[targetLang.toLowerCase()] ?? task.translations[targetLang.toUpperCase()];
}

function areStringMapsEqual(
  a?: Record<string, string>,
  b?: Record<string, string>
): boolean {
  const entriesA = Object.entries(a ?? {});
  const entriesB = Object.entries(b ?? {});
  if (entriesA.length !== entriesB.length) return false;
  for (const [k, v] of entriesA) {
    if ((b ?? {})[k] !== v) return false;
  }
  return true;
}

function areLocalizedEntriesEqual(
  a?: TaskLocalizedContent,
  b?: TaskLocalizedContent
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    (a.title ?? '') === (b.title ?? '') &&
    (a.description ?? '') === (b.description ?? '') &&
    (a.notes ?? '') === (b.notes ?? '') &&
    areStringMapsEqual(a.checklist, b.checklist) &&
    (a._src?.title ?? '') === (b._src?.title ?? '') &&
    (a._src?.description ?? '') === (b._src?.description ?? '') &&
    (a._src?.notes ?? '') === (b._src?.notes ?? '') &&
    areStringMapsEqual(a._src?.checklist, b._src?.checklist)
  );
}

async function requestTranslationsFromApi(
  targetLanguage: LanguageCode,
  texts: string[]
): Promise<Record<string, string>> {
  const res = await fetch('/api/translate/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetLanguage, texts }),
  });
  if (!res.ok) {
    throw new Error(`Translation request failed (${res.status})`);
  }
  const data = (await res.json()) as { translations?: Record<string, string> };
  return data.translations && typeof data.translations === 'object' ? data.translations : {};
}

interface TaskTranslationContextValue {
  translateText: (text?: string, langOverride?: LanguageCode) => string;
  getTaskTitle: (
    task: Pick<FacilityTask, 'title' | 'translations'>,
    langOverride?: LanguageCode
  ) => string;
  getTaskDescription: (
    task: Pick<FacilityTask, 'description' | 'translations'>,
    langOverride?: LanguageCode
  ) => string;
  getTaskNotes: (
    task: Pick<FacilityTask, 'notes' | 'translations'>,
    langOverride?: LanguageCode
  ) => string;
  getChecklistItemLabel: (
    task: Pick<FacilityTask, 'translations'>,
    item: Pick<ChecklistItem, 'id' | 'label'>,
    langOverride?: LanguageCode
  ) => string;
  ensureTaskTranslated: (
    task: FacilityTask,
    langOverride?: LanguageCode
  ) => Promise<FacilityTask>;
  ensureTextsTranslated: (
    texts: string[],
    langOverride?: LanguageCode
  ) => Promise<Record<string, string>>;
  registerDynamicTexts: (texts: string[]) => void;
}

const TaskTranslationContext = createContext<TaskTranslationContextValue | null>(null);

interface TaskTranslationProviderProps {
  tasks: FacilityTask[];
  protocols?: HandoverProtocol[];
  winterLogs?: WinterLog[];
  cleaningLogs?: CleaningLog[];
  gardenLogs?: GardenLog[];
  onSyncTaskTranslations?: (
    updates: Array<{ id: string; translations: Record<string, TaskLocalizedContent> }>
  ) => void;
  children: React.ReactNode;
}

export const TaskTranslationProvider: React.FC<TaskTranslationProviderProps> = ({
  tasks,
  protocols = [],
  winterLogs = [],
  cleaningLogs = [],
  gardenLogs = [],
  onSyncTaskTranslations,
  children,
}) => {
  const { language } = useTranslation();
  const [cache, setCache] = useState<Record<string, string>>(() => readCache());
  const cacheRef = useRef<Record<string, string>>(cache);
  const inFlightKeysRef = useRef<Set<string>>(new Set());
  const failedAtRef = useRef<Map<string, number>>(new Map());
  const dynamicTextsRef = useRef<Set<string>>(new Set());
  const [dynamicVersion, setDynamicVersion] = useState(0);

  useEffect(() => {
    cacheRef.current = cache;
  }, [cache]);

  const mergeTranslations = useCallback(
    (targetLang: LanguageCode, incoming: Record<string, string>) => {
      const entries = Object.entries(incoming);
      if (entries.length === 0) return;

      setCache((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [orig, translated] of entries) {
          const k = `${targetLang}::${orig}`;
          if (next[k] !== translated) {
            next[k] = translated;
            changed = true;
          }
        }
        if (changed) {
          writeCache(next);
          cacheRef.current = next;
          return next;
        }
        return prev;
      });
    },
    []
  );

  const registerDynamicTexts = useCallback((texts: string[]) => {
    let added = false;
    for (const raw of texts) {
      if (!isTranslatableText(raw)) continue;
      const trimmed = raw.trim();
      if (!dynamicTextsRef.current.has(trimmed)) {
        dynamicTextsRef.current.add(trimmed);
        added = true;
      }
    }
    if (added) {
      setDynamicVersion((v) => v + 1);
    }
  }, []);

  // Hydrate phrase cache from task.translations and sync newly available translations back onto task objects
  useEffect(() => {
    const langKey = language.toLowerCase();
    const hydratedIncoming: Record<string, string> = {};
    const taskUpdates: Array<{
      id: string;
      translations: Record<string, TaskLocalizedContent>;
    }> = [];

    for (const task of tasks) {
      const existingEntry = getLangEntry(task, language);

      // 1. Hydrate localStorage/in-memory phrase cache from task.translations if fresh
      if (existingEntry) {
        if (
          existingEntry.title &&
          isTranslatableText(task.title) &&
          (!existingEntry._src?.title || existingEntry._src.title === task.title.trim())
        ) {
          const tKey = `${language}::${task.title.trim()}`;
          if (cacheRef.current[tKey] === undefined) {
            hydratedIncoming[task.title.trim()] = existingEntry.title;
          }
        }
        if (
          existingEntry.description &&
          isTranslatableText(task.description) &&
          (!existingEntry._src?.description ||
            existingEntry._src.description === task.description.trim())
        ) {
          const dKey = `${language}::${task.description.trim()}`;
          if (cacheRef.current[dKey] === undefined) {
            hydratedIncoming[task.description.trim()] = existingEntry.description;
          }
        }
        if (
          existingEntry.notes &&
          isTranslatableText(task.notes) &&
          (!existingEntry._src?.notes || existingEntry._src.notes === task.notes.trim())
        ) {
          const nKey = `${language}::${task.notes.trim()}`;
          if (cacheRef.current[nKey] === undefined) {
            hydratedIncoming[task.notes.trim()] = existingEntry.notes;
          }
        }
        if (existingEntry.checklist && Array.isArray(task.checklist_json)) {
          for (const item of task.checklist_json) {
            if (!isTranslatableText(item.label)) continue;
            const translatedLabel = existingEntry.checklist[item.id];
            const srcLabel = existingEntry._src?.checklist?.[item.id];
            if (translatedLabel && (!srcLabel || srcLabel === item.label.trim())) {
              const cKey = `${language}::${item.label.trim()}`;
              if (cacheRef.current[cKey] === undefined) {
                hydratedIncoming[item.label.trim()] = translatedLabel;
              }
            }
          }
        }
      }

      // 2. Build fresh TaskLocalizedContent for `langKey` from available cache
      if (onSyncTaskTranslations) {
        const nextEntry: TaskLocalizedContent = {};
        const nextSrc: NonNullable<TaskLocalizedContent['_src']> = {};
        let hasAny = false;

        if (isTranslatableText(task.title)) {
          const trim = task.title.trim();
          const val =
            (existingEntry?._src?.title === trim ? existingEntry.title : undefined) ??
            cacheRef.current[`${language}::${trim}`];
          if (val) {
            nextEntry.title = val;
            nextSrc.title = trim;
            hasAny = true;
          }
        }
        if (isTranslatableText(task.description)) {
          const trim = task.description.trim();
          const val =
            (existingEntry?._src?.description === trim ? existingEntry.description : undefined) ??
            cacheRef.current[`${language}::${trim}`];
          if (val) {
            nextEntry.description = val;
            nextSrc.description = trim;
            hasAny = true;
          }
        }
        if (isTranslatableText(task.notes)) {
          const trim = task.notes.trim();
          const val =
            (existingEntry?._src?.notes === trim ? existingEntry.notes : undefined) ??
            cacheRef.current[`${language}::${trim}`];
          if (val) {
            nextEntry.notes = val;
            nextSrc.notes = trim;
            hasAny = true;
          }
        }
        if (Array.isArray(task.checklist_json) && task.checklist_json.length > 0) {
          const checklistMap: Record<string, string> = {};
          const checklistSrcMap: Record<string, string> = {};
          for (const item of task.checklist_json) {
            if (!isTranslatableText(item.label)) continue;
            const trim = item.label.trim();
            const val =
              (existingEntry?._src?.checklist?.[item.id] === trim
                ? existingEntry.checklist?.[item.id]
                : undefined) ?? cacheRef.current[`${language}::${trim}`];
            if (val) {
              checklistMap[item.id] = val;
              checklistSrcMap[item.id] = trim;
            }
          }
          if (Object.keys(checklistMap).length > 0) {
            nextEntry.checklist = checklistMap;
            nextSrc.checklist = checklistSrcMap;
            hasAny = true;
          }
        }

        if (hasAny) {
          nextEntry._src = nextSrc;
          const currentStored = task.translations?.[langKey];
          if (!areLocalizedEntriesEqual(currentStored, nextEntry)) {
            taskUpdates.push({
              id: task.id,
              translations: {
                ...(task.translations ?? {}),
                [langKey]: nextEntry,
              },
            });
          }
        }
      }
    }

    if (Object.keys(hydratedIncoming).length > 0) {
      mergeTranslations(language, hydratedIncoming);
    }
    if (taskUpdates.length > 0 && onSyncTaskTranslations) {
      onSyncTaskTranslations(taskUpdates);
    }
  }, [tasks, language, cache, mergeTranslations, onSyncTaskTranslations]);

  // Automatically translate all uncached user-generated texts (tasks, checklists, notes, protocols)
  useEffect(() => {
    let cancelled = false;
    const now = Date.now();
    const pendingTexts: string[] = [];
    const seen = new Set<string>();

    const enqueueIfMissing = (candidate?: string, preCached?: string) => {
      if (preCached) return;
      if (!isTranslatableText(candidate)) return;
      const trimmed = candidate.trim();
      if (seen.has(trimmed)) return;
      seen.add(trimmed);

      const cacheKey = `${language}::${trimmed}`;
      if (cacheRef.current[cacheKey] !== undefined) return;
      if (inFlightKeysRef.current.has(cacheKey)) return;

      const lastFailedAt = failedAtRef.current.get(cacheKey);
      if (lastFailedAt && now - lastFailedAt < 30_000) return;

      pendingTexts.push(trimmed);
    };

    for (const task of tasks) {
      const entry = getLangEntry(task, language);
      enqueueIfMissing(
        task.title,
        entry && (!entry._src?.title || entry._src.title === task.title.trim())
          ? entry.title
          : undefined
      );
      enqueueIfMissing(
        task.description,
        entry && (!entry._src?.description || entry._src.description === task.description.trim())
          ? entry.description
          : undefined
      );
      enqueueIfMissing(
        task.notes,
        entry && (!entry._src?.notes || entry._src.notes === task.notes.trim())
          ? entry.notes
          : undefined
      );
      if (Array.isArray(task.checklist_json)) {
        for (const item of task.checklist_json) {
          const freshCheck =
            entry?.checklist?.[item.id] &&
            (!entry._src?.checklist?.[item.id] ||
              entry._src.checklist[item.id] === item.label.trim())
              ? entry.checklist[item.id]
              : undefined;
          enqueueIfMissing(item.label, freshCheck);
        }
      }
    }

    for (const proto of protocols) {
      for (const room of proto.rooms_json ?? []) {
        if (!(room.room in ROOM_LABELS)) {
          enqueueIfMissing(room.room);
        }
        enqueueIfMissing(room.notes);
      }
    }

    for (const log of winterLogs) {
      enqueueIfMissing(log.notes);
    }
    for (const log of cleaningLogs) {
      enqueueIfMissing(log.notes);
    }
    for (const log of gardenLogs) {
      enqueueIfMissing(log.notes);
    }

    dynamicTextsRef.current.forEach((txt) => {
      enqueueIfMissing(txt);
    });

    if (pendingTexts.length === 0) return;

    const batchKeys = pendingTexts.map((t) => `${language}::${t}`);
    batchKeys.forEach((k) => inFlightKeysRef.current.add(k));

    const run = async () => {
      try {
        for (let i = 0; i < pendingTexts.length; i += 30) {
          if (cancelled) break;
          const chunk = pendingTexts.slice(i, i + 30);
          const result = await requestTranslationsFromApi(language, chunk);
          if (cancelled) break;
          mergeTranslations(language, result);
        }
      } catch {
        const failTs = Date.now();
        batchKeys.forEach((k) => failedAtRef.current.set(k, failTs));
      } finally {
        batchKeys.forEach((k) => inFlightKeysRef.current.delete(k));
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    tasks,
    protocols,
    winterLogs,
    cleaningLogs,
    gardenLogs,
    dynamicVersion,
    language,
    mergeTranslations,
  ]);

  const translateText = useCallback(
    (text?: string, langOverride?: LanguageCode): string => {
      if (!text) return '';
      const trimmed = text.trim();
      if (!trimmed) return text;
      const targetLang = langOverride ?? language;
      return cache[`${targetLang}::${trimmed}`] ?? text;
    },
    [cache, language]
  );

  const getTaskTitle = useCallback(
    (
      task: Pick<FacilityTask, 'title' | 'translations'>,
      langOverride?: LanguageCode
    ): string => {
      const targetLang = langOverride ?? language;
      const entry = getLangEntry(task, targetLang);
      const trimmed = task.title?.trim() ?? '';
      if (entry?.title && (!entry._src?.title || entry._src.title === trimmed)) {
        return entry.title;
      }
      return translateText(task.title, targetLang);
    },
    [language, translateText]
  );

  const getTaskDescription = useCallback(
    (
      task: Pick<FacilityTask, 'description' | 'translations'>,
      langOverride?: LanguageCode
    ): string => {
      const targetLang = langOverride ?? language;
      const entry = getLangEntry(task, targetLang);
      const trimmed = task.description?.trim() ?? '';
      if (
        entry?.description &&
        (!entry._src?.description || entry._src.description === trimmed)
      ) {
        return entry.description;
      }
      return translateText(task.description, targetLang);
    },
    [language, translateText]
  );

  const getTaskNotes = useCallback(
    (
      task: Pick<FacilityTask, 'notes' | 'translations'>,
      langOverride?: LanguageCode
    ): string => {
      const targetLang = langOverride ?? language;
      const entry = getLangEntry(task, targetLang);
      const trimmed = task.notes?.trim() ?? '';
      if (entry?.notes && (!entry._src?.notes || entry._src.notes === trimmed)) {
        return entry.notes;
      }
      return translateText(task.notes, targetLang);
    },
    [language, translateText]
  );

  const getChecklistItemLabel = useCallback(
    (
      task: Pick<FacilityTask, 'translations'>,
      item: Pick<ChecklistItem, 'id' | 'label'>,
      langOverride?: LanguageCode
    ): string => {
      const targetLang = langOverride ?? language;
      const entry = getLangEntry(task, targetLang);
      const trimmed = item.label?.trim() ?? '';
      const cachedCheck = entry?.checklist?.[item.id];
      const srcCheck = entry?._src?.checklist?.[item.id];
      if (cachedCheck && (!srcCheck || srcCheck === trimmed)) {
        return cachedCheck;
      }
      return translateText(item.label, targetLang);
    },
    [language, translateText]
  );

  const ensureTextsTranslated = useCallback(
    async (
      texts: string[],
      langOverride?: LanguageCode
    ): Promise<Record<string, string>> => {
      const targetLang = langOverride ?? language;
      const unique: string[] = [];
      for (const raw of texts) {
        if (!isTranslatableText(raw)) continue;
        const trimmed = raw.trim();
        if (!unique.includes(trimmed)) {
          unique.push(trimmed);
        }
      }

      const toFetch = unique.filter(
        (trimmed) => cacheRef.current[`${targetLang}::${trimmed}`] === undefined
      );

      if (toFetch.length > 0) {
        try {
          for (let i = 0; i < toFetch.length; i += 30) {
            const chunk = toFetch.slice(i, i + 30);
            const result = await requestTranslationsFromApi(targetLang, chunk);
            mergeTranslations(targetLang, result);
          }
        } catch {
          // Gracefully fall back to original text if translation service is unavailable
        }
      }

      const out: Record<string, string> = {};
      for (const trimmed of unique) {
        out[trimmed] = cacheRef.current[`${targetLang}::${trimmed}`] ?? trimmed;
      }
      return out;
    },
    [language, mergeTranslations]
  );

  const ensureTaskTranslated = useCallback(
    async (task: FacilityTask, langOverride?: LanguageCode): Promise<FacilityTask> => {
      const targetLang = langOverride ?? language;
      const langKey = targetLang.toLowerCase();
      const existingEntry = getLangEntry(task, targetLang);
      const toFetch: string[] = [];

      const queueIfUncached = (raw?: string, cachedOnTask?: string, srcOnTask?: string) => {
        if (!isTranslatableText(raw)) return;
        const trimmed = raw.trim();
        if (cachedOnTask && (!srcOnTask || srcOnTask === trimmed)) {
          if (cacheRef.current[`${targetLang}::${trimmed}`] === undefined) {
            mergeTranslations(targetLang, { [trimmed]: cachedOnTask });
          }
          return;
        }
        const k = `${targetLang}::${trimmed}`;
        if (cacheRef.current[k] === undefined && !toFetch.includes(trimmed)) {
          toFetch.push(trimmed);
        }
      };

      queueIfUncached(task.title, existingEntry?.title, existingEntry?._src?.title);
      queueIfUncached(
        task.description,
        existingEntry?.description,
        existingEntry?._src?.description
      );
      queueIfUncached(task.notes, existingEntry?.notes, existingEntry?._src?.notes);
      for (const item of task.checklist_json ?? []) {
        queueIfUncached(
          item.label,
          existingEntry?.checklist?.[item.id],
          existingEntry?._src?.checklist?.[item.id]
        );
      }

      if (toFetch.length > 0) {
        try {
          for (let i = 0; i < toFetch.length; i += 30) {
            const chunk = toFetch.slice(i, i + 30);
            const result = await requestTranslationsFromApi(targetLang, chunk);
            mergeTranslations(targetLang, result);
          }
        } catch {
          // Gracefully fall back to original text if translation service is unavailable
        }
      }

      const resolveField = (raw: string, cachedOnTask?: string, srcOnTask?: string): string => {
        const trim = raw?.trim() ?? '';
        if (!trim) return raw;
        if (cachedOnTask && (!srcOnTask || srcOnTask === trim)) return cachedOnTask;
        return cacheRef.current[`${targetLang}::${trim}`] ?? raw;
      };

      const translatedTitle = resolveField(
        task.title,
        existingEntry?.title,
        existingEntry?._src?.title
      );
      const translatedDesc = resolveField(
        task.description,
        existingEntry?.description,
        existingEntry?._src?.description
      );
      const translatedNotes = resolveField(
        task.notes,
        existingEntry?.notes,
        existingEntry?._src?.notes
      );
      const checklistTranslations: Record<string, string> = {};
      const checklistSrc: Record<string, string> = {};
      const translatedChecklist = (task.checklist_json ?? []).map((item) => {
        const translatedLabel = resolveField(
          item.label,
          existingEntry?.checklist?.[item.id],
          existingEntry?._src?.checklist?.[item.id]
        );
        if (isTranslatableText(item.label)) {
          checklistTranslations[item.id] = translatedLabel;
          checklistSrc[item.id] = item.label.trim();
        }
        return {
          ...item,
          label: translatedLabel,
        };
      });

      const nextEntry: TaskLocalizedContent = {
        ...(isTranslatableText(task.title) ? { title: translatedTitle } : {}),
        ...(isTranslatableText(task.description) ? { description: translatedDesc } : {}),
        ...(isTranslatableText(task.notes) ? { notes: translatedNotes } : {}),
        ...(Object.keys(checklistTranslations).length > 0
          ? { checklist: checklistTranslations }
          : {}),
        _src: {
          ...(isTranslatableText(task.title) ? { title: task.title.trim() } : {}),
          ...(isTranslatableText(task.description)
            ? { description: task.description.trim() }
            : {}),
          ...(isTranslatableText(task.notes) ? { notes: task.notes.trim() } : {}),
          ...(Object.keys(checklistSrc).length > 0 ? { checklist: checklistSrc } : {}),
        },
      };

      return {
        ...task,
        title: translatedTitle,
        description: translatedDesc,
        notes: translatedNotes,
        checklist_json: translatedChecklist,
        translations: {
          ...(task.translations ?? {}),
          [langKey]: nextEntry,
        },
      };
    },
    [language, mergeTranslations]
  );

  const value = useMemo<TaskTranslationContextValue>(
    () => ({
      translateText,
      getTaskTitle,
      getTaskDescription,
      getTaskNotes,
      getChecklistItemLabel,
      ensureTaskTranslated,
      ensureTextsTranslated,
      registerDynamicTexts,
    }),
    [
      translateText,
      getTaskTitle,
      getTaskDescription,
      getTaskNotes,
      getChecklistItemLabel,
      ensureTaskTranslated,
      ensureTextsTranslated,
      registerDynamicTexts,
    ]
  );

  return (
    <TaskTranslationContext.Provider value={value}>
      {children}
    </TaskTranslationContext.Provider>
  );
};

export function useTaskTranslation(): TaskTranslationContextValue {
  const ctx = useContext(TaskTranslationContext);
  if (!ctx) {
    throw new Error('useTaskTranslation must be used within a TaskTranslationProvider');
  }
  return ctx;
}
