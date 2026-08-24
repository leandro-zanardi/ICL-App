import { useEffect, useState } from 'react';
import { useObterDashboard, getObterDashboardQueryKey, EventoFeed } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import logoUrl from '@assets/0_logo_ICL_book-300x123_1787594171904.png';
import { Activity, ShieldCheck, Route, Gift, AlertTriangle, MapPin, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ApresentacaoPage() {
  const queryClient = useQueryClient();
  const { data: dashboard, isLoading } = useObterDashboard();
  const [feed, setFeed] = useState<EventoFeed[]>([]);
  const [highlightedId, setHighlightId] = useState<string | null>(null);

  useEffect(() => {
    // Populate initial feed from dashboard
    if (dashboard?.eventos_recentes && feed.length === 0) {
      setFeed(dashboard.eventos_recentes);
    }
  }, [dashboard, feed.length]);

  useEffect(() => {
    const es = new EventSource(import.meta.env.BASE_URL + 'api/apresentacao/stream');
    
    es.onmessage = (e) => {
      try {
        const evento = JSON.parse(e.data) as EventoFeed;
        setFeed(prev => [evento, ...prev].slice(0, 50)); // Keep max 50
        setHighlightId(evento.id);
        
        // Clear highlight after 2s
        setTimeout(() => setHighlightId(null), 2000);
        
        // Invalidate dashboard to refresh KPIs
        queryClient.invalidateQueries({ queryKey: getObterDashboardQueryKey() });
      } catch (err) {
        console.error('Failed to parse SSE event', err);
      }
    };

    es.onerror = () => {
      // EventSource auto reconnects, silent error
    };

    return () => es.close();
  }, [queryClient]);

  const getEventIcon = (type: string) => {
    switch(type) {
      case 'busca': return <MapPin className="text-blue-500 w-5 h-5" />;
      case 'visualizou_posto': return <Activity className="text-purple-500 w-5 h-5" />;
      case 'rota_tracada': return <Route className="text-indigo-500 w-5 h-5" />;
      case 'checkin': return <ShieldCheck className="text-green-500 w-5 h-5" />;
      case 'resgate': return <Gift className="text-orange-500 w-5 h-5" />;
      case 'denuncia': return <AlertTriangle className="text-red-500 w-5 h-5" />;
      case 'reset': return <Activity className="text-slate-500 w-5 h-5" />;
      default: return <Activity className="text-slate-400 w-5 h-5" />;
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 flex flex-col font-sans">
      <header className="bg-white px-8 py-4 border-b border-slate-200 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-6">
          <img src={logoUrl} alt="Instituto Combustível Legal" className="h-10" />
          <div className="h-8 w-px bg-slate-200"></div>
          <h1 className="text-xl font-display font-bold text-primary">Modo Apresentação</h1>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
          Ao vivo
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Phone Simulator */}
        <div className="w-[500px] bg-slate-100 flex items-center justify-center p-8 border-r border-slate-200 shrink-0 relative overflow-hidden hidden lg:flex">
          <div className="w-[390px] h-[844px] bg-white rounded-[3rem] shadow-2xl border-[14px] border-slate-900 relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-7 z-50 pointer-events-none flex justify-center">
              <div className="w-40 h-7 bg-slate-900 rounded-b-3xl"></div>
            </div>
            <iframe 
              src={import.meta.env.BASE_URL}
              className="w-full h-full border-0"
              title="App Preview"
            />
          </div>
        </div>

        {/* Right: Dashboard */}
        <div className="flex-1 overflow-y-auto p-8 flex flex-col">
          <div className="mb-8">
            <h2 className="text-3xl font-display font-black text-primary mb-1">
              Painel da Associada — <span className="text-teal-600">Distribuidora Horizonte</span>
            </h2>
            <p className="text-slate-500 font-medium">Dados simulados para demonstração</p>
          </div>

          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-12 h-12 animate-spin text-primary opacity-20" />
            </div>
          ) : !dashboard ? (
            <div className="text-center text-slate-500 py-12">Nenhum dado disponível.</div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              {/* KPIs & Rankings */}
              <div className="xl:col-span-2 flex flex-col gap-8">
                {/* Top KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <KpiCard label="Postos na Rede" value={dashboard.postos_rede} icon={<MapPin />} />
                  <KpiCard label="Check-ins (Selo) Hoje" value={dashboard.checkins_hoje} icon={<ShieldCheck className="text-green-500" />} />
                  <KpiCard label="Rotas Traçadas" value={dashboard.rotas_hoje} icon={<Route className="text-indigo-500" />} />
                  <KpiCard label="Resgates Realizados" value={dashboard.resgates_hoje} icon={<Gift className="text-orange-500" />} />
                  <KpiCard label="Denúncias na Região" value={dashboard.denuncias_hoje} icon={<AlertTriangle className="text-red-500" />} />
                  <KpiCard label="Vistas no Mapa" value={dashboard.visualizacoes_hoje} icon={<Activity className="text-blue-500" />} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Ranking */}
                  <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-4 font-display">Postos mais vistos hoje</h3>
                    <div className="space-y-3">
                      {dashboard.postos_mais_vistos.map((p, i) => (
                        <div key={p.posto_id} className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded bg-slate-100 text-slate-500 font-bold text-xs flex items-center justify-center shrink-0">
                            {i+1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-slate-800 truncate">{p.nome_fantasia}</div>
                            <div className="text-xs text-slate-500 truncate">{p.municipio}</div>
                          </div>
                          <div className="font-bold text-primary">{p.visualizacoes}</div>
                        </div>
                      ))}
                      {dashboard.postos_mais_vistos.length === 0 && (
                        <div className="text-sm text-slate-400 py-2">Sem dados</div>
                      )}
                    </div>
                  </div>

                  {/* Municípios */}
                  <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-4 font-display">Denúncias por Município</h3>
                    <div className="space-y-4">
                      {dashboard.denuncias_por_municipio.map((m) => (
                        <div key={m.municipio}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium text-slate-700">{m.municipio}</span>
                            <span className="font-bold">{m.total}</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2">
                            <div className="bg-red-500 h-2 rounded-full" style={{ width: `${Math.min(100, (m.total / 10) * 100)}%` }}></div>
                          </div>
                        </div>
                      ))}
                      {dashboard.denuncias_por_municipio.length === 0 && (
                        <div className="text-sm text-slate-400 py-2">Sem denúncias hoje</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Live Feed */}
              <div className="xl:col-span-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[600px] xl:h-auto overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center gap-3 shrink-0">
                  <Activity className="text-primary w-6 h-6" />
                  <h3 className="font-bold text-primary font-display text-lg">Feed de Atividade</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {feed.map((ev) => (
                    <div 
                      key={ev.id} 
                      className={cn(
                        "p-4 rounded-xl border transition-all duration-500 flex gap-3",
                        highlightedId === ev.id ? "bg-blue-50 border-blue-200 shadow-md scale-[1.02]" : "bg-white border-slate-100",
                        ev.rede_associada ? "border-l-4 border-l-teal-500" : ""
                      )}
                    >
                      <div className="mt-1 shrink-0 bg-slate-50 p-2 rounded-full">
                        {getEventIcon(ev.event_type)}
                      </div>
                      <div>
                        <div className="font-medium text-sm text-slate-800">{ev.descricao}</div>
                        <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                          <span>{new Date(ev.criado_em).toLocaleTimeString('pt-BR')}</span>
                          {ev.municipio && (
                            <>
                              <span>•</span>
                              <span>{ev.municipio}</span>
                            </>
                          )}
                          {ev.rede_associada && (
                            <>
                              <span>•</span>
                              <span className="text-teal-600 font-bold uppercase tracking-wider text-[10px]">Horizonte</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {feed.length === 0 && (
                    <div className="text-center py-12 text-slate-400">
                      Aguardando eventos...
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon }: { label: string, value: number, icon: React.ReactNode }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
      <div className="text-slate-500 text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
        <div className="p-1.5 bg-slate-50 rounded-lg">{icon}</div>
        <span className="truncate">{label}</span>
      </div>
      <div className="text-4xl font-black font-display text-primary">{value}</div>
    </div>
  );
}