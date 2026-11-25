import { FacilityTask, PropertyObject, WinterActionType, WinterLog } from '../types/facility';

const VALID_WINTER_ACTIONS: WinterActionType[] = [
  'Schnee geräumt',
  'Salz gestreut',
  'Splitt gestreut',
  'Kontrollfahrt ohne Einsatz',
];

export function getWinterLogActions(
  log: Pick<WinterLog, 'action_type' | 'action_types'>
): WinterActionType[] {
  if (Array.isArray(log.action_types) && log.action_types.length > 0) {
    const valid = log.action_types.filter((a): a is WinterActionType =>
      VALID_WINTER_ACTIONS.includes(a)
    );
    if (valid.length > 0) return valid;
  }

  const raw = String(log.action_type || '').trim();
  if (!raw) return ['Salz gestreut'];

  const parts = raw
    .split(/[,;|]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const matched = parts.filter((p): p is WinterActionType =>
    VALID_WINTER_ACTIONS.includes(p as WinterActionType)
  );
  if (matched.length > 0) return matched;

  return [raw as WinterActionType];
}

const CORRUPTED_TASK_OR_BIN_PREFIX_RE =
  /\b(restmüll|biomüll|papier\s*\/\s*pappe|blaue\s*tonne|braune\s*tonne|schwarze\s*tonne|gelber?\s*sack|gelbe\s*tonne|mülltonnendienst|außenanlagenpflege|baustelle\s*\/\s*reparatur|miješani\s*otpad|biootpad|papir\s*\/\s*karton|žuta\s*vreća|residual\s*waste|organic\s*waste|yellow\s*bin|paper\s*\/\s*cardboard|bio\s*\/\s*organic)\b/i;

const PROPERTY_PREFIX_GUARD_RE =
  /^(weg|wohnanlage|gewerbepark|stadthaus|quartier|residenz|objekt|haus|liegenschaft|mehrfamilienhaus|bürohaus|bürogebäude|villa|altbau|neubau)\b/i;

const ADDRESS_WITH_POSTCODE_RE = /,\s*\d{4,5}\s+[A-Za-zÄÖÜäöüß]/;

function splitDashPrefixAndSuffix(value: string): { prefix: string; suffix: string } | null {
  const match = value.match(/^(.+?)\s+[—–-]\s+(.+)$/);
  if (!match) return null;
  return {
    prefix: match[1].trim(),
    suffix: match[2].trim(),
  };
}

export function cleanPropertyObject(
  obj: PropertyObject,
  linkedTaskTitles: string[] = []
): PropertyObject {
  let cleanAddress = (obj.address || '').trim();
  let cleanName = (obj.name || '').trim();

  // First clean any "TaskPrefix — Street, 12345 City" accidentally stored in address itself
  if (cleanAddress) {
    const addrSplit = splitDashPrefixAndSuffix(cleanAddress);
    if (
      addrSplit &&
      ADDRESS_WITH_POSTCODE_RE.test(addrSplit.suffix) &&
      (CORRUPTED_TASK_OR_BIN_PREFIX_RE.test(addrSplit.prefix) ||
        linkedTaskTitles.some(
          (t) => t.trim().toLowerCase() === addrSplit.prefix.toLowerCase()
        ))
    ) {
      cleanAddress = addrSplit.suffix;
    }
  }

  // Clean corrupted object name
  if (cleanName) {
    const nameSplit = splitDashPrefixAndSuffix(cleanName);
    if (nameSplit) {
      const { prefix, suffix } = nameSplit;
      const suffixMatchesAddress =
        Boolean(cleanAddress) && suffix.toLowerCase() === cleanAddress.toLowerCase();
      const prefixLooksLikeTaskOrBin =
        CORRUPTED_TASK_OR_BIN_PREFIX_RE.test(prefix) ||
        linkedTaskTitles.some((t) => t.trim().toLowerCase() === prefix.toLowerCase());
      const suffixLooksLikeAddress = ADDRESS_WITH_POSTCODE_RE.test(suffix);

      if (
        prefixLooksLikeTaskOrBin ||
        (suffixMatchesAddress && !PROPERTY_PREFIX_GUARD_RE.test(prefix)) ||
        (suffixLooksLikeAddress && !cleanAddress && !PROPERTY_PREFIX_GUARD_RE.test(prefix))
      ) {
        cleanName = cleanAddress || suffix;
        if (!cleanAddress && suffixLooksLikeAddress) {
          cleanAddress = suffix;
        }
      }
    } else if (cleanAddress) {
      const nameIsBinOrTask =
        CORRUPTED_TASK_OR_BIN_PREFIX_RE.test(cleanName) ||
        linkedTaskTitles.some(
          (t) => t.trim().toLowerCase() === cleanName.toLowerCase()
        );
      if (
        nameIsBinOrTask &&
        cleanName.toLowerCase() !== cleanAddress.toLowerCase() &&
        !PROPERTY_PREFIX_GUARD_RE.test(cleanName)
      ) {
        cleanName = cleanAddress;
      }
    }
  } else if (cleanAddress) {
    cleanName = cleanAddress;
  }

  if (cleanName === obj.name && cleanAddress === obj.address) {
    return obj;
  }

  return {
    ...obj,
    name: cleanName,
    address: cleanAddress,
  };
}

export function cleanPropertyObjectList(
  objects: PropertyObject[],
  tasks: FacilityTask[] = []
): { cleaned: PropertyObject[]; changed: PropertyObject[] } {
  const titlesByObjectId = new Map<string, string[]>();
  const allTaskTitles: string[] = [];

  for (const task of tasks) {
    if (!task.title?.trim()) continue;
    allTaskTitles.push(task.title.trim());
    if (task.object_id) {
      const list = titlesByObjectId.get(task.object_id) ?? [];
      list.push(task.title.trim());
      titlesByObjectId.set(task.object_id, list);
    }
  }

  const changed: PropertyObject[] = [];
  const cleaned = objects.map((obj) => {
    const linked = titlesByObjectId.get(obj.id) ?? [];
    const next = cleanPropertyObject(obj, linked.length > 0 ? linked : allTaskTitles);
    if (next !== obj) {
      changed.push(next);
    }
    return next;
  });

  return { cleaned, changed };
}

export function formatPropertyOptionLabel(
  obj: Pick<PropertyObject, 'name' | 'address'>
): string {
  const cleaned = cleanPropertyObject({
    id: '',
    name: obj.name,
    address: obj.address,
    lat: 0,
    lng: 0,
    client_id: '',
    client_name: '',
    units_count: 0,
  });

  if (!cleaned.address) return cleaned.name;
  if (!cleaned.name) return cleaned.address;
  if (cleaned.name.toLowerCase() === cleaned.address.toLowerCase()) {
    return cleaned.address;
  }
  return `${cleaned.name} — ${cleaned.address}`;
}
