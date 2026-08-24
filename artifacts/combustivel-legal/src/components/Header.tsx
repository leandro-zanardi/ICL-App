import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import logoUrl from '@assets/0_logo_ICL_book-300x123_1787594171904.png';

export function Header({ title, transparent = false }: { title?: string, transparent?: boolean }) {
  const [clicks, setClicks] = useState(0);

  useEffect(() => {
    if (clicks === 3) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
      setClicks(0);
    }
    
    if (clicks > 0) {
      const timer = setTimeout(() => setClicks(0), 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [clicks]);

  return (
    <div className={cn("px-4 py-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] md:pt-9 flex items-center justify-between z-40 relative", transparent ? "bg-transparent" : "bg-white border-b border-slate-100")}>
      <img 
        src={logoUrl} 
        alt="Instituto Combustível Legal" 
        className="h-8 object-contain cursor-pointer"
        onClick={() => setClicks(c => c + 1)}
      />
      {title && (
        <h1 className="text-sm font-bold text-primary font-display">{title}</h1>
      )}
    </div>
  );
}