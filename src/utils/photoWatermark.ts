import { TaskPhoto } from '../types/facility';

interface WatermarkOptions {
  objectName: string;
  fallbackLat?: number;
  fallbackLng?: number;
  caption?: string;
  extraStamp?: string;
}

async function getCurrentCoordinates(fallbackLat?: number, fallbackLng?: number): Promise<{ lat?: number; lng?: number }> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return { lat: fallbackLat, lng: fallbackLng };
  }

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      resolve({ lat: fallbackLat, lng: fallbackLng });
    }, 1500);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timer);
        resolve({
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5)),
        });
      },
      () => {
        window.clearTimeout(timer);
        resolve({ lat: fallbackLat, lng: fallbackLng });
      },
      { enableHighAccuracy: false, timeout: 1400, maximumAge: 60000 }
    );
  });
}

export async function createWatermarkedPhoto(
  file: File,
  options: WatermarkOptions
): Promise<TaskPhoto> {
  const coords = await getCurrentCoordinates(options.fallbackLat, options.fallbackLng);
  const now = new Date();
  const timestampISO = now.toISOString();
  const formattedStamp = now.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Bild konnte nicht gelesen werden.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Bild konnte nicht dekodiert werden.'));
    image.src = rawDataUrl;
  });

  const maxWidth = 1080;
  const scale = img.width > maxWidth ? maxWidth / img.width : 1;
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      id: `photo_${Date.now()}`,
      dataUrl: rawDataUrl,
      timestamp: timestampISO,
      lat: coords.lat,
      lng: coords.lng,
      caption: options.caption,
    };
  }

  ctx.drawImage(img, 0, 0, width, height);

  const barHeight = Math.max(58, Math.round(height * 0.12));
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.fillRect(0, height - barHeight, width, barHeight);

  // Safety orange accent stripe at top of watermark bar
  ctx.fillStyle = '#F97316';
  ctx.fillRect(0, height - barHeight, width, 3);

  const fontSize = Math.max(13, Math.round(width * 0.02));
  ctx.font = `600 ${fontSize}px "JetBrains Mono", monospace`;
  ctx.fillStyle = '#F8FAFC';

  const gpsText =
    coords.lat !== undefined && coords.lng !== undefined
      ? `GPS: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
      : 'GPS: Objektstandort';

  const line1 = options.extraStamp
    ? `HAUSMEISTER PRO  |  ${formattedStamp}  |  ${options.extraStamp}`
    : `HAUSMEISTER PRO  |  ${formattedStamp}`;
  const line2 = `${options.objectName}  |  ${gpsText}`;

  const padX = Math.max(14, Math.round(width * 0.025));
  ctx.fillText(line1, padX, height - barHeight + Math.round(barHeight * 0.42), width - padX * 2);
  ctx.font = `400 ${Math.max(11, Math.round(fontSize * 0.88))}px "DM Sans", sans-serif`;
  ctx.fillStyle = '#CBD5E1';
  ctx.fillText(line2, padX, height - barHeight + Math.round(barHeight * 0.78), width - padX * 2);

  const outputDataUrl = canvas.toDataURL('image/jpeg', 0.82);

  return {
    id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    dataUrl: outputDataUrl,
    timestamp: timestampISO,
    lat: coords.lat,
    lng: coords.lng,
    caption: options.caption,
  };
}
