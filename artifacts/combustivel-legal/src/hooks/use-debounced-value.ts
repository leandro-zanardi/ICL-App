import { useEffect, useState } from 'react';

/**
 * Atrasa consultas dependentes de digitação para que apenas a intenção final
 * do usuário alcance a API. Ao trocar a chave da query, o React Query cancela
 * a requisição anterior por meio do AbortSignal já passado ao cliente gerado.
 */
export function useDebouncedValue<T>(value: T, delayMs = 400): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}