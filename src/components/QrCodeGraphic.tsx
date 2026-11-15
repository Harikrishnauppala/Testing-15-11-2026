import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrCodeGraphicProps {
  value: string;
  size?: number;
  className?: string;
}

export const QrCodeGraphic: React.FC<QrCodeGraphicProps> = ({
  value,
  size = 180,
  className = '',
}) => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setDataUrl(null);
      return;
    }

    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 1,
      errorCorrectionLevel: value.length > 1400 ? 'L' : 'M',
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`flex items-center justify-center border border-slate-200 bg-white text-[11px] text-slate-400 ${className}`}
      >
        Generating QR...
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt="Worker Batch Sheet QR Code"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`block bg-white ${className}`}
    />
  );
};
