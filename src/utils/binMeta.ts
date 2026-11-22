import { BinType, FacilityTask } from '../types/facility';

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

export function normalizeBinType(raw: unknown): BinType | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (
    v === 'bio' ||
    v === 'biomüll' ||
    v === 'biomuell' ||
    v === 'biootpad' ||
    v === 'braune tonne' ||
    v.includes('biomüll') ||
    v.includes('biomuell') ||
    v.includes('bio-tonne') ||
    v.includes('biotonne') ||
    v === 'bio tonne'
  ) {
    return 'Bio';
  }
  if (
    v === 'restmüll' ||
    v === 'restmuell' ||
    v.includes('restmüll') ||
    v.includes('restmuell') ||
    v.includes('schwarz')
  ) {
    return 'Restmüll';
  }
  if (
    v === 'papier' ||
    v === 'pappe' ||
    v.includes('papier') ||
    v.includes('pappe') ||
    v.includes('blaue tonne')
  ) {
    return 'Papier';
  }
  if (
    v === 'gelbe tonne' ||
    v === 'gelber sack' ||
    v === 'gelb' ||
    v.includes('gelb') ||
    v.includes('wertstoff')
  ) {
    return 'Gelbe Tonne';
  }
  return null;
}

export function normalizeBinTypes(raw: unknown): BinType[] | undefined {
  let items: unknown[] = [];
  if (Array.isArray(raw)) {
    items = raw;
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) items = parsed;
      } catch {
        items = trimmed.split(',');
      }
    } else {
      items = trimmed.split(',');
    }
  } else {
    return undefined;
  }

  const out: BinType[] = [];
  for (const item of items) {
    const normalized = normalizeBinType(item);
    if (normalized && !out.includes(normalized)) {
      out.push(normalized);
    }
  }
  return out.length > 0 ? out : undefined;
}

export function getTaskEffectiveBinTypes(task: FacilityTask): BinType[] {
  const explicit = normalizeBinTypes(task.bin_types);
  if (explicit && explicit.length > 0) return explicit;

  if (task.category !== 'Mülltonnendienst') return [];

  const text = `${task.title} ${task.description ?? ''} ${task.notes ?? ''}`.toLowerCase();
  const inferred: BinType[] = [];

  if (/(^|[^a-zäöüß])(bio|biomüll|biomuell|biotonne|biootpad|braun\w*)/i.test(text)) {
    inferred.push('Bio');
  }
  if (/(^|[^a-zäöüß])(restmüll|restmuell|schwarz\w*)/i.test(text)) {
    inferred.push('Restmüll');
  }
  if (/(^|[^a-zäöüß])(papier|pappe|blaue?\s+tonne)/i.test(text)) {
    inferred.push('Papier');
  }
  if (/(^|[^a-zäöüß])(gelb\w*|gelber\s+sack|wertstoff\w*)/i.test(text)) {
    inferred.push('Gelbe Tonne');
  }

  return inferred;
}

