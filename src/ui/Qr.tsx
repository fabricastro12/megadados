'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/** QR for joining the room from a phone. */
export function Qr({ value, size = 200 }: { value: string; size?: number }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toString(value, { type: 'svg', margin: 1, color: { dark: '#1C2A66', light: '#FFFFFF' }, errorCorrectionLevel: 'M' })
      .then(setSvg)
      .catch(() => setSvg(null));
  }, [value]);
  return (
    <div
      role="img"
      aria-label={`Código QR para entrar: ${value}`}
      className="overflow-hidden rounded-2xl border-4 border-ink bg-white p-1"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
