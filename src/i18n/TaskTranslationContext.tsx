import React, { createContext, useCallback, useContext, useMemo } from 'react';
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

interface TaskTranslationContextValue {
  isTranslating: boolean;
  translationError: string | null;
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
  onTranslationError?: (message: string | null) => void;
  children: React.ReactNode;
}

export const TaskTranslationProvider: React.FC<TaskTranslationProviderProps> = ({
  children,
}) => {
  const translateText = useCallback((text?: string): string => text ?? '', []);

  const getTaskTitle = useCallback(
    (task: Pick<FacilityTask, 'title' | 'translations'>): string => task.title ?? '',
    []
  );

  const getTaskDescription = useCallback(
    (task: Pick<FacilityTask, 'description' | 'translations'>): string => task.description ?? '',
    []
  );

  const getTaskNotes = useCallback(
    (task: Pick<FacilityTask, 'notes' | 'translations'>): string => task.notes ?? '',
    []
  );

  const getChecklistItemLabel = useCallback(
    (
      _task: Pick<FacilityTask, 'translations'>,
      item: Pick<ChecklistItem, 'id' | 'label'>
    ): string => item.label ?? '',
    []
  );

  const ensureTaskTranslated = useCallback(
    async (task: FacilityTask): Promise<FacilityTask> => task,
    []
  );

  const ensureTextsTranslated = useCallback(
    async (texts: string[]): Promise<Record<string, string>> => {
      const out: Record<string, string> = {};
      for (const raw of texts) {
        const trimmed = raw?.trim();
        if (trimmed) {
          out[trimmed] = raw;
        }
      }
      return out;
    },
    []
  );

  const registerDynamicTexts = useCallback((_texts: string[]) => {
    // External AI task translation disabled; keep user-entered texts as originally written.
  }, []);

  const value = useMemo<TaskTranslationContextValue>(
    () => ({
      isTranslating: false,
      translationError: null,
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
