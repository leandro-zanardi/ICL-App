import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { criarDenuncia, type DenunciaInput, type DenunciaResposta } from '@workspace/api-client-react';

const STORAGE_KEY = 'cl_denuncia_queue';

export type DenunciaQueueItem = {
  id: string;
  data: DenunciaInput;
  createdAt: string;
  status: 'pending' | 'sending' | 'error';
  error?: string;
};

type SentDenuncia = { id: string; response: DenunciaResposta };
type SendResult =
  | { status: 'sent'; response: DenunciaResposta }
  | { status: 'queued'; id: string };

type DenunciaQueueContextValue = {
  isOnline: boolean;
  queue: DenunciaQueueItem[];
  sendDenuncia: (data: DenunciaInput) => Promise<SendResult>;
  retryDenuncia: (id: string) => void;
  lastSent: SentDenuncia | null;
};

const DenunciaQueueContext = createContext<DenunciaQueueContextValue | undefined>(undefined);

function readQueue(): DenunciaQueueItem[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(saved)) return [];
    return saved
      .filter((item): item is DenunciaQueueItem => item && typeof item.id === 'string' && item.data)
      .map((item) => ({ ...item, status: item.status === 'error' ? 'error' : 'pending' }));
  } catch {
    return [];
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error && 'message' in error) return String(error.message);
  return 'Não foi possível enviar agora. Tentaremos novamente quando a conexão voltar.';
}

export function DenunciaQueueProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<DenunciaQueueItem[]>(readQueue);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [lastSent, setLastSent] = useState<SentDenuncia | null>(null);
  const queueRef = useRef(queue);
  const flushing = useRef(false);
  const sentResponses = useRef(new Map<string, DenunciaResposta>());

  const updateQueue = useCallback((next: DenunciaQueueItem[]) => {
    queueRef.current = next;
    setQueue(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const flush = useCallback(async () => {
    if (!navigator.onLine || flushing.current) return;
    flushing.current = true;
    try {
      for (const item of [...queueRef.current]) {
        if (!navigator.onLine) break;
        const current = queueRef.current.find((entry) => entry.id === item.id);
        if (!current) continue;
        updateQueue(queueRef.current.map((entry) => entry.id === item.id ? { ...entry, status: 'sending', error: undefined } : entry));
        try {
          const response = await criarDenuncia(item.data);
          sentResponses.current.set(item.id, response);
          updateQueue(queueRef.current.filter((entry) => entry.id !== item.id));
          setLastSent({ id: item.id, response });
        } catch (error) {
          updateQueue(queueRef.current.map((entry) => entry.id === item.id ? {
            ...entry,
            status: 'error',
            error: errorMessage(error),
          } : entry));
        }
      }
    } finally {
      flushing.current = false;
      // A new item may have been added while another item was in flight.
      // Schedule one more pass without immediately retrying persistent errors.
      if (navigator.onLine && queueRef.current.some((entry) => entry.status === 'pending')) {
        setTimeout(() => void flush(), 0);
      }
    }
  }, [updateQueue]);

  const sendDenuncia = useCallback(async (data: DenunciaInput): Promise<SendResult> => {
    const item: DenunciaQueueItem = {
      id: crypto.randomUUID(),
      data,
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    updateQueue([...queueRef.current, item]);
    if (!navigator.onLine) return { status: 'queued', id: item.id };

    await flush();
    const stillQueued = queueRef.current.find((entry) => entry.id === item.id);
    if (stillQueued) return { status: 'queued', id: item.id };
    const response = sentResponses.current.get(item.id);
    if (response) {
      sentResponses.current.delete(item.id);
      return { status: 'sent', response };
    }
    return { status: 'queued', id: item.id };
  }, [flush, updateQueue]);

  const retryDenuncia = useCallback((id: string) => {
    const item = queueRef.current.find((entry) => entry.id === id);
    if (!item) return;
    updateQueue(queueRef.current.map((entry) => entry.id === id ? { ...entry, status: 'pending', error: undefined } : entry));
    void flush();
  }, [flush, updateQueue]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void flush();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    void flush();
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [flush]);

  return (
    <DenunciaQueueContext.Provider value={{ isOnline, queue, sendDenuncia, retryDenuncia, lastSent }}>
      {children}
    </DenunciaQueueContext.Provider>
  );
}

export function useDenunciaQueue() {
  const context = useContext(DenunciaQueueContext);
  if (!context) throw new Error('useDenunciaQueue must be used within a DenunciaQueueProvider');
  return context;
}