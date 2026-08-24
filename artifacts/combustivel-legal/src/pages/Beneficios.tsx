import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRequireAuth } from '@/contexts/RequireAuthContext';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { useObterCarteira, useListarRecompensas, useCriarResgate, useListarResgates, getObterCarteiraQueryKey, getListarResgatesQueryKey, getListarRecompensasQueryKey, Recompensa, Resgate } from '@workspace/api-client-react';
import { Gift, Award, LogOut, ChevronRight, QrCode, Ticket } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

export default function BeneficiosPage() {
  const { token, logout } = useAuth();
  const { requireAuth } = useRequireAuth();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState<'catalogo'|'cupons'>('catalogo');
  const [qrResgate, setQrResgate] = useState<Resgate | null>(null);

  const { data: carteira } = useObterCarteira({ query: { enabled: !!token, queryKey: getObterCarteiraQueryKey() } });
  const { data: recompensas = [] } = useListarRecompensas({ query: { enabled: !!token, queryKey: getListarRecompensasQueryKey() } });
  const { data: resgates = [] } = useListarResgates({ query: { enabled: !!token, queryKey: getListarResgatesQueryKey() } });
  
  const criarResgate = useCriarResgate();

  const handleResgatar = (recompensa: Recompensa) => {
    if (!carteira || carteira.saldo < recompensa.custo_pontos) return;
    
    criarResgate.mutate({ data: { recompensa_id: recompensa.id } }, {
      onSuccess: (data) => {
        setQrResgate(data);
        queryClient.invalidateQueries({ queryKey: getObterCarteiraQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListarResgatesQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: 'Erro ao resgatar', description: err.message, variant: 'destructive' });
      }
    });
  };

  if (!token) {
    return (
      <div className="h-full w-full flex flex-col bg-slate-50">
        <Header title="Benefícios" />
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center pb-24">
          <div className="w-24 h-24 bg-flame-gradient rounded-full flex items-center justify-center mb-6 shadow-xl text-white">
            <Gift className="w-12 h-12" />
          </div>
          <h2 className="text-2xl font-bold font-display text-primary mb-3">Programa de Benefícios</h2>
          <p className="text-slate-600 mb-8 leading-relaxed">
            Faça check-in em postos verificados com o Selo Combustível Legal e troque pontos por descontos e serviços.
          </p>
          <Button 
            size="lg" 
            className="w-full font-bold bg-primary"
            onClick={() => requireAuth(() => {})}
          >
            Entrar com celular
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-slate-50 overflow-hidden">
      <div className="bg-primary text-white pt-12 pb-6 px-6 relative rounded-b-3xl shrink-0 shadow-sm z-10">
        <div className="absolute top-4 right-4">
          <button onClick={logout} className="text-primary-foreground/60 hover:text-white flex items-center gap-1 text-xs">
            Sair <LogOut className="w-3 h-3" />
          </button>
        </div>
        
        <div className="flex flex-col items-center text-center">
          <div className="text-primary-foreground/80 font-medium mb-1 flex items-center gap-1.5">
            <Award className="w-4 h-4 text-orange-400" /> Seus Pontos
          </div>
          <div className="text-5xl font-display font-black tracking-tight mb-4">
            {carteira?.saldo ?? 0}
          </div>
          
          <div className="bg-white/10 rounded-xl p-3 w-full backdrop-blur-sm max-h-24 overflow-y-auto no-scrollbar">
            {carteira?.transacoes && carteira.transacoes.length > 0 ? (
              <div className="flex flex-col gap-2">
                {carteira.transacoes.slice(0,3).map(t => (
                  <div key={t.id} className="flex justify-between items-center text-xs">
                    <span className="text-primary-foreground/80 truncate pr-2">{t.descricao}</span>
                    <span className={cn("font-bold whitespace-nowrap", t.tipo === 'credito' ? "text-green-400" : "text-orange-400")}>
                      {t.tipo === 'credito' ? '+' : '-'}{t.pontos}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-primary-foreground/60 text-center py-2">
                Nenhuma movimentação ainda
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex p-1 bg-slate-200/50 mx-4 mt-6 rounded-lg shrink-0">
        <button 
          onClick={() => setActiveTab('catalogo')}
          className={cn("flex-1 py-2 text-sm font-medium rounded-md transition-colors", activeTab === 'catalogo' ? "bg-white shadow-sm text-primary" : "text-slate-500 hover:text-slate-700")}
        >
          Catálogo
        </button>
        <button 
          onClick={() => setActiveTab('cupons')}
          className={cn("flex-1 py-2 text-sm font-medium rounded-md transition-colors", activeTab === 'cupons' ? "bg-white shadow-sm text-primary" : "text-slate-500 hover:text-slate-700")}
        >
          Meus Cupons
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 pb-24">
        {activeTab === 'catalogo' ? (
          <div className="flex flex-col gap-4">
            {recompensas.map(rec => {
              const canAfford = (carteira?.saldo ?? 0) >= rec.custo_pontos;
              return (
                <div key={rec.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex gap-4 items-center">
                  <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center shrink-0">
                    <Gift className="w-6 h-6 text-primary/40" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-800 truncate leading-tight mb-0.5">{rec.nome}</h3>
                    <p className="text-xs text-slate-500 truncate mb-1.5">{rec.descricao}</p>
                    <div className="font-bold text-primary flex items-center gap-1 text-sm">
                      {rec.custo_pontos} pts
                    </div>
                  </div>
                  <Button 
                    variant={canAfford ? 'default' : 'secondary'}
                    size="sm"
                    className={cn("shrink-0", canAfford ? "bg-primary hover:bg-primary/90" : "text-slate-400")}
                    disabled={!canAfford || criarResgate.isPending}
                    onClick={() => handleResgatar(rec)}
                  >
                    Resgatar
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {resgates.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Ticket className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>Você ainda não tem cupons.</p>
              </div>
            ) : (
              resgates.map(res => (
                <div 
                  key={res.id} 
                  className={cn("bg-white p-4 rounded-2xl shadow-sm border flex flex-col gap-3 cursor-pointer transition-colors hover:bg-slate-50", res.status === 'ativo' ? "border-primary/20" : "border-slate-100 opacity-60")}
                  onClick={() => res.status === 'ativo' && setQrResgate(res)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center shrink-0">
                      <QrCode className="w-5 h-5 text-primary/60" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-slate-800 truncate">{res.recompensa.nome}</h3>
                      <div className="text-xs text-slate-500 flex items-center gap-2">
                        <span>{new Date(res.criado_em).toLocaleDateString('pt-BR')}</span>
                        <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold uppercase", res.status === 'ativo' ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500")}>
                          {res.status}
                        </span>
                      </div>
                    </div>
                    {res.status === 'ativo' && <ChevronRight className="w-5 h-5 text-slate-300" />}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <Dialog open={!!qrResgate} onOpenChange={(open) => !open && setQrResgate(null)}>
        <DialogContent className="sm:max-w-md text-center flex flex-col items-center">
          <DialogHeader className="mb-2">
            <DialogTitle className="text-xl font-display text-primary text-center">
              {qrResgate?.recompensa.nome}
            </DialogTitle>
          </DialogHeader>
          
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm mb-4 inline-block">
            {qrResgate && (
              <QRCodeSVG 
                value={qrResgate.codigo} 
                size={200}
                level="H"
                fgColor="#0E2A47"
              />
            )}
          </div>
          
          <div className="bg-slate-100 px-6 py-3 rounded-xl font-mono text-2xl tracking-widest font-bold text-slate-800 mb-6">
            {qrResgate?.codigo}
          </div>
          
          <p className="text-sm text-slate-500 mb-6 max-w-[250px]">
            Apresente este código ou QR Code no estabelecimento parceiro.
          </p>
          
          <Button variant="outline" className="w-full" onClick={() => setQrResgate(null)}>
            Fechar
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}