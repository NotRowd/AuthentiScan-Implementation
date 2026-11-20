import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { fetchScanImage } from '../../services/api';

export default function ScanThumbnail({ scanId, filename, available }) {
  const frame = useRef(null);
  const [src, setSrc] = useState('');

  useEffect(() => {
    setSrc('');
    if (!available) return;
    const controller = new AbortController();
    let url;
    const load = async () => {
      try {
        const blob = await fetchScanImage(scanId, controller.signal);
        if (controller.signal.aborted || !blob.type.startsWith('image/')) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      } catch {
        // Missing or inaccessible media leaves the row and its actions usable.
      }
    };

    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      void load();
    }, { rootMargin: '160px' });
    if (observer) observer.observe(frame.current);
    else void load();

    return () => {
      observer?.disconnect();
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [scanId, available]);

  return <div ref={frame} className="w-full md:w-16 h-40 md:h-16 rounded-xl bg-canvas border border-line flex items-center justify-center overflow-hidden shrink-0">
    {available && src
      ? <img src={src} alt={`Preview of ${filename}`} className="w-full h-full object-contain" onError={() => setSrc('')} />
      : <ImageIcon aria-hidden="true" className="w-8 md:w-6 h-8 md:h-6 text-ink-muted" />}
  </div>;
}
