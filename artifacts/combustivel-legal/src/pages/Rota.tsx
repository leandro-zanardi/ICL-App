import { useState } from 'react';
import { useLocationContext } from '@/contexts/LocationContext';
import { useBuscarEndereco, useCalcularRota, getBuscarEnderecoQueryKey } from '@workspace/api-client-react';
import { Header } from '@/components/Header';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { Search, MapPin, Route, Navigation, Award, Loader2, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PostoFicha } from '@/components/PostoFicha';

const seloIconHtml = `<svg width="24" height="32" viewBox="0 0 32 42" fill="none" xmlns="http://www.svg.org/2000/svg">
  <path d="M16 0C7.16344 0 0 7.16344 0 16C0 26.6667 16 42 16 42C16 42 32 26.6667 32 16C32 7.16344 24.8366 0 16 0Z" fill="#0E2A47"/>
  <circle cx="16" cy="16" r="10" fill="white"/>
  <path d="M16 8C11.5817 8 8 11.5817 8 16C8 20.4183 16 24 16 24C16 24 24 20.4183 24 16C24 11.5817 20.4183 8 16 8Z" fill="url(#pinGradRoute)"/>
  <defs>
    <linearGradient id="pinGradRoute" x1="8" y1="8" x2="24" y2="24" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFC20E"/>
      <stop offset="0.5" stop-color="#F58220"/>
      <stop offset="1" stop-color="#E63329"/>
    </linearGradient>
  </defs>
</svg>`;
const seloIcon = L.divIcon({ html: seloIconHtml, className: '', iconSize: [24, 32], iconAnchor: [12, 32] });

const regularIconHtml = `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.svg.org/2000/svg">
  <circle cx="10" cy="10" r="8" fill="white" stroke="#94A3B8" stroke-width="4"/>
</svg>`;
const regularIcon = L.divIcon({ html: regularIconHtml, className: '', iconSize: [16, 16], iconAnchor: [8, 8] });

export default function RotaPage() {
  const { activePosition } = useLocationContext();
  const [destinoQuery, setDestinoQuery] = useState('');
  const [destinoPos, setDestinoPos] = useState<{lat: number, lng: number, label: string} | null>(null);
  const [showDestinoDropdown, setShowDestinoDropdown] = useState(false);
  const [selectedPostoId, setSelectedPostoId] = useState<string | null>(null);

  const { data: addresses = [] } = useBuscarEndereco(
    { q: destinoQuery },
    { query: { enabled: destinoQuery.length >= 3, queryKey: getBuscarEnderecoQueryKey({ q: destinoQuery }) } }
  );

  const calcularRota = useCalcularRota();

  const handleCalculate = () => {
    if (!destinoPos) return;
    calcularRota.mutate({
      data: {
        origem: `${activePosition.lat},${activePosition.lng}`,
        destino: `${destinoPos.lat},${destinoPos.lng}`
      }
    });
  };

  const mapBounds = calcularRota.data?.polyline ? L.latLngBounds(calcularRota.data.polyline as [number, number][]) : null;

  return (
    <div className="h-full w-full flex flex-col bg-slate-50">
      <Header title="Planejar Rota" />
      
      <div className="bg-white px-4 py-4 shadow-sm z-10 flex-shrink-0">
        <div className="flex flex-col gap-3 relative">
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center justify-center gap-1 w-6 shrink-0">
              <div className="w-3 h-3 rounded-full border-2 border-primary"></div>
              <div className="w-0.5 h-6 bg-slate-200"></div>
              <MapPin className="w-4 h-4 text-orange-500" />
            </div>
            
            <div className="flex-1 flex flex-col gap-2 relative">
              <Input 
                value="Minha localização"
                readOnly
                className="h-10 bg-slate-50 border-slate-100 text-slate-500"
              />
              
              <div className="relative">
                <Input 
                  value={destinoQuery}
                  onChange={(e) => {
                    setDestinoQuery(e.target.value);
                    setShowDestinoDropdown(true);
                    setDestinoPos(null);
                  }}
                  onFocus={() => setShowDestinoDropdown(true)}
                  placeholder="Para onde você vai?"
                  className="h-10 border-slate-200"
                />
                {showDestinoDropdown && destinoQuery.length >= 3 && addresses.length > 0 && (
                  <div className="absolute top-12 inset-x-0 bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden z-[500]">
                    {addresses.map((addr, i) => (
                      <button
                        key={i}
                        className="w-full text-left px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 flex items-center gap-3"
                        onClick={() => {
                          setDestinoPos(addr);
                          setDestinoQuery(addr.label);
                          setShowDestinoDropdown(false);
                        }}
                      >
                        <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                        <span className="text-sm truncate text-slate-700">{addr.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <Button 
            className="w-full mt-2 font-bold bg-primary" 
            disabled={!destinoPos || calcularRota.isPending}
            onClick={handleCalculate}
          >
            {calcularRota.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Ver postos no caminho'}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col relative">
        {!calcularRota.data && !calcularRota.isPending && !calcularRota.isError && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
            <Route className="w-12 h-12 mb-4 opacity-20" />
            <p>Informe o destino para ver os postos verificados no seu trajeto.</p>
          </div>
        )}

        {calcularRota.isPending && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-primary">
            <Loader2 className="w-8 h-8 animate-spin mb-4" />
            <p className="text-sm font-medium">Analisando corredor viário...</p>
          </div>
        )}

        {calcularRota.isError && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-red-500">
            <AlertCircle className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-sm font-medium">Não foi possível calcular a rota. Tente novamente.</p>
          </div>
        )}

        {calcularRota.data && (
          <>
            <div className="h-1/2 w-full relative shrink-0">
              <MapContainer 
                bounds={mapBounds || undefined}
                zoomControl={false}
                className="w-full h-full"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Polyline positions={calcularRota.data.polyline as [number, number][]} color="#0E2A47" weight={4} opacity={0.8} />
                
                {calcularRota.data.postos.map((posto, i) => (
                  <Marker 
                    key={posto.id} 
                    position={[posto.lat, posto.lng]}
                    icon={posto.tier === 'selo' ? seloIcon : regularIcon}
                    zIndexOffset={posto.tier === 'selo' ? 500 - i : 100 - i}
                    eventHandlers={{ click: () => setSelectedPostoId(posto.id) }}
                  />
                ))}
              </MapContainer>
            </div>
            
            <div className="flex-1 bg-slate-50 overflow-y-auto no-scrollbar pb-24">
              <div className="p-4 flex items-center justify-between border-b border-slate-200/50 bg-white">
                <div>
                  <h3 className="font-bold text-slate-800">Postos no trajeto</h3>
                  <p className="text-xs text-slate-500">{calcularRota.data.distancia_km.toFixed(1)} km • {calcularRota.data.duracao_min.toFixed(0)} min</p>
                </div>
                <div className="bg-orange-50 text-orange-700 px-3 py-1 rounded-full text-xs font-bold border border-orange-100 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-flame-gradient"></span>
                  {calcularRota.data.postos.filter(p => p.tier === 'selo').length} verificados
                </div>
              </div>
              
              <div className="p-4 flex flex-col gap-3">
                {calcularRota.data.postos.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">
                    Nenhum posto verificado encontrado neste trajeto.
                  </div>
                ) : (
                  calcularRota.data.postos.map(posto => (
                    <div 
                      key={posto.id} 
                      className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex gap-4 items-center cursor-pointer hover:bg-slate-50 transition-colors"
                      onClick={() => setSelectedPostoId(posto.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-bold text-primary truncate">{posto.nome_fantasia}</h4>
                          {posto.tier === 'selo' && <Award className="w-4 h-4 text-orange-500 shrink-0" />}
                        </div>
                        <div className="text-sm text-slate-500 font-medium mb-1 truncate">{posto.bandeira}</div>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          {posto.tier === 'selo' ? (
                            <span className="text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Verificado</span>
                          ) : (
                            <span>Sem verificação</span>
                          )}
                          <span>•</span>
                          <span>a {posto.desvio_km.toFixed(1).replace('.', ',')} km do trajeto</span>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-300" />
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <PostoFicha 
        postoId={selectedPostoId} 
        isOpen={!!selectedPostoId} 
        onClose={() => setSelectedPostoId(null)} 
      />
    </div>
  );
}