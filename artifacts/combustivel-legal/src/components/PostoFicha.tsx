import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useObterPosto, useCriarCheckin, getObterPostoQueryKey, getObterCarteiraQueryKey, TierSelo, PostoResumo, PostoDetalhe } from '@workspace/api-client-react';
import { Loader2, Navigation, CheckCircle2, AlertCircle, Clock, MapPin, Award, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRequireAuth } from '@/contexts/RequireAuthContext';
import { useLocationContext } from '@/contexts/LocationContext';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

export function PostoFicha({ 
  postoId, 
  isOpen, 
  onClose,
}: { 
  postoId: string | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { data: posto, isLoading } = useObterPosto(postoId!, { query: { enabled: !!postoId, queryKey: getObterPostoQueryKey(postoId!) } });
  const { requireAuth } = useRequireAuth();
  const { activePosition } = useLocationContext();
  const criarCheckin = useCriarCheckin();
  const queryClient = useQueryClient();
  const [showCheckinSuccess, setShowCheckinSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) setShowCheckinSuccess(false);
  }, [isOpen]);

  if (!postoId) return null;

  const handleRoute = () => {
    if (!posto) return;
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${posto.lat},${posto.lng}`, '_blank');
  };

  const handleCheckin = () => {
    requireAuth(() => {
      criarCheckin.mutate({ 
        data: { 
          posto_id: postoId, 
          lat: activePosition.lat, 
          lng: activePosition.lng 
        } 
      }, {
        onSuccess: (data) => {
          setShowCheckinSuccess(true);
          queryClient.invalidateQueries({ queryKey: getObterCarteiraQueryKey() });
          queryClient.invalidateQueries({ queryKey: getObterPostoQueryKey(postoId) });
          toast({ title: 'Check-in realizado!', description: `Você ganhou +${data.pontos_ganhos} pontos!` });
        },
        onError: (err: any) => {
          toast({ title: 'Não foi possível fazer o check-in', description: err.message, variant: 'destructive' });
        }
      });
    });
  };

  const formatDistance = (km: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'unit', unit: 'kilometer', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(km);
  };

  const isVerified = posto?.tier === 'selo';
  const isRegular = posto?.tier === 'regular';
  const formatCnpj = (cnpj: string) => cnpj.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    '$1.$2.$3/$4-$5',
  );
  const formatDate = (value?: string | null) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? null
      : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };
  const notaOficial = posto?.nota_anp;
  const dataAtualizacao = formatDate(posto?.sincronizado_em ?? posto?.atualizado_em);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className={cn("rounded-t-3xl sm:max-w-md sm:mx-auto p-0 flex flex-col max-h-[85vh]", !posto ? "h-64" : "")}>
        {isLoading || !posto ? (
          <div className="flex items-center justify-center h-full pb-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="p-6 pb-4 border-b border-slate-100 flex-shrink-0">
              <div className="flex justify-between items-start gap-4 mb-2">
                <div>
                  <h2 className="text-xl font-bold font-display text-primary leading-tight">
                    {posto.nome_fantasia}
                  </h2>
                  <div className="flex items-center gap-2 mt-1 text-slate-500 text-sm">
                    <span className="font-semibold text-slate-700">{posto.bandeira}</span>
                  </div>
                </div>
                {isVerified && (
                  <div className="bg-flame-gradient p-[2px] rounded-lg shadow-sm shrink-0">
                    <div className="bg-white px-2 py-1 rounded-md flex flex-col items-center justify-center">
                      <Award className="w-5 h-5 text-orange-500 mb-0.5" />
                      <span className="text-[9px] font-bold text-orange-600 uppercase tracking-wider">Selo</span>
                    </div>
                  </div>
                )}
              </div>
              <p className="text-sm text-slate-500 truncate">{posto.endereco}</p>
            </div>

            <div className="overflow-y-auto px-6 py-4 flex-1">
              {showCheckinSuccess ? (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 text-center animate-in zoom-in-95 fade-in">
                  <div className="w-16 h-16 rounded-full bg-flame-gradient flex items-center justify-center mx-auto mb-4 text-white shadow-lg">
                    <Award className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-bold text-orange-800 mb-1">Check-in Confirmado!</h3>
                  <p className="text-orange-600 text-sm mb-4">Você ganhou +50 pontos para trocar por benefícios.</p>
                  <Button variant="outline" className="text-orange-700 border-orange-300 w-full" onClick={() => setShowCheckinSuccess(false)}>
                    Ver Detalhes do Posto
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  <section className="space-y-3" aria-labelledby="posto-informacoes">
                    <div className="flex items-center justify-between gap-3">
                      <h3 id="posto-informacoes" className="text-sm font-bold uppercase tracking-wide text-primary">
                        Informações do posto
                      </h3>
                      {posto.status_recebimento && (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          {posto.status_recebimento}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                      <InfoItem label="CNPJ" value={formatCnpj(posto.cnpj)} mono />
                      <InfoItem label="Situação ANP" value={posto.situacao_anp || 'Não informada'} />
                      <InfoItem label="Razão social" value={posto.razao_social} wide />
                      <InfoItem label="Distribuidora" value={posto.distribuidora || posto.bandeira || 'Não informada'} />
                      <InfoItem
                        label="Nota oficial ANP"
                        value={notaOficial == null ? 'Ainda não informada' : `${notaOficial}/5`}
                        emphasis
                      />
                      {posto.codigo_instalacao_anp && (
                        <InfoItem label="Código de instalação" value={posto.codigo_instalacao_anp} mono />
                      )}
                      <InfoItem label="Município / UF" value={`${posto.municipio} / ${posto.uf}`} />
                      <InfoItem
                        label="Atualização"
                        value={dataAtualizacao ? `ANP · ${dataAtualizacao}` : 'Data não informada'}
                      />
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-400">
                      A nota exibida é a nota oficial publicada pela ANP. O Selo e o score abaixo seguem os critérios do ICL.
                    </p>
                  </section>

                  {/* Status Card */}
                  <div className={cn("p-4 rounded-xl border", isVerified ? "bg-slate-50 border-slate-200" : "bg-slate-50 border-slate-200")}>
                    <div className="flex items-center gap-2 mb-3">
                      {isVerified ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-slate-400" />
                      )}
                      <span className={cn("font-semibold text-sm", isVerified ? "text-slate-800" : "text-slate-600")}>
                        {isVerified ? `Verificado em ${posto.atualizado_em ? new Date(posto.atualizado_em).toLocaleDateString('pt-BR', {month:'short', year:'numeric'}) : 'recente'}` : 'Sem verificação ativa'}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <Criterion row="Situação ANP ativa" checked={posto.criterios.situacao_anp_ativa} />
                      <Criterion row="Sem autuações nos últimos 24 meses" checked={posto.criterios.sem_autuacoes_24m} />
                      <Criterion row="Qualidade do combustível conforme" checked={posto.criterios.qualidade_conforme} />
                      <Criterion row="Bandeira consistente" checked={posto.criterios.bandeira_consistente} />
                    </div>
                  </div>

                  {/* Info */}
                  <div className="text-xs text-slate-400 text-center flex flex-col items-center gap-1">
                    <ShieldCheck className="w-4 h-4 opacity-50" />
                    Informações rastreáveis ao registro oficial da ANP
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 flex gap-3 flex-shrink-0 bg-white">
              {isVerified ? (
                <Button 
                  type="button"
                  variant="outline" 
                  className="flex-1 h-12 text-primary border-primary/20 hover:bg-slate-50"
                  onClick={handleCheckin}
                  disabled={criarCheckin.isPending}
                >
                  <MapPin className="w-4 h-4 mr-2" />
                  Check-in
                </Button>
              ) : (
                <div className="flex-1 text-center self-center text-xs text-slate-500 font-medium bg-slate-100 py-3 rounded-md">
                  Check-in apenas em postos com o selo
                </div>
              )}
              
              <Button 
                onClick={handleRoute}
                className="flex-[2] h-12 bg-primary hover:bg-primary/90 text-white font-bold"
              >
                <Navigation className="w-4 h-4 mr-2" />
                Traçar Rota
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Criterion({ row, checked }: { row: string, checked: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 shrink-0">
        {checked ? (
          <CheckCircle2 className="w-4 h-4 text-green-500" />
        ) : (
          <Clock className="w-4 h-4 text-slate-300" />
        )}
      </div>
      <span className={cn("text-sm", checked ? "text-slate-700" : "text-slate-500")}>
        {row}
      </span>
    </div>
  );
}

function InfoItem({
  label,
  value,
  wide = false,
  mono = false,
  emphasis = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
  mono?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div className={cn(wide && 'col-span-2', 'min-w-0')}>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={cn(
        'mt-0.5 break-words text-sm',
        mono && 'font-mono text-xs',
        emphasis ? 'font-bold text-orange-600' : 'font-medium text-slate-700',
      )}>
        {value}
      </dd>
    </div>
  );
}