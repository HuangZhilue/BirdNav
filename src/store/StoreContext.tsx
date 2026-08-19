import { useState, useEffect, useCallback, useRef, createContext, useContext, ReactNode } from 'react';
import { get, set } from 'idb-keyval';
import { SavedPoint, MapLayer, EbirdHotspot, EbirdObservation } from '../types';
import { detectCurrentProvinceCode } from '../utils/geolocation';

interface StoreState {
  savedPoints: SavedPoint[];
  addSavedPoint: (point: Omit<SavedPoint, 'id'>) => void;
  removeSavedPoint: (id: string) => void;
  updateSavedPointName: (id: string, name: string) => void;
  reorderSavedPoints: (newPoints: SavedPoint[]) => void;
  updateMyLocation: (latlng: any | null) => void;
  ebirdToken: string;
  setEbirdToken: (token: string) => void;
  mapLayer: MapLayer;
  setMapLayer: (layer: MapLayer) => void;
  trafficEnabled: boolean;
  setTrafficEnabled: (enabled: boolean) => void;
  roadNetEnabled: boolean;
  setRoadNetEnabled: (enabled: boolean) => void;
  cachedHotspots: Record<string, EbirdHotspot>;
  updateCachedHotspots: (hotspots: EbirdHotspot[]) => void;
  cachedObservations: EbirdObservation[];
  updateCachedObservations: (observations: EbirdObservation[]) => void;
  clearProvinceData: (provinceCode: string) => void;
  hotspotFilterDays: number | null;
  setHotspotFilterDays: (days: number | null) => void;
  showSavedHotspotsOnly: boolean;
  setShowSavedHotspotsOnly: (val: boolean) => void;
  isLoaded: boolean;
  isCalculatingRoute: boolean;
  setIsCalculatingRoute: (val: boolean) => void;
  selectedProvince: string;
  setSelectedProvince: (code: string) => void;
}

const StoreContext = createContext<StoreState | null>(null);

export const StoreProvider = ({ children }: { children: ReactNode }) => {
  const [savedPoints, setSavedPoints] = useState<SavedPoint[]>([]);
  const [ebirdToken, setEbirdToken] = useState<string>('');
  const [mapLayer, setMapLayer] = useState<MapLayer>('roadmap');
  const [trafficEnabled, setTrafficEnabled] = useState<boolean>(false);
  const [roadNetEnabled, setRoadNetEnabled] = useState<boolean>(true);
  const [cachedHotspots, setCachedHotspots] = useState<Record<string, EbirdHotspot>>({});
  const [cachedObservations, setCachedObservationsState] = useState<EbirdObservation[]>([]);
  const [hotspotFilterDays, setHotspotFilterDaysState] = useState<number | null>(null);
  const [showSavedHotspotsOnly, setShowSavedHotspotsOnlyState] = useState<boolean>(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState<boolean>(false);
  const [selectedProvince, setSelectedProvinceState] = useState<string>('CN-11');
  const provinceManuallySetRef = useRef(false);

  useEffect(() => {
    const loadState = async () => {
      const points = await get('savedPoints') || [];
      const token = await get('ebirdToken') || '';
      const layer = await get('mapLayer') || 'roadmap';
      const traffic = await get('trafficEnabled') || false;
      const roadNet = await get('roadNetEnabled') ?? true;
      const cachedPts = await get('cachedHotspots') || {};
      const cachedObs = await get('cachedObservations') || [];
      const filterDays = await get('hotspotFilterDays') || null;
      const showSavedOnly = await get('showSavedHotspotsOnly') || false;
      
      setSavedPoints(points);
      setEbirdToken(token);
      setMapLayer(layer);
      setTrafficEnabled(traffic);
      setRoadNetEnabled(roadNet);
      setCachedHotspots(cachedPts);
      setCachedObservationsState(cachedObs);
      setHotspotFilterDaysState(filterDays);
      setShowSavedHotspotsOnlyState(showSavedOnly);
      setIsLoaded(true);
    };
    loadState();
  }, []);

  // Auto-detect the user's current province (GPS if already granted, else IP-based) and
  // pre-select it in the province dropdown, unless the user has already picked one manually.
  useEffect(() => {
    let cancelled = false;
    detectCurrentProvinceCode().then(code => {
      if (!cancelled && code && !provinceManuallySetRef.current) {
        setSelectedProvinceState(code);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const setSelectedProvince = useCallback((code: string) => {
    provinceManuallySetRef.current = true;
    setSelectedProvinceState(code);
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

  const updateMyLocation = useCallback((latlng: any | null) => {
    setSavedPoints(prev => {
      let newPoints;
      if (!latlng) {
        newPoints = prev.filter(p => p.type !== 'my-location');
      } else {
        const existingIndex = prev.findIndex(p => p.type === 'my-location');
        if (existingIndex >= 0) {
          newPoints = [...prev];
          newPoints[existingIndex] = { ...newPoints[existingIndex], location: latlng };
        } else {
          newPoints = [...prev, { id: 'my-location', name: '我的位置', location: latlng, type: 'my-location' }];
        }
      }
      set('savedPoints', newPoints);
      return newPoints;
    });
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

  const handleSetRoadNetEnabled = useCallback((enabled: boolean) => {
    setRoadNetEnabled(enabled);
    set('roadNetEnabled', enabled);
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

  const updateCachedObservations = useCallback((observations: EbirdObservation[]) => {
    setCachedObservationsState(prev => {
      const map = new Map<string, EbirdObservation>();
      // Keep existing
      prev.forEach(o => map.set(`${o.subId}-${o.speciesCode}`, o));
      // Overwrite with new
      observations.forEach(o => map.set(`${o.subId}-${o.speciesCode}`, o));
      
      // Filter out anything older than 45 days just to keep storage clean
      const cutoff = Date.now() - 45 * 24 * 60 * 60 * 1000;
      const merged = Array.from(map.values()).filter(o => {
        if (!o.obsDt) return false;
        const obsDate = new Date(o.obsDt.replace(' ', 'T'));
        return obsDate.getTime() > cutoff;
      });

      set('cachedObservations', merged);
      return merged;
    });
  }, []);

  const clearProvinceData = useCallback((provinceCode: string) => {
    setCachedHotspots(prev => {
      const next = { ...prev };
      let changed = false;
      Object.keys(next).forEach(locId => {
        if ((next[locId] as any).subnational1Code === provinceCode || (next[locId] as any).provinceCode === provinceCode) {
          delete next[locId];
          changed = true;
        }
      });
      if (changed) set('cachedHotspots', next);
      return next;
    });

    setCachedObservationsState([]);
    set('cachedObservations', []);
  }, []);

  const setHotspotFilterDays = useCallback((days: number | null) => {
    setHotspotFilterDaysState(days);
    set('hotspotFilterDays', days);
  }, []);

  const setShowSavedHotspotsOnly = useCallback((val: boolean) => {
    setShowSavedHotspotsOnlyState(val);
    set('showSavedHotspotsOnly', val);
  }, []);

  return (
    <StoreContext.Provider value={{
      savedPoints, addSavedPoint, removeSavedPoint, updateSavedPointName, reorderSavedPoints, updateMyLocation,
      ebirdToken, setEbirdToken: handleSetEbirdToken,
      mapLayer, setMapLayer: handleSetMapLayer,
      trafficEnabled, setTrafficEnabled: handleSetTrafficEnabled,
      roadNetEnabled, setRoadNetEnabled: handleSetRoadNetEnabled,
      cachedHotspots, updateCachedHotspots,
      cachedObservations, updateCachedObservations,
      clearProvinceData,
      hotspotFilterDays, setHotspotFilterDays,
      showSavedHotspotsOnly, setShowSavedHotspotsOnly,
      isLoaded,
      isCalculatingRoute, setIsCalculatingRoute,
      selectedProvince, setSelectedProvince
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
