import { BinType } from '../types/facility';

export const BIN_TYPE_ORDER: BinType[] = ['Restmüll', 'Bio', 'Papier', 'Gelbe Tonne'];

export const BIN_VISUAL_META: Record<
  BinType,
  {
    dotClass: string;
    badgeClass: string;
    activeCardClass: string;
    germanOptionLabel: string;
  }
> = {
  Restmüll: {
    dotClass: 'bg-black ring-1 ring-neutral-500/60',
    badgeClass: 'bg-black text-white border border-neutral-700',
    activeCardClass: 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-500',
    germanOptionLabel: 'Restmüll (Schwarz)',
  },
  Bio: {
    dotClass: 'bg-amber-900 dark:bg-amber-800',
    badgeClass: 'bg-amber-900 text-white dark:bg-amber-800 border border-amber-800',
    activeCardClass: 'border-amber-900 bg-amber-900 text-white dark:border-amber-700 dark:bg-amber-800',
    germanOptionLabel: 'Biomüll (Braune Tonne)',
  },
  Papier: {
    dotClass: 'bg-blue-600',
    badgeClass: 'bg-blue-600 text-white border border-blue-700',
    activeCardClass: 'border-blue-600 bg-blue-600 text-white',
    germanOptionLabel: 'Papier / Pappe (Blaue Tonne)',
  },
  'Gelbe Tonne': {
    dotClass: 'bg-yellow-400',
    badgeClass: 'bg-yellow-400 text-slate-950 border border-yellow-500',
    activeCardClass: 'border-yellow-500 bg-yellow-400 text-slate-950',
    germanOptionLabel: 'Gelber Sack / Gelbe Tonne',
  },
};
