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

export function criarIconePosto(nota: number | null | undefined, verificado = false): L.DivIcon {
  const temNota = typeof nota === 'number' && nota in coresNota;
  const cor = temNota ? coresNota[nota as keyof typeof coresNota].cor : '#64748B';
  const rotuloNota = temNota ? `Nota ${nota}` : 'Sem nota';
  const rotulo = `${rotuloNota}${verificado ? ', verificado' : ''}`;
  const chave = `${temNota ? nota : 'sem-nota'}-${verificado ? 'v' : 'n'}`;
  const existente = iconesPorNota.get(chave);
  if (existente) return existente;

  const simbolo = temNota ? String(nota) : '–';
  const selo = verificado
    ? `<circle cx="26" cy="7" r="7" fill="#16A34A" stroke="white" stroke-width="2"/>
    <path d="M22.8 7.2L25 9.4L29.2 5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
    : '';
  const html = `<svg width="36" height="42" viewBox="0 0 36 42" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${rotulo}">
    <g transform="translate(2 0)"><path d="M16 1C7.716 1 1 7.716 1 16C1 26.125 16 41 16 41C16 41 31 26.125 31 16C31 7.716 24.284 1 16 1Z" fill="${cor}" stroke="white" stroke-width="2"/>
    <circle cx="16" cy="16" r="8.5" fill="white"/>
    <text x="16" y="20" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#0F172A">${simbolo}</text></g>
    ${selo}
  </svg>`;
  const icone = L.divIcon({ html, className: '', iconSize: [36, 42], iconAnchor: [18, 42] });
  iconesPorNota.set(chave, icone);
  return icone;
}
