'use client';
import { useState } from 'react';
import { ImageIcon } from 'lucide-react';

export default function AssetThumbnail({ name, imageUrl, onClick }: {
  name: string; imageUrl?: string | null; onClick: () => void;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return <button type="button" onClick={onClick} aria-label={`ดูรูปและรายละเอียด ${name}`}
    className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-slate-400 hover:border-blue-400 focus-visible:outline-2 focus-visible:outline-blue-600">
    {imageUrl && failedUrl !== imageUrl
      ? <img src={imageUrl} alt={name} loading="lazy" width={56} height={56}
          className="h-full w-full object-cover" onError={() => setFailedUrl(imageUrl)} />
      : <ImageIcon size={22} aria-hidden="true" />}
  </button>;
}
