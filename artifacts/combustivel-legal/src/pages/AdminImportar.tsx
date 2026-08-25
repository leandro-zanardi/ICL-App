import { useEffect, useState, useRef } from 'react';
import {
  useImportarCsvAnp,
  useIniciarSincronizacaoAnp,
  useListarSincronizacoesAnp,
  ImportacaoRelatorio,
  type SincronizacaoAnp,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { FileUp, Loader2, CheckCircle2, AlertTriangle, FileText, Database, RefreshCw, MapPinned } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export default function AdminImportarPage() {
  const importarCsv = useImportarCsvAnp();
  const iniciarSincronizacao = useIniciarSincronizacaoAnp();
  const sincronizacoes = useListarSincronizacoesAnp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [relatorio, setRelatorio] = useState<ImportacaoRelatorio | null>(null);

  useEffect(() => {
    const intervalo = window.setInterval(() => { void sincronizacoes.refetch(); }, 3000);
    return () => window.clearInterval(intervalo);
  }, [sincronizacoes.refetch]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setRelatorio(null);
    }
  };

  const handleImport = () => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const csv = e.target?.result as string;
      if (typeof csv === 'string') {
        importarCsv.mutate({ data: { csv } }, {
          onSuccess: (data) => {
            setRelatorio(data);
            toast({ title: 'Importação concluída' });
          },
          onError: (err: any) => {
            toast({ title: 'Falha na importação', description: err.message, variant: 'destructive' });
          }
        });
      }
    };
    reader.onerror = () => {
      toast({ title: 'Erro de leitura', description: 'Não foi possível ler o arquivo.', variant: 'destructive' });
    };
    reader.readAsText(file);
  };

  const handleSync = () => {
    iniciarSincronizacao.mutate(
      { data: { municipios: ['CAMPINAS - SP', 'SAO PAULO - SP'] } },
      {
        onSuccess: () => {
          toast({ title: 'Sincronização ANP iniciada', description: 'Os pinos são coletados antes dos detalhes de cada posto.' });
          void sincronizacoes.refetch();
        },
        onError: (err: Error) => {
          toast({ title: 'Não foi possível iniciar a sincronização', description: err.message, variant: 'destructive' });
        },
      },
    );
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 flex flex-col font-sans">
      <header className="bg-primary px-8 py-4 flex items-center justify-between shadow-md shrink-0">
        <div className="flex items-center gap-4 text-white">
          <Database className="w-6 h-6" />
          <h1 className="text-xl font-display font-bold">Admin: Importação de Dados</h1>
        </div>
      </header>

      <div className="flex-1 p-8 max-w-4xl mx-auto w-full">
        <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mb-8">
          <div className="p-6 md:p-8 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-4">
              <div className="h-11 w-11 shrink-0 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <MapPinned className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Sincronização direta ANP</h2>
                <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">
                  Atualiza Campinas e São Paulo em segundo plano. O coletor respeita uma página por segundo,
                  registra a fonte bruta e mantém os postos atuais caso a ANP esteja indisponível.
                </p>
              </div>
            </div>
            <Button onClick={handleSync} disabled={iniciarSincronizacao.isPending} className="shrink-0 font-bold">
              {iniciarSincronizacao.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              {iniciarSincronizacao.isPending ? 'Iniciando...' : 'Sincronizar agora'}
            </Button>
          </div>

          <div className="border-t border-slate-100 bg-slate-50/70 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-700">Execuções recentes</h3>
              {sincronizacoes.isFetching && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
            </div>
            {sincronizacoes.isLoading ? (
              <p className="text-sm text-slate-500">Carregando histórico…</p>
            ) : sincronizacoes.data?.length ? (
              <div className="space-y-3">
                {sincronizacoes.data.map((execucao) => <ExecucaoAnpCard key={execucao.id} execucao={execucao} />)}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Nenhuma sincronização foi iniciada ainda.</p>
            )}
          </div>
        </section>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mb-8">
          <div className="p-8 md:p-12 text-center flex flex-col items-center">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6 text-primary">
              <FileUp className="w-10 h-10" />
            </div>
             <h2 className="text-2xl font-bold font-display text-primary mb-2">Importar base ANP (CSV ou JSON)</h2>
            <p className="text-slate-500 mb-8 max-w-md mx-auto">
               Selecione o arquivo CSV ou JSON baixado do painel oficial para atualizar os registros de postos verificados.
              <br/>
              <span className="text-xs font-semibold bg-slate-100 px-2 py-1 rounded mt-2 inline-block">Fonte oficial: anpcomvcpostos.anp.gov.br</span>
            </p>

            <input 
              type="file" 
               accept=".csv,.json"
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileChange}
            />

            {!file ? (
              <Button size="lg" className="h-14 px-8 text-lg font-bold" onClick={() => fileInputRef.current?.click()}>
                 Selecionar Arquivo CSV ou JSON
              </Button>
            ) : (
              <div className="w-full max-w-md space-y-4">
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <FileText className="w-6 h-6 text-primary shrink-0" />
                    <div className="truncate text-sm font-medium text-slate-700">{file.name}</div>
                  </div>
                  <div className="text-xs text-slate-400 shrink-0 ml-4">
                    {(file.size / 1024).toFixed(0)} KB
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button 
                    variant="outline" 
                    className="flex-1 h-12"
                    onClick={() => { setFile(null); setRelatorio(null); }}
                    disabled={importarCsv.isPending}
                  >
                    Trocar
                  </Button>
                  <Button 
                    className="flex-[2] h-12 bg-primary hover:bg-primary/90 font-bold"
                    onClick={handleImport}
                    disabled={importarCsv.isPending}
                  >
                    {importarCsv.isPending ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <FileUp className="w-5 h-5 mr-2" />}
                    {importarCsv.isPending ? 'Processando...' : 'Processar Importação'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {relatorio && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4">
            <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-500" />
              <h3 className="font-bold text-slate-800 text-lg">Relatório de Importação</h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <StatBox label="Linhas Lidas" value={relatorio.linhas_lidas} />
                <StatBox label="Importados" value={relatorio.importadas} color="text-green-600" />
                <StatBox label="Atualizados" value={relatorio.atualizadas} color="text-blue-600" />
                <StatBox label="Fora da região-piloto" value={relatorio.descartadas} color="text-orange-600" />
              </div>

              <div className="bg-slate-50 p-4 rounded-xl mb-6 flex justify-between items-center border border-slate-200">
                <div className="font-bold text-slate-700">Total no banco após importação:</div>
                <div className="flex gap-4">
                  <div className="text-sm"><span className="font-bold text-primary">{relatorio.postos_total}</span> postos</div>
                  <div className="text-sm"><span className="font-bold text-orange-600">{relatorio.postos_selo}</span> com selo</div>
                </div>
              </div>

              {relatorio.erros.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500" /> Alertas ({relatorio.erros.length})
                  </h4>
                  <div className="bg-red-50 text-red-800 p-4 rounded-xl text-sm space-y-1 max-h-48 overflow-y-auto font-mono">
                    {relatorio.erros.map((err: string, i: number) => (
                      <div key={i}>• {err}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ExecucaoAnpCard({ execucao }: { execucao: SincronizacaoAnp }) {
  const concluida = execucao.status === 'completed' || execucao.status === 'partial' || execucao.status === 'failed';
  const cor = execucao.status === 'completed'
    ? 'bg-emerald-100 text-emerald-800'
    : execucao.status === 'failed'
      ? 'bg-red-100 text-red-800'
      : execucao.status === 'partial'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-blue-100 text-blue-800';
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-800">{execucao.municipios.join(' e ')}</p>
          <p className="mt-1 text-xs text-slate-500">
            {new Date(execucao.criado_em).toLocaleString('pt-BR')}
            {concluida && execucao.concluido_em ? ` · encerrada ${new Date(execucao.concluido_em).toLocaleTimeString('pt-BR')}` : ''}
          </p>
        </div>
        <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide', cor)}>
          {execucao.status === 'queued' ? 'na fila' : execucao.status === 'running' ? 'em andamento' : execucao.status}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <SyncStat label="Pinos" value={execucao.postos_lidos} />
        <SyncStat label="Atualizados" value={execucao.postos_atualizados} />
        <SyncStat label="Páginas" value={execucao.paginas_coletadas} />
        <SyncStat label="Divergências" value={execucao.divergencias_nota} />
      </div>
      {execucao.erros.length > 0 && (
        <details className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
          <summary className="cursor-pointer font-semibold">{execucao.erros.length} alerta(s) registrado(s)</summary>
          <ul className="mt-2 space-y-1 font-mono">
            {execucao.erros.slice(0, 12).map((erro, index) => <li key={`${execucao.id}-${index}`}>• {erro}</li>)}
          </ul>
        </details>
      )}
    </article>
  );
}

function SyncStat({ label, value }: { label: string, value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-2 text-center">
      <div className="text-lg font-black text-slate-800">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function StatBox({ label, value, color = "text-primary" }: { label: string, value: number, color?: string }) {
  return (
    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col items-center justify-center text-center">
      <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">{label}</div>
      <div className={cn("text-3xl font-black font-display", color)}>{value}</div>
    </div>
  );
}