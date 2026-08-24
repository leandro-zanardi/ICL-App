import { createContext, useCallback, useContext, useState, ReactNode } from 'react';

export type Position = { lat: number; lng: number };

type LocationContextType = {
  position: Position | null;
  positionError: string | null;
  demoPosition: Position | null;
  setDemoPosition: (pos: Position | null) => void;
  activePosition: Position; // Either demo or real, fallback to Av Paulista
  isUsingApproximateLocation: boolean;
  requestLocation: () => void;
};

const DEFAULT_POSITION: Position = { lat: -23.5614, lng: -46.6559 }; // Av. Paulista

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [position, setPosition] = useState<Position | null>(null);
  const [positionError, setPositionError] = useState<string | null>(null);
  const [demoPosition, setDemoPosition] = useState<Position | null>(null);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setPositionError('Geolocalização não suportada');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setPositionError(null);
      },
      (err) => {
        setPositionError(err.message);
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  const activePosition = demoPosition || position || DEFAULT_POSITION;
  const isUsingApproximateLocation = !demoPosition && !position;

  return (
    <LocationContext.Provider
      value={{
        position,
        positionError,
        demoPosition,
        setDemoPosition,
        activePosition,
        isUsingApproximateLocation,
        requestLocation,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export function useLocationContext() {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error('useLocationContext must be used within a LocationProvider');
  }
  return context;
}