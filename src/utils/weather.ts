export interface WeatherResult {
  tempCelsius: number;
  weatherDesc: string;
  source: 'open-meteo' | 'fallback';
}

function mapWMOCodeToGerman(code: number): string {
  if (code === 0) return 'Klarer Himmel';
  if (code === 1 || code === 2) return 'Leicht bewölkt';
  if (code === 3) return 'Bedeckt';
  if (code === 45 || code === 48) return 'Nebel / Reif';
  if (code >= 51 && code <= 55) return 'Sprühregen';
  if (code === 56 || code === 57) return 'Gefrierender Sprühregen';
  if (code >= 61 && code <= 65) return 'Regen';
  if (code === 66 || code === 67) return 'Gefrierender Regen (Glättegefahr)';
  if (code >= 71 && code <= 77) return 'Schneefall';
  if (code >= 80 && code <= 82) return 'Regenschauer';
  if (code === 85 || code === 86) return 'Schneeschauer';
  if (code >= 95) return 'Gewitter / Sturm';
  return 'Wechselhaft';
}

export async function fetchLocalWeather(lat: number, lng: number): Promise<WeatherResult> {
  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 3500);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&timezone=Europe%2FBerlin`;
    const res = await fetch(url, { signal: controller.signal });
    window.clearTimeout(timeoutId);
    if (!res.ok) throw new Error('Weather API error');
    const json = (await res.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
    };
    const temp = json.current?.temperature_2m;
    const code = json.current?.weather_code ?? 3;
    if (typeof temp !== 'number') throw new Error('Invalid weather payload');
    return {
      tempCelsius: Number(temp.toFixed(1)),
      weatherDesc: mapWMOCodeToGerman(code),
      source: 'open-meteo',
    };
  } catch {
    return {
      tempCelsius: -1.2,
      weatherDesc: 'Bedeckt / Frostgefahr (Manuell prüfbar)',
      source: 'fallback',
    };
  }
}

export async function captureCurrentGPS(
  fallbackLat: number,
  fallbackLng: number
): Promise<{ lat: number; lng: number; live: boolean }> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return { lat: fallbackLat, lng: fallbackLng, live: false };
  }
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      resolve({ lat: fallbackLat, lng: fallbackLng, live: false });
    }, 2000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timer);
        resolve({
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5)),
          live: true,
        });
      },
      () => {
        window.clearTimeout(timer);
        resolve({ lat: fallbackLat, lng: fallbackLng, live: false });
      },
      { enableHighAccuracy: false, timeout: 1800, maximumAge: 60000 }
    );
  });
}
