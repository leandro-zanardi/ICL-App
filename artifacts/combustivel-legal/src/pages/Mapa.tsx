import { useState, useEffect, useRef, useMemo } from 'react';
import { useLocationContext } from '@/contexts/LocationContext';
import { useListarPostos, useBuscarEndereco, getBuscarEnderecoQueryKey, getListarPostosQueryKey } from '@workspace/api-client-react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { PostoFicha } from '@/components/PostoFicha';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, MapPin, CheckCircle2, ShieldCheck, ChevronRight, SlidersHorizontal, Navigation2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useRequireAuth } from '@/contexts/RequireAuthContext';

// --- Custom Icons ---
const userIconHtml = `<div style="width: 24px; height: 24px; background: rgba(14,42,71,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center;"><div style="width: 12px; height: 12px; background: #0E2A47; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 4px rgba(0,0,0,0.3);"></div></div>`;
const userIcon = L.divIcon({ html: userIconHtml, className: '', iconSize: [24, 24], iconAnchor: [12, 12] });

const seloIconHtml = `<svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.svg.org/2000/svg">
  <path d="M16 0C7.16344 0 0 7.16344 0 16C0 26.6667 16 42 16 42C16 42 32 26.6667 32 16C32 7.16344 24.8366 0 16 0Z" fill="#0E2A47"/>
  <circle cx="16" cy="16" r="10" fill="white"/>
  <path d="M16 8C11.5817 8 8 11.5817 8 16C8 20.4183 16 24 16 24C16 24 24 20.4183 24 16C24 11.5817 20.4183 8 16 8Z" fill="url(#pinGrad)"/>
  <defs>
    <linearGradient id="pinGrad" x1="8" y1="8" x2="24" y2="24" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFC20E"/>
      <stop offset="0.5" stop-color="#F58220"/>
      <stop offset="1" stop-color="#E63329"/>
    </linearGradient>
  </defs>
</svg>`;
const seloIcon = L.divIcon({ html: seloIconHtml, className: '', iconSize: [32, 42], iconAnchor: [16, 42] });

const regularIconHtml = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.svg.org/2000/svg">
  <circle cx="10" cy="10" r="8" fill="white" stroke="#94A3B8" stroke-width="4"/>
</svg>`;
const regularIcon = L.divIcon({ html: regularIconHtml, className: '', iconSize: [20, 20], iconAnchor: [10, 10] });

// --- Helper Components ---
function MapUpdater({ center, onPan }: { center: { lat: number, lng: number }, onPan: (lat: number, lng: number) => void }) {
  const map = useMap();
  
  useEffect(() => {
    map.setView([center.lat, center.lng]);
  }, [center, map]);

  useMapEvents({
    moveend: () => {
      const { lat, lng } = map.getCenter();
      onPan(lat, lng);
    }
  });

  return null;
}

export default function Mapa() {
  const { activePosition } = useLocationContext();
  const [searchCenter, setSearchCenter] = useState(activePosition);
  const [mapCenter, setMapCenter] = useState(activePosition);
  const [isPanning, setIsPanning] = useState(false);
  
  const [raio, setRaio] = useState<number>(10);
  const [somenteSelo, setSomenteSelo] = useState(false);
  const [q, setQ] = useState('');
  
  const [selectedPostoId, setSelectedPostoId] = useState<string | null>(null);
  
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const { requireAuth } = useRequireAuth();
  
  const [addressSearch, setAddressSearch] = useState('');
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);

  useEffect(() => {
    const onboarded = localStorage.getItem('cl_onboarded');
    if (!onboarded) setShowOnboarding(true);
  }, []);

  const finishOnboarding = () => {
    localStorage.setItem('cl_onboarded', 'true');
    setShowOnboarding(false);
  };

  const { data: postos = [] } = useListarPostos(
    { lat: searchCenter.lat, lng: searchCenter.lng, raio_km: raio, somente_selo: somenteSelo, q },
    { query: { queryKey: getListarPostosQueryKey({ lat: searchCenter.lat, lng: searchCenter.lng, raio_km: raio, somente_selo: somenteSelo, q }) } }
  );

  const { data: addresses = [] } = useBuscarEndereco(
    { q: addressSearch },
    { query: { enabled: addressSearch.length >= 3, queryKey: getBuscarEnderecoQueryKey({ q: addressSearch }) } }
  );

  const handleSearchArea = () => {
    setSearchCenter(mapCenter);
    setIsPanning(false);
  };

  const handleAddressSelect = (lat: number, lng: number) => {
    setSearchCenter({ lat, lng });
    setMapCenter({ lat, lng });
    setAddressSearch('');
    setShowAddressDropdown(false);
  };

  const postosSelo = postos.filter(p => p.tier === 'selo').length;

  return (
    <div className="h-full w-full relative flex flex-col">
      <div className="absolute top-0 inset-x-0 z-[400] bg-gradient-to-b from-white via-white/90 to-transparent pb-6 pt-4 px-4 shadow-sm md:rounded-t-[2.5rem]">
        {/* Search */}
        <div className="relative mb-3">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <Input 
            value={addressSearch}
            onChange={(e) => {
              setAddressSearch(e.target.value);
              setShowAddressDropdown(true);
            }}
            placeholder="Buscar endereço ou posto" 
            className="pl-10 h-12 bg-white border-slate-200 shadow-sm rounded-xl text-md"
            onFocus={() => setShowAddressDropdown(true)}
          />
          
          {showAddressDropdown && addressSearch.length >= 3 && addresses.length > 0 && (
            <div className="absolute top-14 inset-x-0 bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden z-[500]">
              {addresses.map((addr, i) => (
                <button
                  key={i}
                  className="w-full text-left px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 flex items-center gap-3"
                  onClick={() => handleAddressSelect(addr.lat, addr.lng)}
                >
                  <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                  <span className="text-sm truncate text-slate-700">{addr.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button 
            onClick={() => setSomenteSelo(!somenteSelo)}
            className={cn(
              "shrink-0 px-4 py-2 rounded-full text-sm font-medium border flex items-center gap-2 transition-colors",
              somenteSelo ? "bg-primary text-white border-primary" : "bg-white text-slate-600 border-slate-200"
            )}
          >
            <ShieldCheck className={cn("w-4 h-4", somenteSelo ? "text-orange-400" : "text-slate-400")} />
            Só verificados
          </button>
          
          <div className="shrink-0 bg-white border border-slate-200 rounded-full flex items-center p-1">
            {[5, 10, 25].map(r => (
              <button
                key={r}
                onClick={() => setRaio(r)}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-full transition-colors",
                  raio === r ? "bg-slate-100 text-primary" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                {r}km
              </button>
            ))}
          </div>

          <div className="shrink-0 ml-auto bg-orange-50 border border-orange-100 text-orange-800 text-xs font-bold px-3 py-2 rounded-full flex items-center gap-1.5 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-flame-gradient"></span>
            {postosSelo} {postosSelo === 1 ? 'verificado' : 'verificados'}
          </div>
        </div>
      </div>

      <div className="flex-1 relative bg-slate-100 z-0">
        <MapContainer 
          center={[activePosition.lat, activePosition.lng]} 
          zoom={13} 
          zoomControl={false}
          className="w-full h-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapUpdater 
            center={searchCenter} 
            onPan={(lat, lng) => {
              setMapCenter({ lat, lng });
              setIsPanning(true);
            }} 
          />
          
          <Marker position={[activePosition.lat, activePosition.lng]} icon={userIcon} zIndexOffset={1000} />
          
          {postos.map(posto => (
            <Marker 
              key={posto.id} 
              position={[posto.lat, posto.lng]}
              icon={posto.tier === 'selo' ? seloIcon : regularIcon}
              zIndexOffset={posto.tier === 'selo' ? 500 : 100}
              eventHandlers={{ click: () => setSelectedPostoId(posto.id) }}
            />
          ))}
        </MapContainer>

        {isPanning && (
          <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+70px)] left-1/2 -translate-x-1/2 z-[400]">
            <Button onClick={handleSearchArea} className="bg-white text-primary border border-slate-200 shadow-md hover:bg-slate-50 rounded-full h-10 px-6 font-semibold">
              Buscar nesta área
            </Button>
          </div>
        )}
        
        {/* Recenter Button */}
        <button 
          onClick={() => {
            setSearchCenter(activePosition);
            setMapCenter(activePosition);
            setIsPanning(false);
          }}
          className="absolute bottom-[calc(env(safe-area-inset-bottom)+90px)] right-4 z-[400] w-12 h-12 bg-white rounded-full shadow-md border border-slate-100 flex items-center justify-center text-primary hover:bg-slate-50"
        >
          <Navigation2 className="w-5 h-5 fill-current" />
        </button>
      </div>

      <PostoFicha 
        postoId={selectedPostoId} 
        isOpen={!!selectedPostoId} 
        onClose={() => setSelectedPostoId(null)} 
      />

      <Sheet open={showOnboarding} onOpenChange={() => {}}>
        <SheetContent side="bottom" className="rounded-t-3xl sm:max-w-md sm:mx-auto p-6" hideClose>
          {onboardingStep === 1 ? (
            <div className="text-center">
              <div className="w-20 h-20 mx-auto bg-flame-gradient rounded-full flex items-center justify-center mb-6 shadow-lg text-white">
                <ShieldCheck className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-bold font-display text-primary mb-3">Abasteça com confiança</h2>
              <p className="text-slate-600 mb-8 leading-relaxed">
                Encontre postos verificados que garantem a qualidade do combustível e a conformidade com a ANP.
              </p>
              <div className="space-y-3">
                <Button className="w-full h-12 text-md font-bold bg-primary" onClick={() => setOnboardingStep(2)}>
                  Continuar
                </Button>
                <Button variant="ghost" className="w-full text-slate-500" onClick={finishOnboarding}>
                  Pular
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <div className="w-20 h-20 mx-auto bg-slate-100 rounded-full flex items-center justify-center mb-6 text-primary">
                <MapPin className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-bold font-display text-primary mb-3">Sua Localização</h2>
              <p className="text-slate-600 mb-8 leading-relaxed">
                Precisamos da sua localização para encontrar os postos verificados mais próximos de você.
              </p>
              <div className="space-y-3">
                <Button 
                  className="w-full h-12 text-md font-bold bg-primary" 
                  onClick={() => {
                    requireAuth(() => finishOnboarding());
                    // if they skip auth, it closes both, but requireAuth handles that via success callback or if they just close.
                    // Actually, if we just want them to login optionally:
                  }}
                >
                  Entrar com celular
                </Button>
                <Button variant="ghost" className="w-full text-slate-500" onClick={finishOnboarding}>
                  Entrar depois
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}