import { useState, useRef, useEffect } from 'react';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useListarPostos, DenunciaInputCategoria, getListarPostosQueryKey } from '@workspace/api-client-react';
import { useLocationContext } from '@/contexts/LocationContext';
import { useDenunciaQueue } from '@/contexts/DenunciaQueueContext';
import { AlertTriangle, Droplet, Hash, Copy, CheckCircle2, MapPin, Camera, X, WifiOff, RefreshCw, Clock3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

export default function DenunciarPage() {
  const { activePosition } = useLocationContext();
  const { isOnline, queue, sendDenuncia, retryDenuncia, lastSent } = useDenunciaQueue();
  
  const [step, setStep] = useState<'form' | 'pending' | 'success'>('form');
  const [protocolo, setProtocolo] = useState('');
  
  const [categoria, setCategoria] = useState<DenunciaInputCategoria>('qualidade_combustivel');
  const [descricao, setDescricao] = useState('');
  const [postoSearch, setPostoSearch] = useState('');
  const [selectedPostoId, setSelectedPostoId] = useState<string | null>(null);
  const [fotoNome, setFotoNome] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const debouncedPostoSearch = useDebouncedValue(postoSearch.trim());
  const isPostoQueryCurrent = debouncedPostoSearch === postoSearch.trim();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: postosNearby = [] } = useListarPostos(
    { lat: activePosition.lat, lng: activePosition.lng, raio_km: 5, q: debouncedPostoSearch },
    {
      query: {
        enabled: debouncedPostoSearch.length >= 2,
        queryKey: getListarPostosQueryKey({
          lat: activePosition.lat,
          lng: activePosition.lng,
          raio_km: 5,
          q: debouncedPostoSearch,
        }),
      },
    },
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFotoNome(e.target.files[0].name);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (descricao.length < 5) {
      toast({ title: 'Descrição muito curta', description: 'Por favor, detalhe melhor o ocorrido.', variant: 'destructive' });
      return;
    }

    void sendDenuncia({
      categoria,
      descricao,
      posto_id: selectedPostoId,
      foto_nome: fotoNome
    }).then((result) => {
      if (result.status === 'sent') {
        setProtocolo(result.response.protocolo);
        setStep('success');
      } else {
        setPendingId(result.id);
        setStep('pending');
      }
    });
  };

  useEffect(() => {
    if (pendingId && lastSent?.id === pendingId) {
      setProtocolo(lastSent.response.protocolo);
      setStep('success');
      setPendingId(null);
    }
  }, [lastSent, pendingId]);

  const copyProtocol = () => {
    navigator.clipboard.writeText(protocolo);
    toast({ title: 'Protocolo copiado' });
  };

  if (step === 'pending') {
    const pending = queue.find((item) => item.id === pendingId);
    return (
      <div className="h-full w-full flex flex-col bg-slate-50">
        <Header title="Denunciar" />
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center pb-24">
          <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-6 shadow-sm">
            {pending?.status === 'error' ? <RefreshCw className="w-10 h-10" /> : <Clock3 className="w-10 h-10" />}
          </div>
          <h2 className="text-2xl font-bold font-display text-slate-800 mb-2">
            {pending?.status === 'error' ? 'Ainda não foi enviada' : 'Denúncia pendente'}
          </h2>
          <p className="text-slate-600 mb-6">
            {pending?.status === 'error'
              ? pending.error
              : 'Salvamos sua denúncia neste aparelho. Ela será enviada automaticamente assim que a conexão voltar.'}
          </p>
          <div className="w-full max-w-sm bg-amber-50 border border-amber-200 rounded-xl p-4 text-left flex gap-3 mb-6">
            <WifiOff className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              <strong>{isOnline ? 'Conexão disponível' : 'Você está sem conexão'}</strong>
              <div className="mt-1 text-amber-800">Não feche o app: a fila continua salva mesmo se você sair desta tela.</div>
            </div>
          </div>
          {pending?.status === 'error' && (
            <Button variant="outline" className="w-full max-w-sm mb-3" onClick={() => pendingId && retryDenuncia(pendingId)}>
              Tentar enviar novamente
            </Button>
          )}
          <Button variant="outline" className="w-full max-w-sm" onClick={() => {
            setStep('form');
            setPendingId(null);
            setDescricao('');
            setFotoNome(null);
            setSelectedPostoId(null);
            setPostoSearch('');
          }}>
            Fazer nova denúncia
          </Button>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="h-full w-full flex flex-col bg-slate-50">
        <Header title="Denunciar" />
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center pb-24">
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 shadow-sm">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold font-display text-slate-800 mb-2">Denúncia Registrada</h2>
          <p className="text-slate-600 mb-6">
            O ICL encaminha as informações aos órgãos competentes. Agradecemos sua colaboração.
          </p>
          
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm w-full max-w-sm mb-8">
            <div className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-2">Seu Protocolo</div>
            <div className="text-2xl font-mono font-bold text-primary flex items-center justify-center gap-3">
              {protocolo}
              <button onClick={copyProtocol} className="text-slate-400 hover:text-primary transition-colors">
                <Copy className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          <Button variant="outline" className="w-full max-w-sm" onClick={() => {
            setStep('form');
            setDescricao('');
            setFotoNome(null);
            setSelectedPostoId(null);
            setPostoSearch('');
          }}>
            Fazer nova denúncia
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-slate-50">
      <Header title="Denunciar" />
      
      <div className="flex-1 overflow-y-auto pb-24">
        <div className="p-4 bg-primary text-white mb-6 shadow-sm relative">
          <h2 className="text-lg font-bold font-display mb-1 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-400" />
            Viu algo errado?
          </h2>
          <p className="text-primary-foreground/70 text-sm">
            Sua denúncia é 100% anônima e nos ajuda a manter um mercado mais justo e seguro.
          </p>
        </div>

        {queue.length > 0 && (
          <div className="mx-4 mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
              <Clock3 className="w-4 h-4" />
              {queue.length === 1 ? '1 denúncia aguardando envio' : `${queue.length} denúncias aguardando envio`}
            </div>
            <p className="mt-1 text-xs text-amber-800">
              {isOnline ? 'Estamos tentando enviar automaticamente.' : 'Ficarão salvas até a conexão voltar.'}
            </p>
            <div className="mt-3 space-y-2">
              {queue.map((item) => (
                <div key={item.id} className="rounded-lg bg-white/70 px-3 py-2 text-xs text-amber-900">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {item.status === 'error' ? 'Erro persistente' : item.status === 'sending' ? 'Enviando…' : 'Pendente'}
                    </span>
                    {item.status === 'error' && (
                      <button
                        type="button"
                        className="font-bold underline shrink-0"
                        onClick={() => retryDenuncia(item.id)}
                      >
                        Tentar novamente
                      </button>
                    )}
                  </div>
                  {item.error && <div className="mt-1 truncate text-amber-800">{item.error}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="px-4 flex flex-col gap-6">
          <div className="space-y-3">
            <Label className="text-base font-bold text-slate-800">O que aconteceu?</Label>
            <div className="grid grid-cols-2 gap-3">
              <RadioCard 
                selected={categoria === 'qualidade_combustivel'} 
                onClick={() => setCategoria('qualidade_combustivel')}
                icon={<Droplet className="w-6 h-6 mb-2 text-blue-500" />}
                label="Qualidade do Combustível"
              />
              <RadioCard 
                selected={categoria === 'volume_bomba'} 
                onClick={() => setCategoria('volume_bomba')}
                icon={<Hash className="w-6 h-6 mb-2 text-green-500" />}
                label="Volume da Bomba"
              />
              <RadioCard 
                selected={categoria === 'posto_clone'} 
                onClick={() => setCategoria('posto_clone')}
                icon={<Copy className="w-6 h-6 mb-2 text-purple-500" />}
                label="Suspeita de Posto Clone"
              />
              <RadioCard 
                selected={categoria === 'outra'} 
                onClick={() => setCategoria('outra')}
                icon={<AlertTriangle className="w-6 h-6 mb-2 text-slate-500" />}
                label="Outra Irregularidade"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-base font-bold text-slate-800">Onde? <span className="text-slate-400 font-normal text-sm">(opcional)</span></Label>
            {!selectedPostoId ? (
              <div className="relative">
                <MapPin className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                <Input 
                  value={postoSearch}
                  onChange={(e) => setPostoSearch(e.target.value)}
                  placeholder="Nome do posto ou endereço"
                  className="pl-10 h-12 bg-white"
                />
                {isPostoQueryCurrent && postoSearch.length >= 2 && postosNearby.length > 0 && (
                  <div className="absolute top-14 inset-x-0 bg-white border border-slate-100 rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto">
                    {postosNearby.map(posto => (
                      <div 
                        key={posto.id}
                        className="px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer"
                        onClick={() => {
                          setSelectedPostoId(posto.id);
                          setPostoSearch(posto.nome_fantasia);
                        }}
                      >
                        <div className="font-bold text-slate-700 text-sm truncate">{posto.nome_fantasia}</div>
                        <div className="text-xs text-slate-500 truncate">{posto.endereco}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-slate-100 p-3 rounded-xl border border-slate-200 flex justify-between items-center">
                <div className="truncate font-medium text-slate-700 text-sm flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary" />
                  {postoSearch}
                </div>
                <button type="button" onClick={() => { setSelectedPostoId(null); setPostoSearch(''); }} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-base font-bold text-slate-800">Detalhes</Label>
            <Textarea 
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descreva o que você observou..."
              className="min-h-[120px] bg-white resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-base font-bold text-slate-800">Foto <span className="text-slate-400 font-normal text-sm">(opcional)</span></Label>
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileChange}
            />
            {fotoNome ? (
              <div className="bg-slate-100 p-3 rounded-xl border border-slate-200 flex justify-between items-center">
                <div className="truncate font-medium text-slate-700 text-sm flex items-center gap-2">
                  <Camera className="w-4 h-4 text-primary" />
                  {fotoNome}
                </div>
                <button type="button" onClick={() => setFotoNome(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Button 
                type="button" 
                variant="outline" 
                className="w-full h-12 border-dashed border-2 bg-transparent text-slate-500 hover:bg-slate-50"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="w-5 h-5 mr-2" />
                Anexar foto
              </Button>
            )}
          </div>

          <Button 
            type="submit" 
            className="w-full h-14 text-lg font-bold bg-flame-gradient hover:opacity-90 shadow-md text-white border-0 mt-2"
            disabled={!descricao.trim() || descricao.length < 5}
          >
            {isOnline ? 'Enviar Denúncia' : 'Salvar denúncia offline'}
          </Button>
        </form>
      </div>
    </div>
  );
}

function RadioCard({ selected, onClick, icon, label }: { selected: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <div 
      className={cn(
        "cursor-pointer rounded-xl border-2 p-3 flex flex-col items-center justify-center text-center h-28 transition-colors",
        selected ? "border-primary bg-primary/5 text-primary" : "border-slate-100 bg-white text-slate-500 hover:border-slate-200"
      )}
      onClick={onClick}
    >
      {icon}
      <span className={cn("text-xs font-bold leading-tight", selected && "text-primary")}>{label}</span>
    </div>
  );
}