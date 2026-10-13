import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocationContext } from '@/contexts/LocationContext';
import { useListarPostos, useBuscarEndereco, getBuscarEnderecoQueryKey, getListarPostosQueryKey } from '@workspace/api-client-react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { PostoFicha } from '@/components/PostoFicha';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, MapPin, ShieldCheck, Navigation2, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useRequireAuth } from '@/contexts/RequireAuthContext';
import { coresNota, criarIconePosto } from '@/lib/pin-nota';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

// --- Custom Icons ---
const userIconHtml = `<div style="width: 24px; height: 24px; background: rgba(14,42,71,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center;"><div style="width: 12px; height: 12px; background: #0E2A47; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 4px rgba(0,0,0,0.3);"></div></div>`;
const userIcon = L.divIcon({ html: userIconHtml, className: '', iconSize: [24, 24], iconAnchor: [12, 12] });

type SavedMapState = {
  searchCenter: { lat: number; lng: number };
  mapCenter: { lat: number; lng: number };
  raio?: number;
  somenteSelo?: boolean;
};

function isValidPosition(value: unknown): value is { lat: number; lng: number } {
  if (!value || typeof value !== 'object') return false;
  const { lat, lng } = value as { lat?: unknown; lng?: unknown };
  return (
    typeof lat === 'number' &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    typeof lng === 'number' &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180
  );
}

function readSavedMap(): SavedMapState | null {
  try {
    const raw = localStorage.getItem('cl_last_map');
    if (!raw) return null;

    const saved = JSON.parse(raw) as Partial<SavedMapState>;
    if (!isValidPosition(saved.searchCenter) || !isValidPosition(saved.mapCenter)) {
      localStorage.removeItem('cl_last_map');
      return null;
    }

    return {
      searchCenter: saved.searchCenter,
      mapCenter: saved.mapCenter,
      raio: [5, 10, 25].includes(saved.raio ?? 10) ? saved.raio : 10,
      somenteSelo: saved.somenteSelo === true,
    };
  } catch {
    localStorage.removeItem('cl_last_map');
    return null;
  }
}

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
  const { activePosition, isUsingApproximateLocation, requestLocation } = useLocationContext();
  const hasAppliedDeviceLocation = useRef(false);
  const savedMap = useMemo(readSavedMap, []);
  const [searchCenter, setSearchCenter] = useState(savedMap?.searchCenter ?? activePosition);
  const [mapCenter, setMapCenter] = useState(savedMap?.mapCenter ?? activePosition);
  const [isPanning, setIsPanning] = useState(false);
  
  const [raio, setRaio] = useState<number>(savedMap?.raio ?? 10);
  const [somenteSelo, setSomenteSelo] = useState(savedMap?.somenteSelo ?? false);
  const [q, setQ] = useState('');
  
  const [selectedPostoId, setSelectedPostoId] = useState<string | null>(null);
  
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const { requireAuth } = useRequireAuth();
  
  const [addressSearch, setAddressSearch] = useState('');
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);
  const debouncedAddressSearch = useDebouncedValue(addressSearch.trim());
  const isAddressQueryCurrent = debouncedAddressSearch === addressSearch.trim();

  useEffect(() => {
    const onboarded = localStorage.getItem('cl_onboarded');
    if (!onboarded) setShowOnboarding(true);
  }, []);

  useEffect(() => {
    if (isUsingApproximateLocation || hasAppliedDeviceLocation.current) return;

    // A localização confirmada passa a ser a origem da consulta e do mapa.
    // Após isso, preservamos ajustes manuais e o último mapa salvo.
    hasAppliedDeviceLocation.current = true;
    setSearchCenter(activePosition);
    setMapCenter(activePosition);
    setIsPanning(false);
  }, [activePosition, isUsingApproximateLocation]);

  useEffect(() => {
    const saveMap = window.setTimeout(() => {
      localStorage.setItem('cl_last_map', JSON.stringify({ searchCenter, mapCenter, raio, somenteSelo }));
    }, 250);
    return () => window.clearTimeout(saveMap);
  }, [searchCenter, mapCenter, raio, somenteSelo]);

  const finishOnboarding = () => {
    localStorage.setItem('cl_onboarded', 'true');
    setShowOnboarding(false);
  };

  const {
    data: postos = [],
    isError: isPostosError,
    isPending: isPostosLoading,
    refetch: refetchPostos,
  } = useListarPostos(
    { lat: searchCenter.lat, lng: searchCenter.lng, raio_km: raio, somente_selo: somenteSelo, q },
    {
      query: {
        queryKey: getListarPostosQueryKey({
          lat: searchCenter.lat,
          lng: searchCenter.lng,
          raio_km: raio,
          somente_selo: somenteSelo,
          q,
        }),
        // Sem isso, o React Query pausa offline e deixa a interface em
        // "carregando" para sempre, sem dar ao usuário como tentar novamente.
        networkMode: 'always',
        // O botão "Tentar novamente" é a recuperação explícita desta tela.
        // Não mantenha o usuário aguardando retries silenciosos da biblioteca.
        retry: false,
      },
    },
  );

  const { data: addresses = [] } = useBuscarEndereco(
    { q: debouncedAddressSearch },
    {
      query: {
        enabled: debouncedAddressSearch.length >= 3,
        queryKey: getBuscarEnderecoQueryKey({ q: debouncedAddressSearch }),
      },
    }
  );

  const handleSearchArea = () => {
    setSearchCenter(mapCenter);
    setIsPanning(false);
  };

  const toggleSomenteSelo = () => {
    setSomenteSelo((atual) => !atual);
  };

  const uniqueAddresses = useMemo(() => {
    const seen = new Set<string>();
    return addresses.filter((address) => {
      const key = `${address.label.trim().toLocaleLowerCase('pt-BR')}\u0000${address.lat}\u0000${address.lng}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [addresses]);

  const handleAddressSelect = (lat: number, lng: number, label: string) => {
    setSearchCenter({ lat, lng });
    setMapCenter({ lat, lng });
    setAddressSearch(label);
    setShowAddressDropdown(false);
  };

  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const postosSelo = postos.filter(p => p.tier === 'selo').length;

  return (
    <div className="h-full w-full relative flex flex-col">
      <div className="absolute top-0 inset-x-0 z-[400] bg-gradient-to-b from-white via-white/90 to-transparent pb-6 pt-[calc(env(safe-area-inset-top)+1rem)] px-4 shadow-sm md:rounded-t-[2.5rem]">
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
            onKeyDown={(event) => {
              if (event.key === 'Enter' && isAddressQueryCurrent && uniqueAddresses[0]) {
                event.preventDefault();
                const address = uniqueAddresses[0];
                handleAddressSelect(address.lat, address.lng, address.label);
              }
            }}
          />
          
          {showAddressDropdown && isAddressQueryCurrent && addressSearch.length >= 3 && uniqueAddresses.length > 0 && (
            <div className="absolute top-14 inset-x-0 bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden z-[500]">
              {uniqueAddresses.map((addr) => (
                <button
                  key={`${addr.label}-${addr.lat}-${addr.lng}`}
                  className="w-full text-left px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 flex items-center gap-3"
                  onClick={() => handleAddressSelect(addr.lat, addr.lng, addr.label)}
                >
                  <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                  <span className="text-sm truncate text-slate-700">{addr.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Filters */}
          {isUsingApproximateLocation && (
            <button
              type="button"
              onClick={requestLocation}
              className="mb-3 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900"
            >
              Região aproximada: Av. Paulista — ajustar
            </button>
          )}

          <p className="mb-2 text-xs font-semibold text-primary">
            {isPostosLoading
              ? 'Carregando postos perto de você…'
              : isPostosError
                ? 'Postos indisponíveis no momento'
                : `${postos.length} ${postos.length === 1 ? 'posto no mapa' : 'postos no mapa'}${postosSelo > 0 ? ` · ${postosSelo} ${postosSelo === 1 ? 'verificado' : 'verificados'}` : ''}`}
          </p>

           <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-slate-600" aria-label="Legenda das notas ANP">
             <span className="text-slate-500">Nota ANP:</span>
             {Object.entries(coresNota).map(([nota, { cor }]) => (
               <span key={nota} className="inline-flex items-center gap-1">
                 <span className="h-2.5 w-2.5 rounded-full border border-white shadow-sm" style={{ backgroundColor: cor }} />
                 {nota}
               </span>
             ))}
           </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button 
            type="button"
            aria-pressed={somenteSelo}
            onClick={toggleSomenteSelo}
            className={cn(
              "shrink-0 min-h-11 px-4 py-2 rounded-full text-sm font-medium border flex items-center gap-2 transition-colors",
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
                  "min-h-9 min-w-11 px-3 py-1 text-xs font-medium rounded-full transition-colors",
                  raio === r ? "bg-slate-100 text-primary" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                {r}km
              </button>
            ))}
          </div>

        </div>

        {isPostosError && (
          <div role="alert" className="mt-2 flex items-center gap-3 rounded-xl border border-red-100 bg-white p-3 shadow-sm">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
            <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-slate-800">
              {isOffline
                ? 'Sem conexão com a internet. Verifique o sinal e tente de novo.'
                : 'Não conseguimos carregar os postos agora. Tente novamente em instantes.'}
            </p>
            <Button variant="outline" size="sm" className="h-11 shrink-0 px-3" onClick={() => void refetchPostos()}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Tentar
            </Button>
          </div>
        )}

        {!isPostosLoading && !isPostosError && postos.length === 0 && (
          <div role="status" className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-center text-sm font-medium text-slate-600 shadow-sm">
            {somenteSelo
              ? 'Nenhum posto verificado neste raio — desligue o filtro ou amplie a busca.'
              : 'Nenhum posto encontrado neste raio — amplie a busca ou mude a região.'}
          </div>
        )}
      </div>

      <div className="flex-1 relative bg-slate-100 z-0">
        <MapContainer 
          center={[activePosition.lat, activePosition.lng]} 
          zoom={13} 
          zoomControl={false}
          attributionControl={false}
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
               icon={criarIconePosto(posto.nota_anp)}
              zIndexOffset={posto.tier === 'selo' ? 500 : 100}
              eventHandlers={{ click: () => setSelectedPostoId(posto.id) }}
            />
          ))}
        </MapContainer>
        <div className="pointer-events-none absolute bottom-[calc(env(safe-area-inset-bottom)+66px)] left-2 z-[400] rounded bg-white/90 px-1.5 py-1 text-[10px] text-slate-600 shadow-sm">
          © OpenStreetMap contributors
        </div>

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
                    requestLocation();
                    finishOnboarding();
                  }}
                >
                  Permitir localização
                </Button>
                <Button variant="ghost" className="w-full text-slate-500" onClick={finishOnboarding}>
                  Agora não
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}