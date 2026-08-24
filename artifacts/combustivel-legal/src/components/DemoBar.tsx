import { useState, useEffect } from 'react';
import { useLocationContext } from '@/contexts/LocationContext';
import { useResetarDemo, useGerarEventosDemo } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Bug, X } from 'lucide-react';

export function DemoBar() {
  const [isOpen, setIsOpen] = useState(false);
  const { setDemoPosition, demoPosition } = useLocationContext();
  const queryClient = useQueryClient();
  const resetDemo = useResetarDemo();
  const generateEvents = useGerarEventosDemo();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle on 'd' key if not typing in an input
      if (e.key === 'd' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        setIsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleReset = () => {
    resetDemo.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries();
        toast({ title: 'Demonstração reiniciada' });
      }
    });
  };

  const handleGenerate = () => {
    generateEvents.mutate({ data: { quantidade: 8 } }, {
      onSuccess: () => {
        toast({ title: 'Eventos simulados enviados' });
      }
    });
  };

  const teleports = [
    { label: 'Paulista', pos: { lat: -23.5614, lng: -46.6559 } },
    { label: 'Anhanguera', pos: { lat: -23.3081, lng: -46.8764 } },
    { label: 'Campinas', pos: { lat: -22.9056, lng: -47.0608 } },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed top-4 left-4 z-[9999] bg-slate-900 text-white p-3 rounded-lg shadow-xl text-xs flex flex-col gap-3 w-64">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-1 font-bold text-slate-300">
          <Bug className="w-4 h-4" /> Demo Mode
        </div>
        <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-1">
        <div className="text-slate-500 font-semibold mb-1">Teleporte (Mapa)</div>
        <div className="flex flex-wrap gap-1">
          {teleports.map(t => (
            <button
              key={t.label}
              onClick={() => setDemoPosition(t.pos)}
              className={cn("px-2 py-1 rounded", demoPosition?.lat === t.pos.lat ? "bg-primary text-white" : "bg-slate-800 text-slate-300")}
            >
              {t.label}
            </button>
          ))}
          <button 
            onClick={() => setDemoPosition(null)}
            className={cn("px-2 py-1 rounded", !demoPosition ? "bg-primary text-white" : "bg-slate-800 text-slate-300")}
          >
            Real
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-slate-500 font-semibold mb-1">Ações Globais</div>
        <div className="flex gap-2">
          <button onClick={handleReset} className="flex-1 bg-red-900/50 hover:bg-red-900 text-red-200 py-1 rounded">
            Resetar API
          </button>
          <button onClick={handleGenerate} className="flex-1 bg-blue-900/50 hover:bg-blue-900 text-blue-200 py-1 rounded">
            +8 Eventos
          </button>
        </div>
      </div>
    </div>
  );
}