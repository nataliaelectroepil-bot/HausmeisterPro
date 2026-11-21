import React, { createContext, useCallback, useContext, useMemo } from 'react';
import {
  BinType,
  DocLanguageCode,
  HandoverType,
  LanguageCode,
  MeterType,
  TaskCategory,
  TaskPriority,
  TaskStatus,
  UserRole,
  WinterActionType,
} from '../types/facility';
import {
  BIN_LABELS,
  CATEGORY_LABELS,
  CLEANING_ITEM_LABELS,
  GARDEN_TASK_LABELS,
  HANDOVER_TYPE_LABELS,
  METER_TYPE_LABELS,
  MONTH_NAMES,
  ROOM_LABELS,
  SUPPORTED_LANGUAGES,
  TranslationKey,
  UI_DICTIONARY,
  WEEKDAYS_LONG,
  WEEKDAYS_SHORT,
  WINTER_ACTION_LABELS,
  translatePriorityLabel,
  translateRoleLabel,
  translateStatusLabel,
} from './translations';

interface LanguageContextValue {
  language: LanguageCode;
  locale: string;
  docLanguage: DocLanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  setDocLanguage: (lang: DocLanguageCode) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  tCategory: (cat: TaskCategory) => string;
  tStatus: (st: TaskStatus) => string;
  tPriority: (pr: TaskPriority) => string;
  tBin: (bin: BinType) => string;
  tWinterAction: (act: WinterActionType) => string;
  tMeterType: (mt: MeterType) => string;
  tHandoverType: (ht: HandoverType) => string;
  tRoom: (room: string) => string;
  tCleaningItem: (item: string) => string;
  tGardenTask: (task: string) => string;
  tRole: (role: UserRole, short?: boolean) => string;
  weekdays: string[];
  weekdaysLong: string[];
  months: string[];
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

interface LanguageProviderProps {
  language: LanguageCode;
  docLanguage: DocLanguageCode;
  onChangeLanguage: (lang: LanguageCode) => void;
  onChangeDocLanguage: (lang: DocLanguageCode) => void;
  children: React.ReactNode;
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({
  language,
  docLanguage,
  onChangeLanguage,
  onChangeDocLanguage,
  children,
}) => {
  const locale = useMemo(
    () => SUPPORTED_LANGUAGES.find((l) => l.code === language)?.locale ?? 'de-DE',
    [language]
  );

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>): string => {
      const dict = UI_DICTIONARY[language] ?? UI_DICTIONARY.DE;
      let text = dict[key] ?? UI_DICTIONARY.DE[key] ?? key;
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        });
      }
      return text;
    },
    [language]
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      locale,
      docLanguage,
      setLanguage: onChangeLanguage,
      setDocLanguage: onChangeDocLanguage,
      t,
      tCategory: (cat) => CATEGORY_LABELS[cat]?.[language] ?? cat,
      tStatus: (st) => translateStatusLabel(st, language),
      tPriority: (pr) => translatePriorityLabel(pr, language),
      tBin: (bin) => BIN_LABELS[bin]?.[language] ?? bin,
      tWinterAction: (act) => WINTER_ACTION_LABELS[act]?.[language] ?? act,
      tMeterType: (mt) => METER_TYPE_LABELS[mt]?.[language] ?? mt,
      tHandoverType: (ht) => HANDOVER_TYPE_LABELS[ht]?.[language] ?? ht,
      tRoom: (room) => ROOM_LABELS[room]?.[language] ?? room,
      tCleaningItem: (item) => CLEANING_ITEM_LABELS[item]?.[language] ?? item,
      tGardenTask: (task) => GARDEN_TASK_LABELS[task]?.[language] ?? task,
      tRole: (role, short) => translateRoleLabel(role, language, short),
      weekdays: WEEKDAYS_SHORT[language] ?? WEEKDAYS_SHORT.DE,
      weekdaysLong: WEEKDAYS_LONG[language] ?? WEEKDAYS_LONG.DE,
      months: MONTH_NAMES[language] ?? MONTH_NAMES.DE,
    }),
    [language, locale, docLanguage, onChangeLanguage, onChangeDocLanguage, t]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export function useTranslation(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return ctx;
}
