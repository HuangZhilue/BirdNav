import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { renderToString } from 'react-dom/server';
import { useStore } from '../store/StoreContext';
import { LatLng, EbirdHotspot, MapLayer, SavedPoint } from '../types';
import { Bird, MapPin, Navigation, Map as MapIcon, TrafficCone, Compass, List, X, Loader2, Route as RouteIcon, Search } from 'lucide-react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { wgs84ToGcj02, gcj02ToWgs84 } from '../utils/coords';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Convert Lucide icons to Leaflet DivIcon
const createCustomIcon = (icon: React.ReactElement, colorClass: string) => {
  const html = renderToString(
    <div className={cn("flex items-center justify-center drop-shadow-md", colorClass)}>
      {icon}
    </div>
  );
  return L.divIcon({
    html,
    className: 'bg-transparent border-none',
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24],
  });
};

const ebirdIcons = {
  red: createCustomIcon(<MapPin className="w-6 h-6" />, 'text-red-500'),
  yellow: createCustomIcon(<MapPin className="w-6 h-6" />, 'text-yellow-400'),
  green: createCustomIcon(<MapPin className="w-6 h-6" />, 'text-emerald-500'),
  grey: createCustomIcon(<MapPin className="w-6 h-6" />, 'text-gray-400'),
};

const icons = {
  custom: createCustomIcon(<MapPin className="w-6 h-6" />, 'text-blue-500'),
  route: createCustomIcon(<MapPin className="w-6 h-6" />, 'text-orange-500'),
};

const CHINA_PROVINCES = [
  { code: 'CN-11', name: '北京' },
  { code: 'CN-12', name: '天津' },
  { code: 'CN-13', name: '河北' },
  { code: 'CN-14', name: '山西' },
  { code: 'CN-15', name: '内蒙古' },
  { code: 'CN-21', name: '辽宁' },
  { code: 'CN-22', name: '吉林' },
  { code: 'CN-23', name: '黑龙江' },
  { code: 'CN-31', name: '上海' },
  { code: 'CN-32', name: '江苏' },
  { code: 'CN-33', name: '浙江' },
  { code: 'CN-34', name: '安徽' },
  { code: 'CN-35', name: '福建' },
  { code: 'CN-36', name: '江西' },
  { code: 'CN-37', name: '山东' },
  { code: 'CN-41', name: '河南' },
  { code: 'CN-42', name: '湖北' },
  { code: 'CN-43', name: '湖南' },
  { code: 'CN-44', name: '广东' },
  { code: 'CN-45', name: '广西' },
  { code: 'CN-46', name: '海南' },
  { code: 'CN-50', name: '重庆' },
  { code: 'CN-51', name: '四川' },
  { code: 'CN-52', name: '贵州' },
  { code: 'CN-53', name: '云南' },
  { code: 'CN-54', name: '西藏' },
  { code: 'CN-61', name: '陕西' },
  { code: 'CN-62', name: '甘肃' },
  { code: 'CN-63', name: '青海' },
  { code: 'CN-64', name: '宁夏' },
  { code: 'CN-65', name: '新疆' },
  { code: 'CN-71', name: '台湾' },
  { code: 'CN-91', name: '香港' },
  { code: 'CN-92', name: '澳门' }
];

const getHotspotColorCategory = (latestObsDt?: string) => {
  if (!latestObsDt) return 'grey';
  const obsDate = new Date(latestObsDt.replace(' ', 'T'));
  if (isNaN(obsDate.getTime())) return 'grey';
  const diffDays = (Date.now() - obsDate.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays <= 7) return 'red';
  if (diffDays <= 14) return 'yellow';
  if (diffDays <= 30) return 'green';
  return 'grey';
};

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}小时${m}分钟`;
  return `${m}分钟`;
}

function MapEvents({ onMapClick, onMapChange }: { onMapClick: (latlng: L.LatLng) => void, onMapChange: (center: L.LatLng, zoom: number) => void }) {
  const map = useMap();
  
  useMapEvents({
    click: (e) => {
      onMapClick(e.latlng);
    },
    moveend: () => {
      onMapChange(map.getCenter(), map.getZoom());
    },
    zoomend: () => {
      onMapChange(map.getCenter(), map.getZoom());
    }
  });
  return null;
}

function RouteDisplay({ routePoints, onClear }: { routePoints: LatLng[], onClear: () => void }) {
  const map = useMap();
  const [routeLine, setRouteLine] = useState<[number, number][]>([]);
  const [error, setError] = useState('');
  const [routeInfo, setRouteInfo] = useState<{distance: number, duration: number, legs?: {distance: number, duration: number}[]} | null>(null);

  useEffect(() => {
    if (routePoints.length < 2) {
      setRouteLine([]);
      setRouteInfo(null);
      return;
    }

    const fetchRoute = async () => {
      setError('');
      setRouteInfo(null);
      try {
        const coords = routePoints.map(p => `${p.lng},${p.lat}`).join(';');
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);
        if (!res.ok) throw new Error('Route fetch failed');
        const data = await res.json();
        
        if (data.routes && data.routes[0]) {
          const coordinates = data.routes[0].geometry.coordinates as [number, number][];
          
          setRouteInfo({
            distance: data.routes[0].distance,
            duration: data.routes[0].duration,
            legs: data.routes[0].legs
          });

          // GeoJSON is [lng, lat], Leaflet is [lat, lng]
          let latLngs: [number, number][] = coordinates.map(c => [c[1], c[0]]);
          
          latLngs = latLngs.map(ll => {
            const gcj = wgs84ToGcj02(ll[0], ll[1]);
            return [gcj.lat, gcj.lng];
          });
          setRouteLine(latLngs);
          
          if (latLngs.length > 0) {
            map.fitBounds(L.latLngBounds(latLngs), { padding: [50, 50] });
          }
        } else {
          setError('未找到路线');
        }
      } catch (e) {
        console.error(e);
        setError('路线规划错误');
      }
    };

    fetchRoute();
  }, [routePoints, map]);

  if (routePoints.length < 2) return null;

  return (
    <>
      {routeLine.length > 0 && (
        <Polyline positions={routeLine} color="#3b82f6" weight={6} opacity={0.8} />
      )}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-[#25282c]/90 border border-white/10 backdrop-blur px-4 py-3 shadow-2xl rounded flex flex-col items-center gap-2 min-w-[300px]">
        <div className="flex items-center gap-4 w-full justify-between">
          <div className="flex items-center gap-2 text-white font-bold text-xs tracking-wider">
            <RouteIcon className="w-4 h-4 text-emerald-500" />
            <span>路线规划 ({routePoints.length} 个点)</span>
          </div>
          <button onClick={onClear} className="p-1 bg-white/5 hover:bg-white/10 rounded text-white/60">
            <X className="w-3 h-3" />
          </button>
        </div>
        
        {routeInfo && (
          <div className="flex items-center gap-2 w-full text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-1.5 rounded">
            <span>总计: {(routeInfo.distance / 1000).toFixed(1)} km</span>
            <span className="w-1 h-1 rounded-full bg-emerald-500/50"></span>
            <span>{formatDuration(routeInfo.duration)}</span>
          </div>
        )}
        
        {error && <span className="text-red-400 text-[10px] font-bold uppercase tracking-widest">{error}</span>}

        {/* Breakdown for more than 2 points */}
        {routeInfo?.legs && routeInfo.legs.length > 1 && (
           <div className="flex flex-col gap-1.5 w-full mt-2 border-t border-white/10 pt-3">
             <span className="text-[9px] text-white/40 font-bold uppercase tracking-widest mb-1">分段统计</span>
             {routeInfo.legs.map((leg, i) => (
               <div key={i} className="flex justify-between items-center text-[10px] text-white/70 bg-black/20 px-2 py-1 rounded">
                 <span>{i + 1} ➔ {i + 2}</span>
                 <div className="flex items-center gap-2 font-mono text-emerald-400/80">
                   <span>{(leg.distance / 1000).toFixed(1)} km</span>
                   <span className="w-1 h-1 rounded-full bg-white/20"></span>
                   <span>{formatDuration(leg.duration)}</span>
                 </div>
               </div>
             ))}
           </div>
        )}
      </div>
    </>
  );
}

function BirdHotspots({ 
  onSelectHotspot,
  savedEbirdLocIds
}: { 
  onSelectHotspot: (hotspot: EbirdHotspot) => void;
  savedEbirdLocIds: string[];
}) {
  const { cachedHotspots, hotspotFilterDays } = useStore();

  const displayHotspots = useMemo(() => {
    let list = Object.values(cachedHotspots) as EbirdHotspot[];
    if (hotspotFilterDays !== null) {
      list = list.filter(h => {
        if (!h.latestObsDt) return false;
        const obsDate = new Date(h.latestObsDt.replace(' ', 'T'));
        if (isNaN(obsDate.getTime())) return false;
        const diffDays = (Date.now() - obsDate.getTime()) / (1000 * 60 * 60 * 24);
        return diffDays <= hotspotFilterDays;
      });
    }
    return list.filter(h => !savedEbirdLocIds.includes(h.locId));
  }, [cachedHotspots, hotspotFilterDays, savedEbirdLocIds]);

  return (
    <>
      {displayHotspots.map(h => {
        const gcj = wgs84ToGcj02(h.lat, h.lng);
        const colorCategory = getHotspotColorCategory(h.latestObsDt);

        return (
          <Marker 
            key={h.locId} 
            position={[gcj.lat, gcj.lng]}
            icon={ebirdIcons[colorCategory]}
            eventHandlers={{ click: () => onSelectHotspot(h) }}
          />
        );
      })}
    </>
  );
}

function CustomPointForm({ location, onSave }: { location: LatLng, onSave: (name: string, location: LatLng) => void }) {
  const { savedPoints } = useStore();
  const [name, setName] = useState(`自定义位置 ${savedPoints.length + 1}`);

  return (
    <div className="p-2 min-w-[180px]">
      <h3 className="text-xs font-bold text-black mb-2">添加点位</h3>
      <input 
        type="text" 
        value={name}
        onChange={e => setName(e.target.value)}
        className="w-full bg-white border border-gray-300 rounded px-2 py-1 mb-2 text-sm text-black outline-none focus:border-emerald-500"
        placeholder="点位名称"
        autoFocus
      />
      <button 
        onClick={() => onSave(name, location)}
        className="w-full py-1.5 px-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded text-xs font-bold transition-colors"
      >
        保存点位
      </button>
    </div>
  );
}

function SortablePointItem({
  point,
  isSelected,
  toggleSelection,
  isEditing,
  editNameValue,
  setEditNameValue,
  updateSavedPointName,
  setEditingPointId,
  removeSavedPoint
}: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: point.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 10 : 1
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={cn(
        "group flex flex-col p-3 bg-black/20 border rounded transition-all",
        isSelected ? "border-l-4 border-l-orange-400" : "border-l-4 border-l-blue-400",
        isDragging ? "border-white/20 shadow-lg scale-[1.02]" : "border-white/5 hover:bg-black/40"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 overflow-hidden flex-1">
          <div 
            {...attributes} 
            {...listeners} 
            className="cursor-grab text-white/30 hover:text-white/60 p-1 -ml-2 active:cursor-grabbing"
            title="拖动排序"
          >
            <GripVertical className="w-4 h-4" />
          </div>
          <div className={cn("shrink-0", point.type === 'ebird' ? "text-emerald-400" : "text-blue-400")}>
            {point.type === 'ebird' ? <Bird className="w-5 h-5" /> : <MapPin className="w-5 h-5" />}
          </div>
          <div className="truncate flex-1 pr-2">
            {isEditing ? (
              <input
                type="text"
                value={editNameValue}
                onChange={(e) => setEditNameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    updateSavedPointName(point.id, editNameValue);
                    setEditingPointId(null);
                  }
                }}
                autoFocus
                className="w-full bg-black/50 border border-emerald-500 rounded px-1.5 py-0.5 text-xs text-white outline-none"
                onBlur={() => {
                  updateSavedPointName(point.id, editNameValue);
                  setEditingPointId(null);
                }}
              />
            ) : (
              <p 
                className="text-xs font-bold text-white truncate cursor-pointer hover:text-emerald-400"
                onClick={() => {
                  setEditingPointId(point.id);
                  setEditNameValue(point.name);
                }}
                title="点击修改名称"
              >
                {point.name}
              </p>
            )}
            <p className="text-[9px] uppercase tracking-widest text-white/40">{point.type === 'ebird' ? 'eBird 热点' : '自定义'}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={() => toggleSelection(point.id)}
            className={cn("p-1.5 rounded transition-colors", isSelected ? "bg-orange-500/20 text-orange-400 border border-orange-500/50" : "bg-white/5 hover:bg-white/10 text-white/60 border border-transparent")}
            title={isSelected ? "取消规划选择" : "选择进行规划"}
          >
            <RouteIcon className="w-3 h-3" />
          </button>
          <button 
            onClick={() => removeSavedPoint(point.id)}
            className="p-1.5 bg-white/5 hover:bg-red-500/20 text-white/60 hover:text-red-400 rounded transition-colors"
            title="删除"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function MapController({ panTo }: { panTo: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (panTo) {
      const gcj = wgs84ToGcj02(panTo.lat, panTo.lng);
      map.flyTo([gcj.lat, gcj.lng], 14, { duration: 1.5 });
    }
  }, [panTo, map]);
  return null;
}

function SearchBar({ onSelect }: { onSelect: (h: EbirdHotspot) => void }) {
  const { cachedHotspots } = useStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EbirdHotspot[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const q = query.toLowerCase();
    const matches = (Object.values(cachedHotspots) as EbirdHotspot[]).filter(h => 
      h.locName.toLowerCase().includes(q)
    ).slice(0, 50);
    setResults(matches);
  }, [query, cachedHotspots]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="absolute top-6 left-6 z-[2000] w-80">
      <div className="bg-[#25282c]/95 backdrop-blur shadow-2xl rounded-lg border border-white/10 flex items-center px-3 py-2 transition-colors focus-within:border-emerald-500/50">
         <Search className="w-5 h-5 text-white/50 mr-2 shrink-0" />
         <input 
           type="text" 
           value={query}
           onChange={e => {
             setQuery(e.target.value);
             setIsOpen(true);
           }}
           onFocus={() => setIsOpen(true)}
           placeholder="模糊搜索已缓存的观鸟点..."
           className="bg-transparent border-none outline-none text-white text-sm w-full placeholder:text-white/30"
         />
         {query && (
           <button onClick={() => { setQuery(''); setResults([]); }} className="text-white/50 hover:text-white shrink-0 p-1">
             <X className="w-4 h-4" />
           </button>
         )}
      </div>
      
      {isOpen && results.length > 0 && (
        <div className="mt-2 bg-[#25282c]/95 backdrop-blur shadow-2xl rounded-lg border border-white/10 max-h-80 overflow-y-auto">
          {results.map(h => (
            <div 
              key={h.locId}
              className="px-4 py-3 hover:bg-white/10 cursor-pointer border-b border-white/5 last:border-0 transition-colors"
              onClick={() => {
                onSelect(h);
                setIsOpen(false);
                setQuery('');
              }}
            >
              <div className="font-bold text-sm text-emerald-400 mb-1 flex items-center gap-2">
                <Bird className="w-4 h-4 shrink-0" />
                <span className="truncate">{h.locName}</span>
              </div>
              <div className="text-xs text-white/50 flex justify-between">
                <span>最近观测: {h.latestObsDt || '无'}</span>
                <span>{h.numSpeciesAllTime ? `${h.numSpeciesAllTime} 种` : ''}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {isOpen && query.trim() && results.length === 0 && (
        <div className="mt-2 bg-[#25282c]/95 backdrop-blur shadow-2xl rounded-lg border border-white/10 px-4 py-3 text-sm text-white/50 text-center">
          未找到匹配的热点。<br/>请先在右侧菜单中获取并缓存更多省份的 eBird 数据。
        </div>
      )}
    </div>
  );
}

export default function MapCanvas() {
  const { mapLayer, addSavedPoint, removeSavedPoint, savedPoints, trafficEnabled, cachedHotspots } = useStore();
  const [selectedLocation, setSelectedLocation] = useState<LatLng | null>(null);
  const [selectedHotspot, setSelectedHotspot] = useState<EbirdHotspot | null>(null);
  const [selectedSavedCustomPoint, setSelectedSavedCustomPoint] = useState<SavedPoint | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [routePoints, setRoutePoints] = useState<LatLng[]>([]);
  const [selectedRouteIds, setSelectedRouteIds] = useState<string[]>([]);
  const [panToLocation, setPanToLocation] = useState<LatLng | null>(null);

  const handleToggleRouteSelection = (id: string) => {
    setSelectedRouteIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handlePlanRoute = () => {
    const newRoute = savedPoints
      .filter(p => selectedRouteIds.includes(p.id))
      .map(p => p.location);
    setRoutePoints(newRoute);
  };

  const savedEbirdLocIds = useMemo(() => 
    savedPoints.filter(p => p.type === 'ebird' && p.ebirdLocId).map(p => p.ebirdLocId!),
  [savedPoints]);

  const handleSearchSelect = (hotspot: EbirdHotspot) => {
    // 选中搜索结果相当于“增加并保存了一个点位”
    addSavedPoint({
      name: hotspot.locName,
      location: { lat: hotspot.lat, lng: hotspot.lng },
      type: 'ebird',
      ebirdLocId: hotspot.locId
    });
    setPanToLocation({ lat: hotspot.lat, lng: hotspot.lng });
  };

  const [initialMapState] = useState(() => {
    const saved = localStorage.getItem('mapState');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return { center: [39.9042, 116.4074], zoom: 11 };
  });

  const handleMapClick = (latlng: L.LatLng) => {
    setSelectedLocation({ lat: latlng.lat, lng: latlng.lng });
    setSelectedHotspot(null);
    setSelectedSavedCustomPoint(null);
  };

  const handleSaveLocation = (name: string, location: LatLng) => {
    // If clicking on gaode map, convert GCJ02 to WGS84 for storage
    const storagePoint = gcj02ToWgs84(location.lat, location.lng);

    addSavedPoint({
      name,
      location: storagePoint,
      type: 'custom'
    });
    setSelectedLocation(null);
  };

  const handleToggleSaveHotspot = () => {
    if (selectedHotspot) {
      const existing = savedPoints.find(p => p.type === 'ebird' && p.ebirdLocId === selectedHotspot.locId);
      if (existing) {
        removeSavedPoint(existing.id);
      } else {
        addSavedPoint({
          name: selectedHotspot.locName,
          location: { lat: selectedHotspot.lat, lng: selectedHotspot.lng }, // eBird points are already WGS84
          type: 'ebird',
          ebirdLocId: selectedHotspot.locId
        });
      }
    }
  };

  const tileUrl = useMemo(() => {
    if (mapLayer === 'satellite' || mapLayer === 'terrain') {
      return 'https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}';
    }
    return 'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}';
  }, [mapLayer]);

  // Transparent road network and labels overlay for Gaode Satellite/Terrain
  const roadNetUrl = useMemo(() => {
    if (mapLayer === 'satellite' || mapLayer === 'terrain') {
      return 'https://webst01.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}';
    }
    return null;
  }, [mapLayer]);

  // Traffic overlay for Gaode
  const trafficUrl = useMemo(() => {
    if (trafficEnabled) {
      return `https://tm.amap.com/trafficengine/mapabc/traffictile?v=1.0&;t=1&x={x}&y={y}&z={z}`;
    }
    return null;
  }, [trafficEnabled]);

  return (
    <div className="flex-1 relative bg-[#1e2124]">
      <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#ffffff 0.5px, transparent 0.5px)', backgroundSize: '20px 20px' }}></div>
      
      <SearchBar onSelect={handleSearchSelect} />

      {/* Brand Header Badge */}
      <div className="absolute top-6 right-6 z-[2000] hidden sm:flex items-center gap-3 bg-[#25282c]/90 backdrop-blur-md px-3.5 py-2 rounded-lg border border-white/10 shadow-2xl pointer-events-auto">
        <div className="w-6 h-6 bg-emerald-500 rounded flex items-center justify-center">
          <Bird className="w-4 h-4 text-black" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-white tracking-tight leading-none">观鸟导航 <span className="text-emerald-400 font-normal text-xs ml-1">BirdNav</span></h1>
          <p className="text-[10px] text-white/50 leading-none mt-1">高德地图 · eBird 鸟讯 · 路线规划</p>
        </div>
      </div>

      <MapContainer 
        center={initialMapState.center as L.LatLngTuple} 
        zoom={initialMapState.zoom} 
        style={{ width: '100%', height: '100%', zIndex: 0 }}
        zoomControl={false}
      >
        <TileLayer url={tileUrl} maxZoom={19} attribution="&copy; Map Provider" />
        
        {roadNetUrl && (
          <TileLayer url={roadNetUrl} maxZoom={19} />
        )}

        {trafficUrl && (
          <TileLayer url={trafficUrl} maxZoom={19} opacity={0.7} />
        )}

        <MapController panTo={panToLocation} />

        <MapEvents 
          onMapClick={handleMapClick}
          onMapChange={(center, zoom) => {
            localStorage.setItem('mapState', JSON.stringify({
              center: [center.lat, center.lng],
              zoom
            }));
          }}
        />
        
        <RouteDisplay routePoints={routePoints} onClear={() => {
          setRoutePoints([]);
          setSelectedRouteIds([]);
        }} />
        
        <BirdHotspots 
          savedEbirdLocIds={savedEbirdLocIds}
          onSelectHotspot={(h) => {
            setSelectedHotspot(h);
            setSelectedLocation(null);
          }} 
        />

        {savedPoints.map(p => {
          const gcj = wgs84ToGcj02(p.location.lat, p.location.lng);
          const isSelected = selectedRouteIds.includes(p.id);

          return (
            <Marker 
              key={p.id} 
              position={[gcj.lat, gcj.lng]} 
              icon={isSelected ? icons.route : icons.custom}
              eventHandlers={{
                click: () => {
                  if (p.type === 'ebird' && p.ebirdLocId) {
                    const hotspot = cachedHotspots[p.ebirdLocId];
                    if (hotspot) {
                      setSelectedHotspot(hotspot);
                    } else {
                      setSelectedHotspot({
                        locId: p.ebirdLocId!,
                        locName: p.name,
                        lat: p.location.lat,
                        lng: p.location.lng,
                      });
                    }
                    setSelectedLocation(null);
                    setSelectedSavedCustomPoint(null);
                  } else {
                    setSelectedSavedCustomPoint(p);
                    setSelectedHotspot(null);
                    setSelectedLocation(null);
                  }
                }
              }}
            />
          );
        })}

        {selectedSavedCustomPoint && (() => {
          const gcj = wgs84ToGcj02(selectedSavedCustomPoint.location.lat, selectedSavedCustomPoint.location.lng);
          return (
            <Popup 
              position={[gcj.lat, gcj.lng]}
              autoPan={false}
              eventHandlers={{
                remove: () => setSelectedSavedCustomPoint(prev => {
                  if (prev && prev.id === selectedSavedCustomPoint.id) {
                    return null;
                  }
                  return prev;
                })
              }}
            >
              <div className="p-1 min-w-[200px]">
                <h3 className="font-bold text-black mb-1">{selectedSavedCustomPoint.name}</h3>
                <p className="text-[10px] font-bold text-slate-500 mb-3">自定义点位</p>
                <button 
                  onClick={() => {
                    removeSavedPoint(selectedSavedCustomPoint.id);
                    setSelectedSavedCustomPoint(null);
                  }}
                  className="w-full py-1.5 px-3 bg-red-500/10 text-red-600 hover:bg-red-500 hover:text-white rounded text-xs font-bold transition-colors"
                >
                  移除点位
                </button>
              </div>
            </Popup>
          );
        })()}

        {selectedLocation && (
          <Popup 
            position={[selectedLocation.lat, selectedLocation.lng]}
            autoPan={false}
            eventHandlers={{
              remove: () => setSelectedLocation(prev => {
                if (prev && prev.lat === selectedLocation.lat && prev.lng === selectedLocation.lng) {
                  return null;
                }
                return prev;
              })
            }}
          >
            <CustomPointForm 
              location={selectedLocation} 
              onSave={handleSaveLocation} 
            />
          </Popup>
        )}

        {selectedHotspot && (() => {
          const gcj = wgs84ToGcj02(selectedHotspot.lat, selectedHotspot.lng);
          const isSaved = savedPoints.some(p => p.type === 'ebird' && p.ebirdLocId === selectedHotspot.locId);
          return (
            <Popup 
              position={[gcj.lat, gcj.lng]}
              autoPan={false}
              eventHandlers={{
                remove: () => setSelectedHotspot(prev => {
                  if (prev && prev.locId === selectedHotspot.locId) {
                    return null;
                  }
                  return prev;
                })
              }}
            >
              <div className="p-1 min-w-[200px]">
                <h3 className="font-bold text-black mb-1">{selectedHotspot.locName}</h3>
                <p className="text-[10px] font-bold text-slate-500 mb-2">eBird 热点</p>
                <div className="text-[10px] text-slate-600 mb-3 space-y-1 bg-slate-100 p-2 rounded">
                  <p>鸟种数量: <span className="font-bold text-slate-800">{selectedHotspot.numSpeciesAllTime ?? '未知'}</span> 种</p>
                  <p>最后记录: <span className="font-bold text-slate-800">{selectedHotspot.latestObsDt ?? '无'}</span></p>
                </div>
                <button 
                  onClick={handleToggleSaveHotspot}
                  className={cn(
                    "w-full py-1.5 px-3 rounded text-xs font-bold transition-colors",
                    isSaved 
                      ? "bg-red-500/10 text-red-600 hover:bg-red-500 hover:text-white" 
                      : "bg-emerald-500 hover:bg-emerald-600 text-white"
                  )}
                >
                  {isSaved ? '移除点位' : '保存到我的点位'}
                </button>
              </div>
            </Popup>
          );
        })()}
      </MapContainer>

      {/* Floating Controls */}
      <button 
        onClick={() => setShowDrawer(true)}
        className="absolute bottom-6 right-6 z-[2000] w-12 h-12 bg-[#25282c] border border-white/10 rounded overflow-hidden shadow-2xl flex items-center justify-center text-white/80 hover:bg-white/5 transition-all"
      >
        <List className="w-5 h-5" />
      </button>

      {showDrawer && <Sidebar 
        onClose={() => setShowDrawer(false)} 
        selectedRouteIds={selectedRouteIds}
        setSelectedRouteIds={setSelectedRouteIds}
        onPlanRoute={handlePlanRoute}
      />}
    </div>
  );
}

function Sidebar({ 
  onClose, 
  selectedRouteIds, 
  setSelectedRouteIds,
  onPlanRoute
}: { 
  onClose: () => void, 
  selectedRouteIds: string[], 
  setSelectedRouteIds: (ids: string[]) => void,
  onPlanRoute: () => void
}) {
  const { mapLayer, setMapLayer, trafficEnabled, setTrafficEnabled, ebirdToken, setEbirdToken, savedPoints, removeSavedPoint, updateSavedPointName, hotspotFilterDays, setHotspotFilterDays, cachedHotspots, updateCachedHotspots } = useStore();
  const [tokenInput, setTokenInput] = useState(ebirdToken);
  const [editingPointId, setEditingPointId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  
  const [selectedProvince, setSelectedProvince] = useState('CN-11');
  const [isFetchingHotspots, setIsFetchingHotspots] = useState(false);
  const { reorderSavedPoints } = useStore();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (active && over && active.id !== over.id) {
      const oldIndex = savedPoints.findIndex(p => p.id === active.id);
      const newIndex = savedPoints.findIndex(p => p.id === over.id);
      reorderSavedPoints(arrayMove(savedPoints, oldIndex, newIndex));
    }
  };

  const handleFetchProvinceHotspots = async () => {
    if (!ebirdToken) {
      alert("请先输入 API 令牌");
      return;
    }
    setIsFetchingHotspots(true);
    try {
      const res = await fetch(`https://api.ebird.org/v2/ref/hotspot/${selectedProvince}?fmt=json`, {
        headers: { 'X-eBirdApiToken': ebirdToken }
      });
      if (res.ok) {
        const data = await res.json();
        updateCachedHotspots(data);
        alert(`成功获取并缓存了 ${data.length} 个热点数据`);
      } else {
        alert("获取失败，请检查令牌或网络");
      }
    } catch (e) {
      console.error(e);
      alert("获取失败");
    } finally {
      setIsFetchingHotspots(false);
    }
  };

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-[#25282c]/95 backdrop-blur-xl shadow-2xl z-[2000] flex flex-col transform transition-transform border-l border-white/10">
      <div className="p-5 border-b border-white/10 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-emerald-400 flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-500 rounded flex items-center justify-center">
              <Bird className="w-5 h-5 text-black" />
            </div>
            观鸟导航
          </h2>
          <p className="text-[11px] text-white/50 mt-1">高德地图 · eBird 鸟讯 · 自定义标注与多点导航</p>
        </div>
        <button onClick={onClose} className="p-2 -mr-2 text-white/40 hover:text-white/80 hover:bg-white/5 rounded-full transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-8">
        
        {/* Map Layers */}
        <section>
          <h3 className="text-xs font-bold text-white/30 uppercase tracking-widest mb-3">地图图层</h3>
          <div className="grid grid-cols-3 gap-2">
            {(['roadmap', 'satellite', 'terrain'] as MapLayer[]).map(layer => {
              const layerName = layer === 'roadmap' ? '标准地图' : layer === 'satellite' ? '卫星地图' : '地形图';
              return (
                <button
                  key={layer}
                  onClick={() => setMapLayer(layer)}
                  className={cn(
                    "py-2 px-1 text-[10px] font-bold rounded border transition-all flex flex-col items-center gap-1",
                    mapLayer === layer 
                      ? "bg-emerald-500/20 border-emerald-500 text-emerald-300" 
                      : "bg-black/30 border-white/5 text-white/60 hover:bg-black/40"
                  )}
                >
                  {layer === 'roadmap' && <MapIcon className="w-4 h-4" />}
                  {layer === 'satellite' && <Compass className="w-4 h-4" />}
                  {layer === 'terrain' && <Navigation className="w-4 h-4" />}
                  {layerName}
                </button>
              );
            })}
          </div>
        </section>

        {/* Traffic */}
        <section>
          <h3 className="text-xs font-bold text-white/30 uppercase tracking-widest mb-3">图层叠加</h3>
          <button
            onClick={() => setTrafficEnabled(!trafficEnabled)}
            className={cn(
              "w-full flex items-center justify-between p-3 rounded border transition-all",
              trafficEnabled ? "bg-orange-500/20 border-orange-500/50 text-orange-400" : "bg-black/30 border-white/5 text-white/60 hover:bg-black/40"
            )}
          >
            <div className="flex items-center gap-3">
              <TrafficCone className={cn("w-5 h-5", trafficEnabled ? "text-orange-400" : "text-white/40")} />
              <span className="font-bold text-xs tracking-wider">实时路况</span>
            </div>
            <div className={cn(
              "w-10 h-5 rounded-full relative transition-colors",
              trafficEnabled ? "bg-orange-500" : "bg-black/50"
            )}>
              <div className={cn(
                "absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform",
                trafficEnabled ? "translate-x-5" : "translate-x-0"
              )} />
            </div>
          </button>
        </section>

        {/* eBird Settings */}
        <section>
          <h3 className="text-xs font-bold text-white/30 uppercase tracking-widest mb-3">eBird 数据源</h3>
          <div className="bg-black/20 p-4 rounded border border-white/5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-white/50 mb-1.5">API 令牌</label>
              <div className="flex gap-2">
                <input 
                  type="password" 
                  value={tokenInput}
                  onChange={e => setTokenInput(e.target.value)}
                  placeholder="粘贴 API Token..."
                  className="flex-1 bg-black/50 border border-white/10 rounded px-3 py-1.5 text-sm placeholder:opacity-40 outline-none focus:border-emerald-500 transition-all text-white"
                />
                <button 
                  onClick={() => setEbirdToken(tokenInput)}
                  className="bg-emerald-500 text-black px-3 py-1.5 rounded text-xs font-bold hover:bg-emerald-400 transition-colors"
                >
                  保存
                </button>
              </div>
              <p className="text-[10px] text-white/40 mt-2 leading-relaxed">
                用于加载周边的鸟类热点。可以从 <a href="https://ebird.org/api/keygen" target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:underline">ebird.org</a> 获取。
              </p>
            </div>
            
            <div>
              <label className="block text-xs font-bold text-white/50 mb-1.5">获取省份热点</label>
              <div className="flex gap-2 mb-2">
                <select 
                  value={selectedProvince}
                  onChange={e => setSelectedProvince(e.target.value)}
                  className="flex-1 bg-black/50 border border-white/10 rounded px-3 py-1.5 text-sm outline-none focus:border-emerald-500 transition-all text-white"
                >
                  {CHINA_PROVINCES.map(p => (
                    <option key={p.code} value={p.code}>{p.name}</option>
                  ))}
                </select>
                <button 
                  onClick={handleFetchProvinceHotspots}
                  disabled={isFetchingHotspots}
                  className="bg-emerald-500 text-black px-3 py-1.5 rounded text-xs font-bold hover:bg-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[60px]"
                >
                  {isFetchingHotspots ? <Loader2 className="w-4 h-4 animate-spin" /> : '查询'}
                </button>
              </div>
              <p className="text-[10px] text-white/40 leading-relaxed mb-4">
                数据将被缓存，可在地图上查看。已缓存: {Object.keys(cachedHotspots).length} 个热点。
              </p>
            </div>
            
            <div>
              <label className="block text-xs font-bold text-white/50 mb-1.5">热点筛选 (作用于所有缓存数据)</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: '全部', value: null },
                  { label: '近7天', value: 7 },
                  { label: '近14天', value: 14 },
                  { label: '近30天', value: 30 }
                ].map(opt => (
                  <button
                    key={opt.label}
                    onClick={() => setHotspotFilterDays(opt.value)}
                    className={cn(
                      "py-1.5 text-[10px] font-bold rounded border transition-colors",
                      hotspotFilterDays === opt.value
                        ? "bg-emerald-500/20 border-emerald-500 text-emerald-300"
                        : "bg-black/30 border-white/10 text-white/60 hover:bg-black/40"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Saved Points */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-white/30 uppercase tracking-widest">已保存的点位</h3>
            <span className="text-[10px] bg-white/10 text-white/60 px-2 py-0.5 rounded font-mono">{savedPoints.length}</span>
          </div>
          
          {savedPoints.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-white/10 rounded bg-black/20">
              <MapPin className="w-8 h-8 text-white/20 mx-auto mb-2" />
              <p className="text-xs font-bold text-white/40">暂无保存的点位。<br/>在地图上点击以添加。</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={savedPoints.map(p => p.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {savedPoints.map(point => {
                    const isSelected = selectedRouteIds.includes(point.id);
                    const isEditing = editingPointId === point.id;
                    
                    return (
                      <SortablePointItem
                        key={point.id}
                        point={point}
                        isSelected={isSelected}
                        toggleSelection={(id: string) => {
                          if (selectedRouteIds.includes(id)) {
                            setSelectedRouteIds(selectedRouteIds.filter(x => x !== id));
                          } else {
                            setSelectedRouteIds([...selectedRouteIds, id]);
                          }
                        }}
                        isEditing={isEditing}
                        editNameValue={editNameValue}
                        setEditNameValue={setEditNameValue}
                        updateSavedPointName={updateSavedPointName}
                        setEditingPointId={setEditingPointId}
                        removeSavedPoint={removeSavedPoint}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
          {savedPoints.length > 0 && (
            <button 
              onClick={onPlanRoute}
              disabled={selectedRouteIds.length < 2}
              className="mt-4 w-full py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-white/5 disabled:text-white/30 disabled:cursor-not-allowed text-black disabled:text-white/40 font-bold text-xs rounded transition-colors flex items-center justify-center gap-2"
            >
              <RouteIcon className="w-4 h-4" />
              {selectedRouteIds.length < 2 ? '请选择至少2个点位进行规划' : '线路规划和耗时统计'}
            </button>
          )}
        </section>

      </div>
    </div>
  );
}
