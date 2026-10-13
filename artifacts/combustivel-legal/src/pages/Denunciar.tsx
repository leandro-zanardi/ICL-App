import { useState, useRef } from 'react';
import { MinhasDenuncias } from '@/components/MinhasDenuncias';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useListarPostos, DenunciaInputCategoria, getListarPostosQueryKey } from '@workspace/api-client-react';
import { useLocationContext } from '@/contexts/LocationContext';
import { useDenunciaQueue } from '@/contexts/DenunciaQueueContext';
import { AlertTriangle, Droplet, Hash, Copy, CheckCircle2, MapPin, Camera, X, WifiOff, Clock3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

export default function DenunciarPage() {
  const { activePosition } = useLocationContext();
  const { isOnline, items, sendDenuncia } = useDenunciaQueue();

  const [step, setStep] = useState<'form' | 'done'>('form');
  const [doneId, setDoneId] = useState<string | null>(null);

  const [categoria, setCategoria] = useState<DenunciaInputCategoria>('qualidade_combustivel');
  const [descricao, setDescricao] = useState('');
  const [postoSearch, setPostoSearch] = useState('');
  const [selectedPostoId, setSelectedPostoId] = useState<string | null>(null);
  const [fotoNome, setFotoNome] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (descricao.length < 5 || submitting) {
      if (descricao.length < 5) {
        toast({ title: 'Descrição muito curta', description: 'Por favor, detalhe melhor o ocorrido.', variant: 'destructive' });
      }
      return;
    }
    setSubmitting(true);
    try {
      const result = await sendDenuncia({
        categoria,
        descricao,
        posto_id: selectedPostoId,
        foto_nome: fotoNome,
      });
      setDoneId(result.id);
      setStep('done');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setStep('form');
    setDoneId(null);
    setDescricao('');
    setFotoNome(null);
    setSelectedPostoId(null);
    setPostoSearch('');
  };

  const done = doneId ? items.find((item) => item.id === doneId) : undefined;

  if (step === 'done' && done) {
    const received = done.status === 'sent' && !!done.protocolo;
    const protocolo = received ? done.protocolo! : done.provisionalProtocol;
    const copyProtocol = () => {
      void navigator.clipboard?.writeText(protocolo);
      toast({ title: 'Protocolo copiado' });
    };
    return (
      <div className="h-full w-full flex flex-col bg-slate-50">
        <Header title="Denunciar" />
        <div className="flex-1 overflow-y-auto pb-24">
          <div className="flex flex-col items-center p-8 text-center">
            <div className={cn('w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-sm', received ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600')}>
              {received ? <CheckCircle2 className="w-10 h-10" /> : <Clock3 className="w-10 h-10" />}
            </div>
            <h2 className="text-2xl font-bold font-display text-slate-800 mb-2">
              {received ? 'Denúncia registrada' : 'Denúncia guardada no aparelho'}
            </h2>
            <p className="text-slate-600 mb-6">
              {received
                ? 'O ICL encaminha as informações aos órgãos competentes. Acompanhe o andamento em "Minhas denúncias".'
                : 'Ainda não foi recebida pelo ICL. Vamos reenviar automaticamente quando a conexão ou o servidor voltarem, e o protocolo oficial aparecerá em "Minhas denúncias".'}
            </p>
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm w-full max-w-sm mb-4">
              <div className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-2">
                {received ? 'Seu protocolo' : 'Protocolo provisório'}
              </div>
              <div className="text-2xl font-mono font-bold text-primary flex items-center justify-center gap-3">
                {protocolo}
                <button onClick={copyProtocol} aria-label="Copiar protocolo" className="text-slate-400 hover:text-primary transition-colors">
                  <Copy className="w-5 h-5" />
                </button>
              </div>
              {!received && (
                <div className="mt-3 flex items-start gap-2 text-left text-xs text-amber-800">
                  {isOnline ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <WifiOff className="w-4 h-4 shrink-0" />}
                  {isOnline ? 'Nosso sistema está instável. Continuamos tentando.' : 'Sem conexão. A denúncia está salva neste aparelho.'}
                </div>
              )}
            </div>
            <Button variant="outline" className="w-full max-w-sm" onClick={resetForm}>
              Fazer nova denúncia
            </Button>
          </div>
          <MinhasDenuncias />
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
            Sua denúncia é anônima e nos ajuda a manter um mercado mais justo e seguro.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-4 flex flex-col gap-6">
          <div className="space-y-3">
            <Label className="text-base font-bold text-slate-800">O que aconteceu?</Label>
            <div className="grid grid-cols-2 gap-3">
              <RadioCard 
                selected={categoria === 'qualidade_combustivel'} 
                onClick={() => setCategoria('qualidade_combustivel')}
                icon={<Droplet className="w-6 h-6 mb-2 text-primary" />}
                label="Qualidade do Combustível"
              />
              <RadioCard 
                selected={categoria === 'volume_bomba'} 
                onClick={() => setCategoria('volume_bomba')}
                icon={<Hash className="w-6 h-6 mb-2 text-amber-500" />}
                label="Volume da Bomba"
              />
              <RadioCard 
                selected={categoria === 'posto_clone'} 
                onClick={() => setCategoria('posto_clone')}
                icon={<Copy className="w-6 h-6 mb-2 text-primary" />}
                label="Suspeita de Posto Clone"
              />
              <RadioCard 
                selected={categoria === 'outra'} 
                onClick={() => setCategoria('outra')}
                icon={<AlertTriangle className="w-6 h-6 mb-2 text-amber-500" />}
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

        <div className="mt-8">
          <MinhasDenuncias />
        </div>
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