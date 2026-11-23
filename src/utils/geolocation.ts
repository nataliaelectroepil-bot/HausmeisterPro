export interface CapturedGpsCoordinates {
  lat: number;
  lng: number;
  accuracy?: number;
}

/**
 * Attempts to read the device's current GPS position via navigator.geolocation.
 * Never throws or blocks task completion if permission is denied or geolocation is unavailable.
 */
export function captureCurrentPosition(
  timeoutMs = 3500
): Promise<CapturedGpsCoordinates | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: CapturedGpsCoordinates | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(value);
    };

    const timer = window.setTimeout(() => {
      finish(null);
    }, timeoutMs + 250);

    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords?.latitude;
          const lng = pos.coords?.longitude;
          const accuracy = pos.coords?.accuracy;
          if (
            typeof lat === 'number' &&
            typeof lng === 'number' &&
            Number.isFinite(lat) &&
            Number.isFinite(lng)
          ) {
            finish({
              lat: Number(lat.toFixed(6)),
              lng: Number(lng.toFixed(6)),
              accuracy:
                typeof accuracy === 'number' && Number.isFinite(accuracy)
                  ? Math.round(accuracy)
                  : undefined,
            });
          } else {
            finish(null);
          }
        },
        () => finish(null),
        {
          enableHighAccuracy: true,
          timeout: timeoutMs,
          maximumAge: 60000,
        }
      );
    } catch {
      finish(null);
    }
  });
}
