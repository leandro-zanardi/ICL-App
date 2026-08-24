import { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Map, Route as RouteIcon, Gift, AlertTriangle, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DemoBar } from '@/components/DemoBar';
import { InstallPrompt } from '@/components/InstallPrompt';

function BottomNav() {
  const [location] = useLocation();

  const items = [
    { href: '/', icon: Map, label: 'Mapa' },
    { href: '/rota', icon: RouteIcon, label: 'Rota' },
    { href: '/beneficios', icon: Gift, label: 'Benefícios' },
    { href: '/denunciar', icon: AlertTriangle, label: 'Denunciar' },
  ];

  return (
    <div className="absolute bottom-0 w-full bg-white border-t border-slate-100 flex items-center justify-around pb-[env(safe-area-inset-bottom,0px)] z-50">
      {items.map((item) => {
        const isActive = location === item.href;
        const Icon = item.icon;
        
        return (
          <Link key={item.href} href={item.href} className="flex-1 flex flex-col items-center justify-center py-3 gap-1 relative">
            <div className="relative">
              <Icon className={cn("w-6 h-6", isActive ? "text-primary" : "text-slate-400")} />
              {isActive && (
                <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-flame-gradient shadow-sm border border-white" />
              )}
            </div>
            <span className={cn("text-[10px] font-medium", isActive ? "text-primary font-bold" : "text-slate-400")}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export function ConsumerLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const isFullscreen = location === '/apresentacao' || location === '/admin/importar';

  if (isFullscreen) {
    return <div className="min-h-screen w-full">{children}</div>;
  }

  return (
    <div className="min-h-[100dvh] w-full bg-slate-100 md:bg-slate-200 flex items-center justify-center overflow-hidden">
      <DemoBar />
      <div id="consumer-frame" className="w-full h-[100dvh] md:h-[844px] md:w-[390px] md:rounded-[2.5rem] bg-background md:shadow-2xl relative overflow-hidden flex flex-col md:border-[8px] md:border-slate-800 transform-gpu">
        {/* Notch simulation for desktop view */}
        <div className="hidden md:block absolute top-0 inset-x-0 h-6 z-50 pointer-events-none">
          <div className="w-32 h-6 bg-slate-800 mx-auto rounded-b-2xl"></div>
        </div>
        
        <div className="flex-1 overflow-hidden relative">
          {children}
        </div>
        <div id="consumer-sheet-root" />
        <InstallPrompt />
        <BottomNav />
      </div>
    </div>
  );
}