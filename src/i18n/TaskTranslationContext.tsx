import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FacilityTask, LanguageCode } from '../types/facility';
import { useTranslation } from './LanguageContext';

const STORAGE_CACHE_KEY = 'hmpro_task_translations_v1';
const MAX_LOCAL_CACHE_ENTRIES = 500;

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
  getTaskTitle: (task: Pick<FacilityTask, 'title'>, langOverride?: LanguageCode) => string;
  getTaskDescription: (
    task: Pick<FacilityTask, 'description'>,
    langOverride?: LanguageCode
  ) => string;
  ensureTaskTranslated: (
    task: FacilityTask,
    langOverride?: LanguageCode
  ) => Promise<FacilityTask>;
}

const TaskTranslationContext = createContext<TaskTranslationContextValue | null>(null);

interface TaskTranslationProviderProps {
  tasks: FacilityTask[];
  children: React.ReactNode;
}

export const TaskTranslationProvider: React.FC<TaskTranslationProviderProps> = ({
  tasks,
  children,
}) => {
  const { language } = useTranslation();
  const [cache, setCache] = useState<Record<string, string>>(() => readCache());
  const cacheRef = useRef<Record<string, string>>(cache);
  const inFlightKeysRef = useRef<Set<string>>(new Set());
  const failedAtRef = useRef<Map<string, number>>(new Map());

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

  // Automatically translate all uncached task titles & descriptions for the active app language
  useEffect(() => {
    let cancelled = false;
    const now = Date.now();
    const pendingTexts: string[] = [];
    const seen = new Set<string>();

    for (const task of tasks) {
      for (const candidate of [task.title, task.description]) {
        if (!isTranslatableText(candidate)) continue;
        const trimmed = candidate.trim();
        if (seen.has(trimmed)) continue;
        seen.add(trimmed);

        const cacheKey = `${language}::${trimmed}`;
        if (cacheRef.current[cacheKey] !== undefined) continue;
        if (inFlightKeysRef.current.has(cacheKey)) continue;

        const lastFailedAt = failedAtRef.current.get(cacheKey);
        if (lastFailedAt && now - lastFailedAt < 30_000) continue;

        pendingTexts.push(trimmed);
      }
    }

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
  }, [tasks, language, mergeTranslations]);

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
    (task: Pick<FacilityTask, 'title'>, langOverride?: LanguageCode): string => {
      return translateText(task.title, langOverride);
    },
    [translateText]
  );

  const getTaskDescription = useCallback(
    (task: Pick<FacilityTask, 'description'>, langOverride?: LanguageCode): string => {
      return translateText(task.description, langOverride);
    },
    [translateText]
  );

  const ensureTaskTranslated = useCallback(
    async (task: FacilityTask, langOverride?: LanguageCode): Promise<FacilityTask> => {
      const targetLang = langOverride ?? language;
      const toFetch: string[] = [];

      for (const candidate of [task.title, task.description]) {
        if (!isTranslatableText(candidate)) continue;
        const trimmed = candidate.trim();
        const k = `${targetLang}::${trimmed}`;
        if (cacheRef.current[k] === undefined && !toFetch.includes(trimmed)) {
          toFetch.push(trimmed);
        }
      }

      if (toFetch.length > 0) {
        try {
          const result = await requestTranslationsFromApi(targetLang, toFetch);
          mergeTranslations(targetLang, result);
        } catch {
          // Gracefully fall back to original text if translation service is unavailable
        }
      }

      const titleTrim = task.title?.trim() ?? '';
      const descTrim = task.description?.trim() ?? '';
      return {
        ...task,
        title: (titleTrim && cacheRef.current[`${targetLang}::${titleTrim}`]) || task.title,
        description:
          (descTrim && cacheRef.current[`${targetLang}::${descTrim}`]) || task.description,
      };
    },
    [language, mergeTranslations]
  );

  const value = useMemo<TaskTranslationContextValue>(
    () => ({
      translateText,
      getTaskTitle,
      getTaskDescription,
      ensureTaskTranslated,
    }),
    [translateText, getTaskTitle, getTaskDescription, ensureTaskTranslated]
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
