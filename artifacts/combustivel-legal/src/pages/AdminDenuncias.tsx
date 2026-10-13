import { useState } from 'react';
import { useRegistrarAndamentoDenuncia, type DenunciaStatus } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';

const STATUS_OPTIONS: { value: DenunciaStatus; label: string }[] = [
  { value: 'recebida', label: 'Recebida pelo ICL' },
  { value: 'encaminhada', label: 'Encaminhada à ANP/órgão' },
  { value: 'respondida', label: 'Respondida / concluída' },
];

export default function AdminDenunciasPage() {
  const [token, setToken] = useState('');
  const registrar = useRegistrarAndamentoDenuncia({ request: { headers: { 'x-admin-token': token } } });
  const [protocolo, setProtocolo] = useState('');
  const [status, setStatus] = useState<DenunciaStatus>('encaminhada');
  const [orgao, setOrgao] = useState('ANP');
  const [mensagem, setMensagem] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    registrar.mutate(
      { protocolo: protocolo.trim(), data: { status, orgao: orgao.trim() || null, mensagem: mensagem.trim() } },
      {
        onSuccess: () => {
          toast({ title: 'Andamento registrado' });
          setMensagem('');
        },
        onError: (error) => toast({ title: 'Não foi possível registrar', description: error.message, variant: 'destructive' }),
      },
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-4 pb-24">
      <h1 className="text-xl font-bold font-display text-slate-800 mb-4">Andamento das denúncias</h1>
      <form onSubmit={submit} className="space-y-4 max-w-md">
        <div className="space-y-1">
          <Label htmlFor="adm-token">Token administrativo</Label>
          <Input id="adm-token" type="password" value={token} onChange={(e) => setToken(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="adm-protocolo">Protocolo</Label>
          <Input id="adm-protocolo" value={protocolo} onChange={(e) => setProtocolo(e.target.value)} placeholder="ICL-2026-000001" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="adm-status">Status</Label>
          <select id="adm-status" className="w-full h-10 rounded-md border bg-white px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value as DenunciaStatus)}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="adm-orgao">Órgão</Label>
          <Input id="adm-orgao" value={orgao} onChange={(e) => setOrgao(e.target.value)} placeholder="ICL, ANP, Procon…" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="adm-msg">Retorno / resposta</Label>
          <Textarea id="adm-msg" value={mensagem} onChange={(e) => setMensagem(e.target.value)} required />
        </div>
        <Button type="submit" className="w-full" disabled={registrar.isPending || !token || !protocolo || !mensagem.trim()}>
          Registrar andamento
        </Button>
      </form>
    </div>
  );
}
