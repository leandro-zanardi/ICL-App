import { useEffect, useState } from 'react';
import { Download, Share2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || localStorage.getItem('cl_install_dismissed')) return;

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIos) setShowIosHint(true);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  const dismiss = () => {
    localStorage.setItem('cl_install_dismissed', 'true');
    setInstallEvent(null);
    setShowIosHint(false);
  };

  if (!installEvent && !showIosHint) return null;

  return (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+76px)] left-3 right-3 z-[600] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl md:left-1/2 md:right-auto md:w-[360px] md:-translate-x-1/2">
      <button aria-label="Fechar instrução de instalação" onClick={dismiss} className="absolute right-2 top-2 rounded-full p-1 text-slate-400 hover:bg-slate-100">
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3 pr-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-flame-gradient text-white">
          {showIosHint ? <Share2 className="h-5 w-5" /> : <Download className="h-5 w-5" />}
        </div>
        <div>
          <p className="font-display text-sm font-bold text-primary">Tenha o Combustível Legal no celular</p>
          {showIosHint ? (
            <p className="mt-1 text-xs leading-relaxed text-slate-600">Toque em <strong>Compartilhar</strong> e depois em “Adicionar à Tela de Início”.</p>
          ) : (
            <p className="mt-1 text-xs leading-relaxed text-slate-600">Instale para consultar seu último mapa mesmo quando estiver sem internet.</p>
          )}
        </div>
      </div>
      {installEvent && (
        <Button
          className="mt-3 h-9 w-full bg-primary text-sm font-bold"
          onClick={async () => {
            await installEvent.prompt();
            const choice = await installEvent.userChoice;
            if (choice.outcome === 'accepted') dismiss();
          }}
        >
          Instalar aplicativo
        </Button>
      )}
    </div>
  );
}