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
