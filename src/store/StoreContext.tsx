import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { get, set } from 'idb-keyval';
import { SavedPoint, MapLayer, EbirdHotspot } from '../types';

interface StoreState {
  savedPoints: SavedPoint[];
  addSavedPoint: (point: Omit<SavedPoint, 'id'>) => void;
  removeSavedPoint: (id: string) => void;
  updateSavedPointName: (id: string, name: string) => void;
  reorderSavedPoints: (newPoints: SavedPoint[]) => void;
  ebirdToken: string;
  setEbirdToken: (token: string) => void;
  mapLayer: MapLayer;
  setMapLayer: (layer: MapLayer) => void;
  trafficEnabled: boolean;
  setTrafficEnabled: (enabled: boolean) => void;
  cachedHotspots: Record<string, EbirdHotspot>;
  updateCachedHotspots: (hotspots: EbirdHotspot[]) => void;
  hotspotFilterDays: number | null;
  setHotspotFilterDays: (days: number | null) => void;
  isLoaded: boolean;
}

const StoreContext = createContext<StoreState | null>(null);

export const StoreProvider = ({ children }: { children: ReactNode }) => {
  const [savedPoints, setSavedPoints] = useState<SavedPoint[]>([]);
  const [ebirdToken, setEbirdToken] = useState<string>('');
  const [mapLayer, setMapLayer] = useState<MapLayer>('roadmap');
  const [trafficEnabled, setTrafficEnabled] = useState<boolean>(false);
  const [cachedHotspots, setCachedHotspots] = useState<Record<string, EbirdHotspot>>({});
  const [hotspotFilterDays, setHotspotFilterDaysState] = useState<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadState = async () => {
      const points = await get('savedPoints') || [];
      const token = await get('ebirdToken') || '';
      const layer = await get('mapLayer') || 'roadmap';
      const traffic = await get('trafficEnabled') || false;
      const cachedPts = await get('cachedHotspots') || {};
      const filterDays = await get('hotspotFilterDays') || null;
      
      setSavedPoints(points);
      setEbirdToken(token);
      setMapLayer(layer);
      setTrafficEnabled(traffic);
      setCachedHotspots(cachedPts);
      setHotspotFilterDaysState(filterDays);
      setIsLoaded(true);
    };
    loadState();
  }, []);

  const addSavedPoint = useCallback((point: Omit<SavedPoint, 'id'>) => {
    setSavedPoints(prev => {
      const newPoints = [...prev, { ...point, id: crypto.randomUUID() }];
      set('savedPoints', newPoints);
      return newPoints;
    });
  }, []);

  const removeSavedPoint = useCallback((id: string) => {
    setSavedPoints(prev => {
      const newPoints = prev.filter(p => p.id !== id);
      set('savedPoints', newPoints);
      return newPoints;
    });
  }, []);

  const updateSavedPointName = useCallback((id: string, name: string) => {
    setSavedPoints(prev => {
      const newPoints = prev.map(p => p.id === id ? { ...p, name } : p);
      set('savedPoints', newPoints);
      return newPoints;
    });
  }, []);

  const reorderSavedPoints = useCallback((newPoints: SavedPoint[]) => {
    setSavedPoints(newPoints);
    set('savedPoints', newPoints);
  }, []);

  const handleSetEbirdToken = useCallback((token: string) => {
    setEbirdToken(token);
    set('ebirdToken', token);
  }, []);

  const handleSetMapLayer = useCallback((layer: MapLayer) => {
    setMapLayer(layer);
    set('mapLayer', layer);
  }, []);

  const handleSetTrafficEnabled = useCallback((enabled: boolean) => {
    setTrafficEnabled(enabled);
    set('trafficEnabled', enabled);
  }, []);

  const updateCachedHotspots = useCallback((hotspots: EbirdHotspot[]) => {
    setCachedHotspots(prev => {
      const next = { ...prev };
      let changed = false;
      hotspots.forEach(h => {
        next[h.locId] = h;
        changed = true;
      });
      if (changed) {
        set('cachedHotspots', next);
      }
      return next;
    });
  }, []);

  const setHotspotFilterDays = useCallback((days: number | null) => {
    setHotspotFilterDaysState(days);
    set('hotspotFilterDays', days);
  }, []);

  return (
    <StoreContext.Provider value={{
      savedPoints, addSavedPoint, removeSavedPoint, updateSavedPointName, reorderSavedPoints,
      ebirdToken, setEbirdToken: handleSetEbirdToken,
      mapLayer, setMapLayer: handleSetMapLayer,
      trafficEnabled, setTrafficEnabled: handleSetTrafficEnabled,
      cachedHotspots, updateCachedHotspots,
      hotspotFilterDays, setHotspotFilterDays,
      isLoaded
    }}>
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
};
