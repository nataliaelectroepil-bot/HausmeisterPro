export interface GeocodingResult {
  lat: number;
  lng: number;
  displayName: string;
}

export async function searchAddressCoordinates(address: string): Promise<GeocodingResult> {
  const trimmed = address.trim();
  if (!trimmed) {
    throw new Error('Bitte geben Sie zuerst eine Adresse ein.');
  }

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de,at,ch&q=${encodeURIComponent(trimmed)}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Adresssuche derzeit nicht erreichbar.');
  }

  const data = (await response.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
  }>;

  if (!data || data.length === 0) {
    throw new Error('Keine Koordinaten für diese Adresse gefunden. Bitte Straße, Hausnummer und Stadt prüfen.');
  }

  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    displayName: data[0].display_name,
  };
}

interface NominatimReverseResponse {
  display_name?: string;
  address?: {
    road?: string;
    pedestrian?: string;
    footway?: string;
    cycleway?: string;
    path?: string;
    residential?: string;
    living_street?: string;
    house_number?: string;
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    suburb?: string;
    county?: string;
  };
}

export async function reverseGeocodeCoordinates(lat: number, lng: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
    String(lat)
  )}&lon=${encodeURIComponent(String(lng))}&addressdetails=1&accept-language=de`;

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Reverse-Geocoding derzeit nicht erreichbar.');
  }

  const data = (await response.json()) as NominatimReverseResponse;
  const addr = data.address;
  if (addr) {
    const street =
      addr.road ||
      addr.pedestrian ||
      addr.living_street ||
      addr.residential ||
      addr.footway ||
      addr.cycleway ||
      addr.path ||
      addr.suburb ||
      '';
    const houseNumber = addr.house_number || '';
    const streetPart = [street, houseNumber].filter(Boolean).join(' ').trim();

    const postcode = addr.postcode || '';
    const city =
      addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
    const cityPart = [postcode, city].filter(Boolean).join(' ').trim();

    const formatted = [streetPart, cityPart].filter(Boolean).join(', ');
    if (formatted) {
      return formatted;
    }
  }

  if (data.display_name && data.display_name.trim()) {
    return data.display_name.split(',').slice(0, 3).join(',').trim();
  }

  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

