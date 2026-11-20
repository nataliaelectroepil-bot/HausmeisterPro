import React, { useRef, useState } from 'react';
import { Check, Eraser } from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';

interface SignaturePadProps {
  label: string;
  value?: string;
  onChange: (dataUrl: string | undefined) => void;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({
  label,
  value,
  onChange,
}) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const [hasStroke, setHasStroke] = useState(false);

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    };
  };

  const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pt = getPoint(e);
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    isDrawingRef.current = true;
    setHasStroke(true);
  };

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pt = getPoint(e);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
  };

  const handleUp = () => {
    isDrawingRef.current = false;
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
    onChange(undefined);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStroke) return;
    onChange(canvas.toDataURL('image/png'));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          {label}
        </span>
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline cursor-pointer"
          >
            {t('sig.resign')}
          </button>
        )}
      </div>

      {value ? (
        <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 p-3 flex items-center justify-between gap-3">
          <img
            src={value}
            alt={label}
            className="h-16 bg-white rounded-lg border border-slate-200 p-1 object-contain"
          />
          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
            <Check className="w-4 h-4" /> {t('sig.saved')}
          </span>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white overflow-hidden">
            <canvas
              ref={canvasRef}
              width={560}
              height={150}
              onPointerDown={handleDown}
              onPointerMove={handleMove}
              onPointerUp={handleUp}
              onPointerLeave={handleUp}
              className="w-full h-32 touch-none cursor-crosshair block"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleClear}
              className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Eraser className="w-3.5 h-3.5" />
              {t('common.clear')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!hasStroke}
              className="flex items-center gap-1 rounded-lg bg-slate-900 dark:bg-orange-500 disabled:opacity-40 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-orange-600 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              {t('common.apply')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
