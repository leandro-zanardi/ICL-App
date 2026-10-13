import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { criarDenuncia, type DenunciaInput, type DenunciaResposta } from '@workspace/api-client-react';

const STORAGE_KEY = 'cl_denuncias_local';
const LEGACY_KEY = 'cl_denuncia_queue';
const RETRY_INTERVAL_MS = 20_000;
const MAX_KEPT = 50;

export type LocalDenuncia = {
  id: string; // também usado como client_id no servidor
  data: DenunciaInput;
  createdAt: string;
  provisionalProtocol: string;
  status: 'pending' | 'sending' | 'sent';
  error?: string;
  serverId?: string;
  protocolo?: string;
};

type SendResult =
  | { status: 'sent'; id: string; response: DenunciaResposta }
  | { status: 'queued'; id: string };

type DenunciaQueueContextValue = {
  isOnline: boolean;
  items: LocalDenuncia[];
  sendDenuncia: (data: DenunciaInput) => Promise<SendResult>;
  retryNow: () => void;
  /** Incrementa a cada envio concluído, para recarregar a lista do servidor. */
  sentVersion: number;
};

const DenunciaQueueContext = createContext<DenunciaQueueContextValue | undefined>(undefined);

function provisional(id: string): string {
  return `PROV-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function readItems(): LocalDenuncia[] {
  try {
    const parse = (key: string) => {
      const value = JSON.parse(localStorage.getItem(key) ?? '[]');
      return Array.isArray(value) ? value : [];
    };
    const current = parse(STORAGE_KEY).filter((i) => i && typeof i.id === 'string' && i.data);
    const known = new Set(current.map((i) => i.id));
    // Denúncias da fila antiga ainda não enviadas continuam valendo.
    const legacy = parse(LEGACY_KEY)
      .filter((i) => i && typeof i.id === 'string' && i.data && !known.has(i.id))
      .map((i) => ({
        id: i.id,
        data: i.data,
        createdAt: i.createdAt ?? new Date().toISOString(),
        provisionalProtocol: provisional(i.id),
        status: 'pending' as const,
      }));
    return [...current, ...legacy].map((i) => ({
      ...i,
      status: i.status === 'sent' ? 'sent' : 'pending',
    }));
  } catch {
    return [];
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Servidor indisponível no momento.';
}

export function DenunciaQueueProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<LocalDenuncia[]>(readItems);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [sentVersion, setSentVersion] = useState(0);
  const itemsRef = useRef(items);
  const flushPromise = useRef<Promise<void> | null>(null);

  const update = useCallback((next: LocalDenuncia[]) => {
    const sent = next.filter((i) => i.status === 'sent').slice(-MAX_KEPT);
    const trimmed = next.filter((i) => i.status !== 'sent' || sent.includes(i));
    itemsRef.current = trimmed;
    setItems(trimmed);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    localStorage.removeItem(LEGACY_KEY);
  }, []);

  const patch = useCallback(
    (id: string, changes: Partial<LocalDenuncia>) => {
      update(itemsRef.current.map((i) => (i.id === id ? { ...i, ...changes } : i)));
    },
    [update],
  );

  const flush = useCallback((): Promise<void> => {
    if (flushPromise.current) return flushPromise.current;
    // Começa em microtarefa: flushPromise precisa estar atribuída antes de o finally limpar.
    const run = Promise.resolve().then(async () => {
      try {
        for (const snapshot of [...itemsRef.current]) {
          const current = itemsRef.current.find((i) => i.id === snapshot.id);
          if (!current || current.status !== 'pending') continue;
          patch(current.id, { status: 'sending' });
          try {
            const response = await criarDenuncia({ ...current.data, client_id: current.id });
            patch(current.id, {
              status: 'sent',
              error: undefined,
              serverId: response.id,
              protocolo: response.protocolo,
            });
            setSentVersion((v) => v + 1);
          } catch (error) {
            // Nunca vira um erro sem saída: volta para a fila e tenta de novo depois.
            patch(current.id, { status: 'pending', error: errorMessage(error) });
          }
        }
      } finally {
        flushPromise.current = null;
      }
    });
    flushPromise.current = run;
    return run;
  }, [patch]);

  const sendDenuncia = useCallback(
    async (data: DenunciaInput): Promise<SendResult> => {
      const id = crypto.randomUUID();
      update([
        ...itemsRef.current,
        { id, data, createdAt: new Date().toISOString(), provisionalProtocol: provisional(id), status: 'pending' },
      ]);
      await flush();
      const item = itemsRef.current.find((i) => i.id === id);
      if (item?.status === 'sent' && item.serverId && item.protocolo) {
        return {
          status: 'sent',
          id,
          response: { id: item.serverId, protocolo: item.protocolo, criado_em: item.createdAt },
        };
      }
      return { status: 'queued', id };
    },
    [flush, update],
  );

  const retryNow = useCallback(() => {
    void flush();
  }, [flush]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void flush();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    void flush();
    // Reenvio periódico: cobre o caso de a rede estar ok e o servidor ter voltado depois.
    const timer = window.setInterval(() => {
      if (itemsRef.current.some((i) => i.status === 'pending')) void flush();
    }, RETRY_INTERVAL_MS);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.clearInterval(timer);
    };
  }, [flush]);

  return (
    <DenunciaQueueContext.Provider value={{ isOnline, items, sendDenuncia, retryNow, sentVersion }}>
      {children}
    </DenunciaQueueContext.Provider>
  );
}

export function useDenunciaQueue() {
  const context = useContext(DenunciaQueueContext);
  if (!context) throw new Error('useDenunciaQueue must be used within a DenunciaQueueProvider');
  return context;
}
