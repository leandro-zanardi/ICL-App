import { useEffect, useMemo, useState } from 'react';
import { useListarMinhasDenuncias, type DenunciaAcompanhamento } from '@workspace/api-client-react';
import { ChevronDown, Clock3, CheckCircle2, Send, MessageSquareReply, MapPin } from 'lucide-react';
import { useDenunciaQueue } from '@/contexts/DenunciaQueueContext';
import { cn } from '@/lib/utils';

export const CATEGORIA_LABEL: Record<string, string> = {
  qualidade_combustivel: 'Qualidade do combustível',
  volume_bomba: 'Volume da bomba',
  posto_clone: 'Suspeita de posto clone',
  outra: 'Outra irregularidade',
};

type Status = 'aguardando' | 'recebida' | 'encaminhada' | 'respondida';

const STATUS_INFO: Record<Status, { label: string; className: string; icon: typeof Clock3 }> = {
  aguardando: { label: 'Aguardando envio', className: 'bg-amber-100 text-amber-800', icon: Clock3 },
  recebida: { label: 'Recebida pelo ICL', className: 'bg-blue-100 text-blue-800', icon: CheckCircle2 },
  encaminhada: { label: 'Encaminhada à ANP/órgão', className: 'bg-indigo-100 text-indigo-800', icon: Send },
  respondida: { label: 'Respondida / concluída', className: 'bg-green-100 text-green-800', icon: MessageSquareReply },
};

type Entry = {
  key: string;
  protocolo: string;
  provisional: boolean;
  categoria: string;
  postoNome: string | null;
  descricao: string;
  criadoEm: string;
  status: Status;
  error?: string;
  andamentos: DenunciaAcompanhamento['andamentos'];
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function MinhasDenuncias() {
  const { items, sentVersion, retryNow } = useDenunciaQueue();
  const { data: remote = [], refetch, isError } = useListarMinhasDenuncias({
    query: { refetchInterval: 30_000, refetchOnWindowFocus: true } as never,
  });
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    void refetch();
  }, [sentVersion, refetch]);

  const entries = useMemo<Entry[]>(() => {
    const remoteIds = new Set(remote.map((r) => r.id));
    const remoteClientIds = new Set(remote.map((r) => r.client_id).filter(Boolean));
    const fromRemote: Entry[] = remote.map((r) => ({
      key: r.id,
      protocolo: r.protocolo,
      provisional: false,
      categoria: r.categoria,
      postoNome: r.posto_nome ?? null,
      descricao: r.descricao,
      criadoEm: r.criado_em,
      status: r.status,
      andamentos: r.andamentos,
    }));
    const fromLocal: Entry[] = items
      .filter((i) => !(i.serverId && remoteIds.has(i.serverId)) && !remoteClientIds.has(i.id))
      .map((i) => ({
        key: i.id,
        protocolo: i.status === 'sent' && i.protocolo ? i.protocolo : i.provisionalProtocol,
        provisional: i.status !== 'sent',
        categoria: i.data.categoria,
        postoNome: null,
        descricao: i.data.descricao,
        criadoEm: i.createdAt,
        status: i.status === 'sent' ? 'recebida' : 'aguardando',
        error: i.error,
        andamentos: [],
      }));
    return [...fromLocal, ...fromRemote].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  }, [items, remote]);

  if (entries.length === 0) return null;
  const pendentes = entries.filter((e) => e.status === 'aguardando').length;

  return (
    <section className="mx-4 mb-6" aria-label="Minhas denúncias">
      <h3 className="text-base font-bold text-slate-800 mb-2">Minhas denúncias</h3>
      {pendentes > 0 && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          {pendentes === 1 ? '1 denúncia ainda não foi recebida' : `${pendentes} denúncias ainda não foram recebidas`}. Elas
          ficam guardadas neste aparelho e são reenviadas automaticamente.{' '}
          <button type="button" className="font-bold underline" onClick={retryNow}>
            Enviar agora
          </button>
        </div>
      )}
      {isError && <p className="mb-2 text-xs text-slate-500">Não foi possível atualizar o andamento agora.</p>}
      <div className="space-y-2">
        {entries.map((e) => {
          const info = STATUS_INFO[e.status];
          const Icon = info.icon;
          const expanded = open === e.key;
          return (
            <div key={e.key} className="rounded-xl border border-slate-100 bg-white shadow-sm">
              <button
                type="button"
                className="w-full p-3 text-left"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : e.key)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold', info.className)}>
                    <Icon className="w-3 h-3" />
                    {info.label}
                  </span>
                  <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform', expanded && 'rotate-180')} />
                </div>
                <div className="mt-2 text-sm font-bold text-slate-800">{CATEGORIA_LABEL[e.categoria] ?? e.categoria}</div>
                <div className="text-xs text-slate-500">{fmt(e.criadoEm)}</div>
                {e.postoNome && (
                  <div className="mt-1 flex items-center gap-1 text-xs text-slate-600 truncate">
                    <MapPin className="w-3 h-3" />
                    {e.postoNome}
                  </div>
                )}
                <div className="mt-1 text-xs font-mono text-slate-600">
                  {e.protocolo}
                  {e.provisional && <span className="font-sans text-amber-700"> · provisório, ainda não recebida</span>}
                </div>
              </button>
              {expanded && (
                <div className="border-t border-slate-100 p-3 text-xs">
                  <p className="text-slate-600 mb-3">{e.descricao}</p>
                  <ol className="space-y-3 border-l-2 border-slate-200 pl-3">
                    <li>
                      <div className="font-bold text-slate-700">Denúncia criada</div>
                      <div className="text-slate-500">{fmt(e.criadoEm)}</div>
                    </li>
                    {e.status === 'aguardando' && (
                      <li>
                        <div className="font-bold text-amber-700">Aguardando envio ao ICL</div>
                        <div className="text-slate-500">{e.error ?? 'Será enviada assim que possível.'}</div>
                      </li>
                    )}
                    {e.andamentos.map((a) => (
                      <li key={a.id}>
                        <div className="font-bold text-slate-700">
                          {STATUS_INFO[a.status].label}
                          {a.orgao ? ` · ${a.orgao}` : ''}
                        </div>
                        <div className="text-slate-500">{fmt(a.criado_em)}</div>
                        <div className="mt-0.5 text-slate-700">{a.mensagem}</div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
