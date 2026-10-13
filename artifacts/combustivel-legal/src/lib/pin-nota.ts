import L from 'leaflet';

export const coresNota = {
  0: { cor: '#DC2626', rotulo: 'Nota 0' },
  1: { cor: '#FACC15', rotulo: 'Nota 1' },
  2: { cor: '#F97316', rotulo: 'Nota 2' },
  3: { cor: '#A78BFA', rotulo: 'Nota 3' },
  4: { cor: '#86EFAC', rotulo: 'Nota 4' },
  5: { cor: '#15803D', rotulo: 'Nota 5' },
} as const;

const iconesPorNota = new Map<string, L.DivIcon>();

export function criarIconePosto(nota: number | null | undefined): L.DivIcon {
  const configuracao = typeof nota === 'number' && nota in coresNota
    ? coresNota[nota as keyof typeof coresNota]
    : { cor: '#64748B', rotulo: 'Nota ANP indisponível' };
  const chave = `${nota ?? 'sem-nota'}-${configuracao.cor}`;
  const existente = iconesPorNota.get(chave);
  if (existente) return existente;

  const simbolo = typeof nota === 'number' && nota in coresNota ? nota : '?';
  const html = `<svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${configuracao.rotulo}">
    <path d="M16 1C7.716 1 1 7.716 1 16C1 26.125 16 41 16 41C16 41 31 26.125 31 16C31 7.716 24.284 1 16 1Z" fill="${configuracao.cor}" stroke="white" stroke-width="2"/>
    <circle cx="16" cy="16" r="8.5" fill="white"/>
    <text x="16" y="20" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#0F172A">${simbolo}</text>
  </svg>`;
  const icone = L.divIcon({ html, className: '', iconSize: [32, 42], iconAnchor: [16, 42] });
  iconesPorNota.set(chave, icone);
  return icone;
}
