import { TaskPhoto } from '../types/facility';

export const MAX_IMAGE_DIMENSION = 1024;
export const JPEG_COMPRESSION_QUALITY = 0.7;

interface WatermarkOptions {
  objectName: string;
  fallbackLat?: number;
  fallbackLng?: number;
  caption?: string;
  extraStamp?: string;
}

interface DecodedImageSource {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

function computeTargetDimensions(
  srcWidth: number,
  srcHeight: number,
  maxDimension = MAX_IMAGE_DIMENSION
): { width: number; height: number } {
  if (srcWidth <= 0 || srcHeight <= 0) {
    return { width: maxDimension, height: maxDimension };
  }
  const maxSide = Math.max(srcWidth, srcHeight);
  const scale = maxSide > maxDimension ? maxDimension / maxSide : 1;
  return {
    width: Math.max(1, Math.round(srcWidth * scale)),
    height: Math.max(1, Math.round(srcHeight * scale)),
  };
}

async function decodeImageFromBlob(blob: Blob): Promise<DecodedImageSource> {
  if (typeof createImageBitmap === 'function') {
    try {
      const probe = await createImageBitmap(blob);
      const { width, height } = computeTargetDimensions(probe.width, probe.height);

      if (width < probe.width || height < probe.height) {
        try {
          const resized = await createImageBitmap(blob, {
            resizeWidth: width,
            resizeHeight: height,
            resizeQuality: 'medium',
          });
          probe.close();
          return {
            source: resized,
            width,
            height,
            release: () => {
              resized.close();
            },
          };
        } catch {
          // Some browsers do not support resize options on createImageBitmap; fall back to drawing probe
        }
      }

      return {
        source: probe,
        width,
        height,
        release: () => {
          probe.close();
        },
      };
    } catch {
      // Fallback to ObjectURL + HTMLImageElement below
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Bild konnte nicht dekodiert werden.'));
      image.src = objectUrl;
    });
    const { width, height } = computeTargetDimensions(
      img.naturalWidth || img.width,
      img.naturalHeight || img.height
    );
    return {
      source: img,
      width,
      height,
      release: () => {
        URL.revokeObjectURL(objectUrl);
      },
    };
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
}

async function getCurrentCoordinates(
  fallbackLat?: number,
  fallbackLng?: number
): Promise<{ lat?: number; lng?: number }> {
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

/**
 * Compresses & resizes any File/Blob to max 1024px (width or height) JPEG at 0.7 quality.
 */
export async function compressImageFileToJpeg(file: Blob): Promise<string> {
  const decoded = await decodeImageFromBlob(file);
  const canvas = document.createElement('canvas');
  try {
    canvas.width = decoded.width;
    canvas.height = decoded.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas-Kontext nicht verfügbar.');
    }
    ctx.drawImage(decoded.source, 0, 0, decoded.width, decoded.height);
    return canvas.toDataURL('image/jpeg', JPEG_COMPRESSION_QUALITY);
  } finally {
    decoded.release();
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Ensures any existing TaskPhoto dataUrl is compressed JPEG (max 1024px, quality 0.7) before saving/sending.
 */
export async function compressTaskPhotoIfNeeded(photo: TaskPhoto): Promise<TaskPhoto> {
  const url = photo.dataUrl;
  if (!url) return photo;

  const isAlreadyCompactJpeg =
    url.startsWith('data:image/jpeg') && url.length <= 350_000;
  if (isAlreadyCompactJpeg) {
    return photo;
  }

  if (!url.startsWith('data:image/')) {
    return photo;
  }

  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const compressedUrl = await compressImageFileToJpeg(blob);
    return {
      ...photo,
      dataUrl: compressedUrl,
    };
  } catch {
    return photo;
  }
}

export async function createWatermarkedPhoto(
  file: File,
  options: WatermarkOptions
): Promise<TaskPhoto> {
  const [coords, decoded] = await Promise.all([
    getCurrentCoordinates(options.fallbackLat, options.fallbackLng),
    decodeImageFromBlob(file),
  ]);

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

  const { width, height } = decoded;
  const canvas = document.createElement('canvas');

  try {
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Bild konnte nicht komprimiert werden.');
    }

    ctx.drawImage(decoded.source, 0, 0, width, height);

    const barHeight = Math.max(54, Math.round(height * 0.12));
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(0, height - barHeight, width, barHeight);

    // Safety orange accent stripe at top of watermark bar
    ctx.fillStyle = '#F97316';
    ctx.fillRect(0, height - barHeight, width, 3);

    const fontSize = Math.max(12, Math.round(width * 0.02));
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

    const padX = Math.max(12, Math.round(width * 0.025));
    ctx.fillText(line1, padX, height - barHeight + Math.round(barHeight * 0.42), width - padX * 2);
    ctx.font = `400 ${Math.max(10, Math.round(fontSize * 0.88))}px "DM Sans", sans-serif`;
    ctx.fillStyle = '#CBD5E1';
    ctx.fillText(line2, padX, height - barHeight + Math.round(barHeight * 0.78), width - padX * 2);

    const outputDataUrl = canvas.toDataURL('image/jpeg', JPEG_COMPRESSION_QUALITY);

    return {
      id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      dataUrl: outputDataUrl,
      timestamp: timestampISO,
      lat: coords.lat,
      lng: coords.lng,
      caption: options.caption,
    };
  } finally {
    decoded.release();
    canvas.width = 0;
    canvas.height = 0;
  }
}
