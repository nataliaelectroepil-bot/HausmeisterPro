import React, { useEffect, useId, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, QrCode, X } from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';

interface QRBarcodeScannerModalProps {
  title: string;
  subtitle: string;
  quickPresets: Array<{ code: string; label: string }>;
  onDetected: (code: string) => void;
  onClose: () => void;
}

export const QRBarcodeScannerModal: React.FC<QRBarcodeScannerModalProps> = ({
  title,
  subtitle,
  quickPresets,
  onDetected,
  onClose,
}) => {
  const { t } = useTranslation();
  const rawId = useId().replace(/:/g, '');
  const containerId = `qr_scanner_${rawId}`;
  const [cameraError, setCameraError] = useState(false);
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    let mounted = true;
    const scanner = new Html5Qrcode(containerId);

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 150 } },
        (decodedText) => {
          if (!mounted) return;
          scanner
            .stop()
            .catch(() => {})
            .finally(() => {
              onDetected(decodedText);
            });
        },
        () => {
          // Ignore per-frame decode misses
        }
      )
      .catch(() => {
        if (mounted) {
          setCameraError(true);
        }
      });

    return () => {
      mounted = false;
      try {
        if (scanner.isScanning) {
          scanner.stop().catch(() => {});
        }
      } catch {
        // ignore cleanup errors
      }
    };
  }, [containerId, onDetected]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/75 backdrop-blur-sm sm:p-4">
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <QrCode className="w-4 h-4 text-orange-500" />
              {title}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Camera Viewport */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 overflow-hidden">
          <div id={containerId} className="w-full min-h-[200px]" />
          {cameraError && (
            <div className="p-4 text-center text-xs text-slate-300 space-y-2">
              <Camera className="w-6 h-6 text-slate-500 mx-auto" />
              <p>{t('qr.camError')}</p>
            </div>
          )}
        </div>

        {/* Quick Presets / Simulated Sticker Scan */}
        {quickPresets.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
              {t('qr.quickSelect')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {quickPresets.map((preset) => (
                <button
                  key={preset.code}
                  type="button"
                  onClick={() => onDetected(preset.code)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-orange-500 px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-100 cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Manual Code Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (manualCode.trim()) onDetected(manualCode.trim());
          }}
          className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-800"
        >
          <input
            type="text"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder={t('qr.manualPlaceholder')}
            className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-mono text-xs text-slate-900 dark:text-white"
          />
          <button
            type="submit"
            className="rounded-xl bg-orange-500 hover:bg-orange-600 px-3.5 py-2 text-xs font-semibold text-white cursor-pointer"
          >
            {t('common.apply')}
          </button>
        </form>
      </div>
    </div>
  );
};
