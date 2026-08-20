import { createPortal } from "react-dom";
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { renderToString } from 'react-dom/server';
import { useStore } from '../store/StoreContext';
import { LatLng, EbirdHotspot, MapLayer, SavedPoint } from '../types';
import { Bird, MapPin, Navigation, Map as MapIcon, TrafficCone, Compass, List, X, Loader2, Route as RouteIcon, Search, User, Navigation2, ChevronDown, ChevronUp, Layers, EyeOff, Menu } from 'lucide-react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { wgs84ToGcj02, gcj02ToWgs84 } from '../utils/coords';
import { CHINA_PROVINCES, PROVINCE_VIEWS } from '../utils/provinces';
import WeatherWidget from './WeatherWidget';
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
  red: createCustomIcon(<MapPin className="w-6 h-6" fill="currentColor" />, 'text-red-500'),
  yellow: createCustomIcon(<MapPin className="w-6 h-6" fill="currentColor" />, 'text-yellow-400'),
  green: createCustomIcon(<MapPin className="w-6 h-6" fill="currentColor" />, 'text-emerald-500'),
  grey: createCustomIcon(<MapPin className="w-6 h-6" fill="currentColor" />, 'text-gray-400'),
};

const icons = {
  custom: createCustomIcon(<MapPin className="w-6 h-6" fill="currentColor" />, 'text-blue-500'),
  route: createCustomIcon(<MapPin className="w-6 h-6" fill="currentColor" />, 'text-orange-500'),
  mylocation: createCustomIcon(<User className="w-6 h-6" fill="currentColor" />, 'text-purple-500'),
};

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

function NavigationModal({ 
  target, 
  onClose 
}: { 
  target: { 
    fromPoint?: SavedPoint | { name: string; location: LatLng }; 
    toPoint: SavedPoint | { name: string; location: LatLng }; 
  }; 
  onClose: () => void; 
}) {
  const { fromPoint, toPoint } = target;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  const toGcj = wgs84ToGcj02(toPoint.location.lat, toPoint.location.lng);
  const fromGcj = fromPoint ? wgs84ToGcj02(fromPoint.location.lat, fromPoint.location.lng) : null;

  const fromName = fromPoint?.name || '起点';
  const toName = toPoint.name;

  const apps = [
    {
      name: '高德地图',
      url: fromGcj 
        ? `amapuri://route/plan/?sourceApplication=BirdNav&sname=${encodeURIComponent(fromName)}&slat=${fromGcj.lat}&slon=${fromGcj.lng}&dlat=${toGcj.lat}&dlon=${toGcj.lng}&dname=${encodeURIComponent(toName)}&dev=0&m=0&t=0`
        : `amapuri://route/plan/?sourceApplication=BirdNav&dlat=${toGcj.lat}&dlon=${toGcj.lng}&dname=${encodeURIComponent(toName)}&dev=0&m=0&t=0`
    },
    {
      name: '百度地图',
      url: fromGcj
        ? `baidumap://map/direction?origin=name:${encodeURIComponent(fromName)}|latlng:${fromGcj.lat},${fromGcj.lng}&destination=name:${encodeURIComponent(toName)}|latlng:${toGcj.lat},${toGcj.lng}&coord_type=gcj02&mode=driving`
        : `baidumap://map/direction?destination=name:${encodeURIComponent(toName)}|latlng:${toGcj.lat},${toGcj.lng}&coord_type=gcj02&mode=driving`
    },
    {
      name: '腾讯地图',
      url: fromGcj
        ? `qqmap://map/routeplan?type=drive&from=${encodeURIComponent(fromName)}&fromcoord=${fromGcj.lat},${fromGcj.lng}&to=${encodeURIComponent(toName)}&tocoord=${toGcj.lat},${toGcj.lng}&referer=BirdNav`
        : `qqmap://map/routeplan?type=drive&to=${encodeURIComponent(toName)}&tocoord=${toGcj.lat},${toGcj.lng}&referer=BirdNav`
    },
    {
      name: 'Google Map',
      url: fromPoint
        ? `https://www.google.com/maps/dir/?api=1&origin=${fromPoint.location.lat},${fromPoint.location.lng}&destination=${toPoint.location.lat},${toPoint.location.lng}&travelmode=driving`
        : `https://www.google.com/maps/dir/?api=1&destination=${toPoint.location.lat},${toPoint.location.lng}&travelmode=driving`
    }
  ];

  let fallbackUrl = fromPoint
    ? `https://www.google.com/maps/dir/?api=1&origin=${fromPoint.location.lat},${fromPoint.location.lng}&destination=${toPoint.location.lat},${toPoint.location.lng}&travelmode=driving`
    : `https://www.google.com/maps/dir/?api=1&destination=${toPoint.location.lat},${toPoint.location.lng}&travelmode=driving`;

  if (isIOS) {
    fallbackUrl = fromPoint
      ? `http://maps.apple.com/?saddr=${fromPoint.location.lat},${fromPoint.location.lng}&daddr=${toPoint.location.lat},${toPoint.location.lng}&dirflg=d`
      : `http://maps.apple.com/?daddr=${toPoint.location.lat},${toPoint.location.lng}&dirflg=d`;
  }

  return (
    <div 
      className="fixed inset-0 z-2010 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none"
      onClick={onClose}
    >
      <div 
        className="bg-[#25282c] border border-white/10 shadow-2xl rounded-2xl p-5 w-full max-w-sm text-white relative animate-in fade-in zoom-in-95 pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Navigation2 className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-white">选择导航软件</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {fromPoint ? (
          <div className="bg-black/30 border border-white/5 p-3 rounded-xl mb-4 text-xs space-y-1.5">
            <div className="flex items-center gap-2 text-white/90 truncate">
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded shrink-0">起点</span>
              <span className="truncate">{fromName}</span>
            </div>
            <div className="flex items-center gap-2 text-white/90 truncate">
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded shrink-0">终点</span>
              <span className="truncate">{toName}</span>
            </div>
          </div>
        ) : (
          <div className="bg-black/30 border border-white/5 p-3 rounded-xl mb-4 text-xs flex items-center gap-2 text-white/90">
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded shrink-0">目的地</span>
            <span className="truncate font-bold">{toName}</span>
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          {apps.map((app) => (
            <a
              key={app.name}
              href={app.url}
              onClick={onClose}
              className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-2 shadow-md active:scale-[0.98]"
            >
              <Navigation className="w-4 h-4" />
              <span>{app.name}</span>
            </a>
          ))}
          <a
            href={fallbackUrl}
            onClick={onClose}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2.5 px-4 bg-white/10 hover:bg-white/20 text-white/90 font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-2 mt-1 border border-white/10 active:scale-[0.98]"
          >
            <span>系统默认 / 浏览器导航</span>
          </a>
        </div>
      </div>
    </div>
  );
}

function RouteDisplay({ routePoints, onClear, uiPortalTarget, onOpenNavModal }: { routePoints: SavedPoint[], onClear: () => void, uiPortalTarget: HTMLElement | null, onOpenNavModal: (from: SavedPoint, to: SavedPoint) => void }) {
  const map = useMap();
  const { isCalculatingRoute, setIsCalculatingRoute } = useStore();
  const [routeLine, setRouteLine] = useState<[number, number][]>([]);
  const [error, setError] = useState('');
  const [routeInfo, setRouteInfo] = useState<{distance: number, duration: number, legs?: {distance: number, duration: number}[]} | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      L.DomEvent.disableScrollPropagation(containerRef.current);
      L.DomEvent.disableClickPropagation(containerRef.current);
    }
  });

  useEffect(() => {
    if (routePoints.length < 2) {
      setRouteLine([]);
      setRouteInfo(null);
      return;
    }

    const fetchRoute = async () => {
      const startTime = Date.now();
      setError('');
      setRouteInfo(null);
      setIsCalculatingRoute(true);
      try {
        const coords = routePoints.map(p => `${p.location.lng},${p.location.lat}`).join(';');
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);
        if (!res.ok) throw new Error('Route fetch failed');
        const data = await res.json();
        
        // 保证加载动画至少展示 600ms，为“计算中”状态带来清晰顺滑的动画体验
        const elapsed = Date.now() - startTime;
        if (elapsed < 600) {
          await new Promise(r => setTimeout(r, 600 - elapsed));
        }

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
      } finally {
        setIsCalculatingRoute(false);
      }
    };

    fetchRoute();
  }, [routePoints, map, setIsCalculatingRoute]);

  if (routePoints.length < 2) return null;

  return (
    <>
      {routeLine.length > 0 && (
        <Polyline positions={routeLine} color="#3b82f6" weight={6} opacity={0.8} />
      )}
      {uiPortalTarget && createPortal(
        <div 
          ref={containerRef}
          className="absolute inset-x-4 sm:inset-auto sm:left-6 z-2001 bg-[#25282c]/95 border border-white/10 backdrop-blur px-4 py-3.5 shadow-2xl rounded-lg flex flex-col items-center gap-3 sm:min-w-77.5 sm:max-w-95 overflow-y-auto pointer-events-auto"
          style={{ 
            top: 'max(5rem, env(safe-area-inset-top,0px) + 3.5rem)',
            maxHeight: 'calc(100dvh - max(5rem, env(safe-area-inset-top,0px) + 3.5rem) - max(1.5rem, env(safe-area-inset-bottom,0px)) - 4rem)'
          }}
        >
        <div className="flex items-center gap-4 w-full justify-between border-b border-white/10 pb-2.5">
          <div className="flex items-center gap-2 text-white font-bold text-xs tracking-wider">
            <RouteIcon className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>路线规划 ({routePoints.length} 个点)</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-1 bg-white/5 hover:bg-white/10 rounded text-white/60 hover:text-white transition-colors">
              {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
            <button onClick={onClear} className="p-1 bg-white/5 hover:bg-white/10 rounded text-white/60 hover:text-white transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        
        {!isCollapsed && (
          isCalculatingRoute ? (
            <div className="py-8 flex flex-col items-center justify-center gap-3 w-full text-white/70">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              <span className="text-xs font-bold text-emerald-400">正在计算多点路线及耗时...</span>
              <span className="text-[10px] text-white/40">规划 {routePoints.length} 个观测点位</span>
            </div>
          ) : (
            <>
              {routeInfo && (
                <div className="flex items-center justify-between w-full text-[11px] text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded">
                  <span className="font-bold">总计</span>
                  <div className="flex items-center gap-2">
                    <span>{(routeInfo.distance / 1000).toFixed(1)} km</span>
                    <span className="w-1 h-1 rounded-full bg-emerald-500/50"></span>
                    <span>{formatDuration(routeInfo.duration)}</span>
                  </div>
                </div>
              )}
              
              {error && <span className="text-red-400 text-[10px] font-bold uppercase tracking-widest">{error}</span>}
  
              {/* 分段统计：改成地名/鸟点名称，并以两个分块呈现：第一块名称指示，第二块路程与耗时 */}
              {routeInfo?.legs && routeInfo.legs.length > 0 && (
                <div className="flex flex-col gap-2.5 w-full mt-1 border-t border-white/10 pt-3">
                  <span className="text-[10px] text-white/50 font-bold uppercase tracking-widest mb-0.5">分段统计</span>
                  {routeInfo.legs.map((leg, i) => {
                    const fromName = routePoints[i]?.name || `地点 ${i + 1}`;
                    const toName = routePoints[i + 1]?.name || `地点 ${i + 2}`;
  
                    return (
                      <div 
                        key={i} 
                        className="flex flex-col gap-2 bg-black/30 border border-white/5 hover:border-white/10 p-2.5 rounded transition-colors"
                      >
                        {/* 第一块：“地点A -> 地点B”的名称指示 */}
                        <div className="text-xs font-bold text-white/90 leading-relaxed wrap-break-word flex items-center flex-wrap gap-1.5">
                          <span className="text-emerald-400 font-normal text-[10px] bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded shrink-0">
                            {i + 1}
                          </span>
                          <span className="text-white">{fromName}</span>
                          <span className="text-emerald-400 font-bold mx-0.5 shrink-0">➔</span>
                          <span className="text-emerald-400 font-normal text-[10px] bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded shrink-0">
                            {i + 2}
                          </span>
                          <span className="text-white">{toName}</span>
                        </div>
  
                        {/* 第二块：“路程长度 + 耗时统计” 及导航按钮 */}
                        <div className="flex items-center justify-between text-[11px] font-mono text-emerald-400/90 bg-white/5 px-2.5 py-1.5 rounded w-full">
                          <span className="text-[10px] text-white/40 font-sans font-normal">段距与估时</span>
                          <div className="flex items-center gap-2">
                            <span>{(leg.distance / 1000).toFixed(1)} km</span>
                            <span className="w-1 h-1 rounded-full bg-emerald-400/50"></span>
                            <span>{formatDuration(leg.duration)}</span>
                            <button
                              onClick={() => onOpenNavModal(routePoints[i], routePoints[i + 1])}
                              className="ml-2 bg-emerald-500 hover:bg-emerald-400 text-black p-1 rounded transition-colors shadow-sm"
                              title="导航软件"
                            >
                              <Navigation2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )
        )}
      </div>,
      uiPortalTarget
      )}
    </>
  );
}

function BirdHotspots({ 
  onSelectHotspot,
  savedEbirdLocIds,
  highlightedLocIds
}: { 
  onSelectHotspot: (hotspot: EbirdHotspot) => void;
  savedEbirdLocIds: string[];
  highlightedLocIds: Set<string> | null;
}) {
  const { cachedHotspots, hotspotFilterDays, showSavedHotspotsOnly } = useStore();

  const displayHotspots = useMemo(() => {
    if (showSavedHotspotsOnly) return [];
    
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
  }, [cachedHotspots, hotspotFilterDays, savedEbirdLocIds, showSavedHotspotsOnly]);

  return (
    <>
      {displayHotspots.map(h => {
        const gcj = wgs84ToGcj02(h.lat, h.lng);
        const colorCategory = getHotspotColorCategory(h.latestObsDt);

        const isHighlighted = highlightedLocIds ? highlightedLocIds.has(h.locId) : true;

        return (
          <Marker 
            key={h.locId} 
            position={[gcj.lat, gcj.lng]}
            icon={ebirdIcons[colorCategory]}
            opacity={highlightedLocIds ? (isHighlighted ? 1 : 0.2) : 1}
            zIndexOffset={highlightedLocIds && isHighlighted ? 1000 : 0}
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
    <div className="p-2 min-w-45">
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
  removeSavedPoint,
  onPointClick
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
            className="cursor-grab touch-none text-white/30 hover:text-white/60 p-1 -ml-2 active:cursor-grabbing"
            title="拖动排序"
          >
            <GripVertical className="w-4 h-4" />
          </div>
          <div className={cn("shrink-0", point.type === 'ebird' ? "text-emerald-400" : (point.type === 'my-location' ? "text-purple-400" : "text-blue-400"))}>
            {point.type === 'ebird' ? <Bird className="w-5 h-5" fill="currentColor" /> : (point.type === 'my-location' ? <User className="w-5 h-5" fill="currentColor" /> : <MapPin className="w-5 h-5" fill="currentColor" />)}
          </div>
          <div className="truncate flex-1 pr-2">
            {isEditing && point.type === 'custom' ? (
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
                  if (point.type === 'custom') {
                    setEditingPointId(point.id);
                    setEditNameValue(point.name);
                  } else {
                    onPointClick(point);
                  }
                }}
                title={point.type === 'custom' ? "点击修改名称" : "点击查看信息"}
              >
                {point.name}
              </p>
            )}
            <p className="text-[9px] uppercase tracking-widest text-white/40">{point.type === 'ebird' ? 'eBird 热点' : (point.type === 'my-location' ? '我的位置' : '自定义')}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
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

function CustomScales() {
  const map = useMap();
  const [scaleSize, setScaleSize] = useState(0);
  const [scaleText, setScaleText] = useState('');
  
  const updateScale = useCallback(() => {
    if (!map) return;
    const maxWidth = 100;
    const p1 = map.containerPointToLatLng([0, 0]);
    const p2 = map.containerPointToLatLng([maxWidth, 0]);
    const dist = p1.distanceTo(p2);
    
    let niceDist = 0;
    if (dist > 0) {
      const pow10 = Math.pow(10, Math.floor(Math.log10(dist)));
      let d = dist / pow10;
      let multiplier = 1;
      if (d >= 10) multiplier = 10;
      else if (d >= 5) multiplier = 5;
      else if (d >= 3) multiplier = 3;
      else if (d >= 2) multiplier = 2;
      else multiplier = 1;
      
      niceDist = pow10 * multiplier;
    }
    
    const text = niceDist < 1000 ? niceDist + ' m' : (niceDist / 1000) + ' km';
    const ratio = dist > 0 ? niceDist / dist : 0;
    setScaleSize(maxWidth * ratio);
    setScaleText(text);
  }, [map]);
  
  useEffect(() => {
    updateScale();
    map.on('move', updateScale);
    return () => { map.off('move', updateScale); };
  }, [map, updateScale]);
  
  return createPortal(
    <>
       {/* Horizontal Scale (Top) */}
       <div 
         className="absolute left-1/2 -translate-x-1/2 z-2000 pointer-events-none flex flex-col items-center"
         style={{ top: 'max(4.5rem, env(safe-area-inset-top,0px) + 3rem)' }}
       >
          <div className="text-emerald-400 text-[10px] font-bold mb-0.5 leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" style={{ textShadow: '0px 1px 3px rgba(0,0,0,1), 0px 0px 2px rgba(0,0,0,1)' }}>{scaleText}</div>
          <div className="border-b-2 border-l-2 border-r-2 border-emerald-400 h-1.5 transition-all duration-100 shadow-[0_1px_2px_rgba(0,0,0,0.5)]" style={{ width: scaleSize, backgroundColor: 'rgba(0,0,0,0.3)' }}></div>
       </div>
       
       {/* Vertical Scale (Left) */}
      <div className="absolute left-6 top-1/2 -translate-y-1/2 z-2000 pointer-events-none flex items-center">
          <div className="border-l-2 border-t-2 border-b-2 border-emerald-400 w-1.5 transition-all duration-100 shadow-[0_1px_2px_rgba(0,0,0,0.5)]" style={{ height: scaleSize, backgroundColor: 'rgba(0,0,0,0.3)' }}></div>
          <div className="text-emerald-400 text-[10px] font-bold ml-1 leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', textShadow: '0px 1px 3px rgba(0,0,0,1), 0px 0px 2px rgba(0,0,0,1)' }}>{scaleText}</div>
       </div>
    </>,
    map.getContainer()
  );
}

function MapController({ panTo }: { panTo: (LatLng & { zoom?: number }) | null }) {
  const map = useMap();
  useEffect(() => {
    if (panTo) {
      const gcj = wgs84ToGcj02(panTo.lat, panTo.lng);
      map.flyTo([gcj.lat, gcj.lng], panTo.zoom ?? 14, { duration: 1.5 });
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
    <div ref={wrapperRef} className="absolute top-[max(1.5rem,env(safe-area-inset-top,0px))] left-4 right-4 sm:left-6 sm:right-auto z-2000 sm:w-80">
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
  const { mapLayer, addSavedPoint, removeSavedPoint, savedPoints, trafficEnabled, roadNetEnabled, cachedHotspots, setIsCalculatingRoute, updateMyLocation, cachedObservations, hotspotFilterDays, ebirdToken, updateCachedObservations, selectedProvince } = useStore();
  const [uiPortalTarget, setUiPortalTarget] = useState<HTMLDivElement | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<LatLng | null>(null);
  const [selectedHotspot, setSelectedHotspot] = useState<EbirdHotspot | null>(null);
  const [selectedSavedCustomPoint, setSelectedSavedCustomPoint] = useState<SavedPoint | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [showLeftPanel, setShowLeftPanel] = useState(false);
  const [routePoints, setRoutePoints] = useState<SavedPoint[]>([]);
  const [selectedRouteIds, setSelectedRouteIds] = useState<string[]>([]);
  const [panToLocation, setPanToLocation] = useState<(LatLng & { zoom?: number }) | null>(null);
  const [highlightedLocIds, setHighlightedLocIds] = useState<Set<string> | null>(null);

  // Skip the very first render so the restored/default map view isn't immediately overridden
  // before province auto-detection resolves; fly to the province on every later change.
  const skipInitialProvinceFlyRef = useRef(true);
  useEffect(() => {
    if (skipInitialProvinceFlyRef.current) {
      skipInitialProvinceFlyRef.current = false;
      return;
    }
    const view = PROVINCE_VIEWS[selectedProvince];
    if (view) {
      setPanToLocation({ lat: view.lat, lng: view.lng, zoom: view.zoom });
    }
  }, [selectedProvince]);
  const [navModalTarget, setNavModalTarget] = useState<{
    fromPoint?: SavedPoint | { name: string; location: LatLng };
    toPoint: SavedPoint | { name: string; location: LatLng };
  } | null>(null);

  const handleToggleRouteSelection = (id: string) => {
    setSelectedRouteIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handlePlanRoute = () => {
    setIsCalculatingRoute(true);
    const newRoute = savedPoints
      .filter(p => selectedRouteIds.includes(p.id));
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

  const [mapCenter, setMapCenter] = useState<L.LatLngTuple>(initialMapState.center as L.LatLngTuple);

  const fetchHotspotObs = useCallback(async (locId: string) => {
    if (!ebirdToken) return;
    try {
      const res = await fetch(`https://api.ebird.org/v2/data/obs/${locId}/recent?back=30&sppLocale=zh_SIM`, {
        headers: { 'X-eBirdApiToken': ebirdToken }
      });
      if (res.ok) {
        const data = await res.json();
        updateCachedObservations(data);
      }
    } catch (err) {
      console.error('Failed to fetch hotspot obs', err);
    }
  }, [ebirdToken, updateCachedObservations]);

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

  // Handle geolocation tracking
  useEffect(() => {
    let watchId: number;
    const isTracking = savedPoints.some(p => p.type === 'my-location');
    if (isTracking) {
      watchId = navigator.geolocation.watchPosition(
        pos => {
          updateMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        err => console.error(err),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
      );
    }
    return () => {
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
    };
  }, [savedPoints.some(p => p.type === 'my-location'), updateMyLocation]);

  const tileUrl = useMemo(() => {
    if (mapLayer === 'satellite') {
      return 'https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}';
    }
    return 'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}';
  }, [mapLayer]);

  // Transparent road network and labels overlay for Gaode Satellite/Terrain
  const roadNetUrl = useMemo(() => {
    if ((mapLayer === 'satellite') && roadNetEnabled) {
      return 'https://webst01.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}';
    }
    return null;
  }, [mapLayer, roadNetEnabled]);

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
      
      <WeatherWidget lat={mapCenter[0]} lng={mapCenter[1]} />

      <div ref={setUiPortalTarget} className="absolute inset-0 pointer-events-none z-1000" />

      {/* Brand Header Badge */}
      <div 
        className="absolute right-6 z-2000 hidden sm:flex items-center gap-3 bg-[#25282c]/90 backdrop-blur-md px-3.5 py-2 rounded-lg border border-white/10 shadow-2xl pointer-events-auto"
        style={{ top: 'max(1.5rem, env(safe-area-inset-top,0px))' }}
      >
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
        <CustomScales />

        <MapEvents 
          onMapClick={handleMapClick}
          onMapChange={(center, zoom) => {
            setMapCenter([center.lat, center.lng]);
            localStorage.setItem('mapState', JSON.stringify({
              center: [center.lat, center.lng],
              zoom
            }));
          }}
        />
        
        <RouteDisplay uiPortalTarget={uiPortalTarget} routePoints={routePoints} onClear={() => {
          setRoutePoints([]);
          setSelectedRouteIds([]);
        }} onOpenNavModal={(fromPoint, toPoint) => setNavModalTarget({ fromPoint, toPoint })} />
        
        <BirdHotspots 
          savedEbirdLocIds={savedEbirdLocIds}
          highlightedLocIds={highlightedLocIds}
          onSelectHotspot={(h) => {
            setSelectedHotspot(h);
            fetchHotspotObs(h.locId);
            setSelectedLocation(null);
          }} 
        />

        {savedPoints.filter(p => {
          if (p.type !== 'ebird' || !p.ebirdLocId) return true;
          if (hotspotFilterDays === null) return true;
          const h = cachedHotspots[p.ebirdLocId];
          if (!h || !h.latestObsDt) return false;
          const obsDate = new Date(h.latestObsDt.replace(' ', 'T'));
          if (isNaN(obsDate.getTime())) return false;
          const diffDays = (Date.now() - obsDate.getTime()) / (1000 * 60 * 60 * 24);
          return diffDays <= hotspotFilterDays;
        }).map(p => {
          const gcj = wgs84ToGcj02(p.location.lat, p.location.lng);
          const isSelected = selectedRouteIds.includes(p.id);
          
          const isHighlighted = highlightedLocIds ? (p.type === 'ebird' && p.ebirdLocId ? highlightedLocIds.has(p.ebirdLocId) : false) : true;
          const opacity = highlightedLocIds ? (isHighlighted ? 1 : 0.2) : 1;
          const zIndexOffset = highlightedLocIds && isHighlighted ? 1000 : (isSelected ? 500 : 0);
          
          let icon = icons.custom;
          if (isSelected) icon = icons.route;
          else if (p.type === 'my-location') icon = icons.mylocation;

          return (
            <Marker 
              key={p.id} 
              position={[gcj.lat, gcj.lng]} 
              icon={icon}
              opacity={opacity}
              zIndexOffset={zIndexOffset}
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
                    fetchHotspotObs(p.ebirdLocId!);
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
              <div className="p-1 min-w-50">
                <h3 className="font-bold text-black mb-1">{selectedSavedCustomPoint.name}</h3>
                <p className="text-[10px] font-bold text-slate-500 mb-3">自定义点位</p>
                <div className="flex flex-col gap-1.5">
                  <button 
                    onClick={() => setNavModalTarget({ toPoint: selectedSavedCustomPoint })}
                    className="w-full py-1.5 px-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Navigation2 className="w-3.5 h-3.5" />
                    <span>导航路线</span>
                  </button>
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
          
          let currentFilteredObs = cachedObservations;
          if (hotspotFilterDays !== null) {
            currentFilteredObs = currentFilteredObs.filter(o => {
              if (!o.obsDt) return false;
              const obsDate = new Date(o.obsDt.replace(' ', 'T'));
              if (isNaN(obsDate.getTime())) return false;
              const diffDays = (Date.now() - obsDate.getTime()) / (1000 * 60 * 60 * 24);
              return diffDays <= hotspotFilterDays;
            });
          }
          const hotspotObs = currentFilteredObs.filter(o => o.locId === selectedHotspot.locId);
          const speciesSet = new Set(hotspotObs.map(o => o.speciesCode));
          const totalSpeciesCount = selectedHotspot.numSpeciesAllTime ?? '未知';

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
              <div className="p-1 min-w-50">
                <h3 className="font-bold text-black mb-1">{selectedHotspot.locName}</h3>
                <p className="text-[10px] font-bold text-slate-500 mb-2">eBird 热点</p>
                <div className="text-[10px] text-slate-600 mb-3 space-y-1 bg-slate-100 p-2 rounded">
                  <p>历史鸟种: <span className="font-bold text-slate-800">{totalSpeciesCount}</span> 种</p>
                  {speciesSet.size > 0 && (
                    <p>近期已加载: <span className="font-bold text-emerald-600">{speciesSet.size}</span> 种记录</p>
                  )}
                  <p>最后记录: <span className="font-bold text-slate-800">{selectedHotspot.latestObsDt ?? '无'}</span></p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <button 
                    onClick={() => setNavModalTarget({ toPoint: { name: selectedHotspot.locName, location: { lat: selectedHotspot.lat, lng: selectedHotspot.lng } } })}
                    className="w-full py-1.5 px-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Navigation2 className="w-3.5 h-3.5" />
                    <span>导航路线</span>
                  </button>
                  <button 
                    onClick={handleToggleSaveHotspot}
                    className={cn(
                      "w-full py-1.5 px-3 rounded text-xs font-bold transition-colors",
                      isSaved 
                        ? "bg-red-500/10 text-red-600 hover:bg-red-500 hover:text-white" 
                        : "bg-slate-200 hover:bg-slate-300 text-slate-800"
                    )}
                  >
                    {isSaved ? '移除点位' : '保存到我的点位'}
                  </button>
                </div>
              </div>
            </Popup>
          );
        })()}
      </MapContainer>

      {/* Floating Controls */}
      {!showDrawer && (
        <button 
          onClick={() => setShowDrawer(true)}
          className="absolute right-4 sm:right-6 z-2005 w-12 h-12 bg-[#25282c] border border-white/10 rounded-full sm:rounded overflow-hidden shadow-2xl flex items-center justify-center text-white/80 hover:text-white hover:bg-[#32363b] active:scale-95 transition-all select-none"
          style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom,0px))' }}
          title="设置与数据管理"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      {!showLeftPanel && (
        <button 
          onClick={() => setShowLeftPanel(true)}
          className="absolute left-4 sm:left-6 z-2005 px-4 h-12 bg-[#25282c] border border-white/10 rounded-full sm:rounded shadow-2xl flex items-center justify-center gap-2 text-white/80 hover:text-white hover:bg-[#32363b] active:scale-95 transition-all font-bold text-sm select-none"
          style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom,0px))' }}
          title="鸟种 / 鸟点分析"
        >
          <List className="w-4 h-4 text-emerald-400" />
          <span className="hidden sm:inline">鸟种 / 鸟点分析</span>
          <span className="sm:hidden">分析</span>
        </button>
      )}

      {showDrawer && <Sidebar 
        onClose={() => setShowDrawer(false)} 
        selectedRouteIds={selectedRouteIds}
        setSelectedRouteIds={setSelectedRouteIds}
        onPlanRoute={handlePlanRoute}
        onPointClick={(p) => {
          if (p.type === 'ebird' && p.ebirdLocId) {
            const hotspot = cachedHotspots[p.ebirdLocId] || {
              locId: p.ebirdLocId,
              locName: p.name,
              lat: p.location.lat,
              lng: p.location.lng,
            };
            setSelectedHotspot(hotspot);
            fetchHotspotObs(p.ebirdLocId);
            setPanToLocation({ lat: p.location.lat, lng: p.location.lng });
            setSelectedLocation(null);
            setSelectedSavedCustomPoint(null);
          } else {
            setSelectedSavedCustomPoint(p);
            setSelectedHotspot(null);
            setSelectedLocation(null);
            setPanToLocation({ lat: p.location.lat, lng: p.location.lng });
          }
        }}
      />}

      {showLeftPanel && <LeftPanel 
        onClose={() => {
          setShowLeftPanel(false);
          setHighlightedLocIds(null);
        }} 
        savedEbirdLocIds={savedEbirdLocIds} 
        onHighlightLocations={setHighlightedLocIds}
        fetchHotspotObs={fetchHotspotObs}
        onPanTo={(lat, lng) => setPanToLocation({ lat, lng })}
      />}

      {navModalTarget && (
        <NavigationModal 
          target={navModalTarget} 
          onClose={() => setNavModalTarget(null)} 
        />
      )}
    </div>
  );
}

function Sidebar({ 
  onClose, 
  selectedRouteIds, 
  setSelectedRouteIds,
  onPlanRoute,
  onPointClick
}: { 
  onClose: () => void, 
  selectedRouteIds: string[], 
  setSelectedRouteIds: (ids: string[]) => void,
  onPlanRoute: () => void,
  onPointClick: (p: SavedPoint) => void
}) {
  const { 
    mapLayer, setMapLayer, trafficEnabled, setTrafficEnabled, roadNetEnabled, setRoadNetEnabled, ebirdToken, setEbirdToken, 
    savedPoints, removeSavedPoint, updateSavedPointName, hotspotFilterDays, setHotspotFilterDays, updateMyLocation,
    cachedHotspots, updateCachedHotspots, isCalculatingRoute,
    cachedObservations, updateCachedObservations, clearProvinceData,
    showSavedHotspotsOnly, setShowSavedHotspotsOnly,
    selectedProvince, setSelectedProvince
  } = useStore();
  const [tokenInput, setTokenInput] = useState(ebirdToken);
  const [editingPointId, setEditingPointId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  
  const [isFetchingHotspots, setIsFetchingHotspots] = useState(false);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  const [layersExpanded, setLayersExpanded] = useState(true);
  const [ebirdExpanded, setEbirdExpanded] = useState(true);
  
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);
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

  const handleClearProvinceData = () => {
    setShowConfirmClear(true);
  };

  const confirmClearProvinceData = () => {
    clearProvinceData(selectedProvince);
    setShowConfirmClear(false);
    setToastMessage('已清理，请重新查询所需的省份以刷新鸟种数据。');
  };

  const handleFetchProvinceHotspots = async () => {
    if (!ebirdToken) {
      setToastMessage("请先输入 API 令牌");
      return;
    }
    setIsFetchingHotspots(true);
    try {
      const [hotspotsRes, obsRes] = await Promise.all([
        fetch(`https://api.ebird.org/v2/ref/hotspot/${selectedProvince}?fmt=json`, {
          headers: { 'X-eBirdApiToken': ebirdToken }
        }),
        fetch(`https://api.ebird.org/v2/data/obs/${selectedProvince}/recent?back=30&sppLocale=zh_SIM`, {
          headers: { 'X-eBirdApiToken': ebirdToken }
        })
      ]);

      if (hotspotsRes.ok && obsRes.ok) {
        const hotspotsData = await hotspotsRes.json();
        const obsData = await obsRes.json();
        
        const hotspotsWithProvince = hotspotsData.map((h: any) => ({...h, provinceCode: selectedProvince}));
        
        updateCachedHotspots(hotspotsWithProvince);
        updateCachedObservations(obsData);
        
        setToastMessage(`成功刷新 ${hotspotsData.length} 个热点及近30天鸟种记录`);
      } else {
        setToastMessage("获取失败，请检查令牌或网络");
      }
    } catch (e) {
      console.error(e);
      setToastMessage("获取失败");
    } finally {
      setIsFetchingHotspots(false);
    }
  };

  return (
    <div className="absolute top-0 right-0 h-full w-full sm:w-80 bg-[#25282c] backdrop-blur-xl shadow-2xl z-2000 flex flex-col transform transition-transform border-l border-white/10">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-3000 bg-emerald-500 text-black px-4 py-2 rounded shadow-xl text-xs font-bold whitespace-nowrap animate-in fade-in slide-in-from-top-4">
          {toastMessage}
        </div>
      )}

      {/* Confirm Clear Modal */}
      {showConfirmClear && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-3000 flex items-center justify-center p-4">
          <div className="bg-[#25282c] border border-white/10 rounded-xl p-5 shadow-2xl max-w-70">
            <h4 className="text-red-400 font-bold mb-3 flex items-center gap-2">
              <span className="bg-red-500/20 p-1.5 rounded-full"><X className="w-4 h-4" /></span>
              确认清理
            </h4>
            <p className="text-xs text-white/70 mb-5 leading-relaxed">
              确定要清理省份 "{CHINA_PROVINCES.find(p => p.code === selectedProvince)?.name}" 的所有热点数据吗？这同时会清空所有鸟种分析记录。
            </p>
            <div className="flex gap-2">
              <button 
                onClick={() => setShowConfirmClear(false)}
                className="flex-1 px-3 py-2 bg-white/5 text-white/70 hover:bg-white/10 rounded text-xs font-bold transition-colors"
              >
                取消
              </button>
              <button 
                onClick={confirmClearProvinceData}
                className="flex-1 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded text-xs font-bold transition-colors"
              >
                确定清理
              </button>
            </div>
          </div>
        </div>
      )}

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
        
        {/* Layer Group */}
        <section className="bg-black/20 border border-white/5 rounded-lg overflow-hidden">
          <button 
            onClick={() => setLayersExpanded(!layersExpanded)}
            className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2 text-white/80">
              <Layers className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-widest">地图图层 & 叠加</h3>
            </div>
            {layersExpanded ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
          </button>
          
          {layersExpanded && (
            <div className="p-4 pt-0 space-y-4 border-t border-white/5 mt-4">
              <div>
                <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">基础地图</h4>
                <div className="grid grid-cols-2 gap-2">
                  {(['roadmap', 'satellite'] as MapLayer[]).map(layer => {
                    const layerName = layer === 'roadmap' ? '标准地图' : '卫星地图';
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
                        {layerName}
                      </button>
                    );
                  })}
                </div>
              </div>
              
              <div>
                <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">图层叠加</h4>
                <div className="space-y-2">
                  <button
                    onClick={() => setTrafficEnabled(!trafficEnabled)}
                    className={cn(
                      "w-full flex items-center justify-between p-2 rounded border transition-all",
                      trafficEnabled ? "bg-orange-500/20 border-orange-500/50 text-orange-400" : "bg-black/30 border-white/5 text-white/60 hover:bg-black/40"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <TrafficCone className={cn("w-4 h-4", trafficEnabled ? "text-orange-400" : "text-white/40")} />
                      <span className="font-bold text-xs">实时路况</span>
                    </div>
                  </button>
                  
                  <button
                    onClick={() => {
                      const isTracking = savedPoints.some(p => p.type === 'my-location');
                      if (isTracking) {
                        updateMyLocation(null);
                      } else {
                        if (navigator.geolocation) {
                          navigator.geolocation.getCurrentPosition(
                            pos => updateMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                            err => setToastMessage('获取位置失败: ' + err.message),
                            { enableHighAccuracy: true }
                          );
                        }
                      }
                    }}
                    className={cn(
                      "w-full flex items-center justify-between p-2 rounded border transition-all",
                      savedPoints.some(p => p.type === 'my-location') ? "bg-purple-500/20 border-purple-500/50 text-purple-400" : "bg-black/30 border-white/5 text-white/60 hover:bg-black/40"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <User className={cn("w-4 h-4", savedPoints.some(p => p.type === 'my-location') ? "text-purple-400" : "text-white/40")} />
                      <span className="font-bold text-xs">{savedPoints.some(p => p.type === 'my-location') ? '我的位置 (更新中)' : '我的位置'}</span>
                    </div>
                  </button>
                  
                  {mapLayer === 'satellite' && (
                    <button
                      onClick={() => setRoadNetEnabled(!roadNetEnabled)}
                      className={cn(
                        "w-full flex items-center justify-between p-2 rounded border transition-all",
                        !roadNetEnabled ? "bg-blue-500/20 border-blue-500/50 text-blue-400" : "bg-black/30 border-white/5 text-white/60 hover:bg-black/40"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <EyeOff className={cn("w-4 h-4", !roadNetEnabled ? "text-blue-400" : "text-white/40")} />
                        <span className="font-bold text-xs">隐藏地名与道路</span>
                      </div>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* eBird Settings */}
        <section className="bg-black/20 border border-white/5 rounded-lg overflow-hidden">
          <button 
            onClick={() => setEbirdExpanded(!ebirdExpanded)}
            className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2 text-white/80">
              <Bird className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-widest">eBird 数据源</h3>
            </div>
            {ebirdExpanded ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
          </button>
          
          {ebirdExpanded && (
            <div className="p-4 pt-0 space-y-4 border-t border-white/5 mt-4">
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
                  className="w-1/2 bg-black/50 border border-white/10 rounded px-2 py-1.5 text-sm outline-none focus:border-emerald-500 transition-all text-white"
                >
                  {CHINA_PROVINCES.map(p => (
                    <option key={p.code} value={p.code}>{p.name}</option>
                  ))}
                </select>
                <button 
                  onClick={handleFetchProvinceHotspots}
                  disabled={isFetchingHotspots}
                  className="flex-1 bg-emerald-500 text-black px-2 py-1.5 rounded text-xs font-bold hover:bg-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isFetchingHotspots ? <Loader2 className="w-4 h-4 animate-spin" /> : '查询'}
                </button>
                <button 
                  onClick={handleClearProvinceData}
                  disabled={isFetchingHotspots}
                  className="flex-1 bg-red-500/20 text-red-400 px-2 py-1.5 rounded text-xs font-bold hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center border border-red-500/30"
                >
                  清理
                </button>
              </div>
              <p className="text-[10px] text-white/40 leading-relaxed mb-4">
                数据将被缓存，可在地图上查看。已缓存: {Object.keys(cachedHotspots).length} 个热点。每次查询会自动更新。
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
          )}
        </section>

        {/* Saved Points */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-white/30 uppercase tracking-widest flex items-center gap-2">
              已保存的点位
              <label className="flex items-center gap-1.5 cursor-pointer normal-case tracking-normal ml-2 group">
                <input 
                  type="checkbox" 
                  checked={showSavedHotspotsOnly} 
                  onChange={(e) => setShowSavedHotspotsOnly(e.target.checked)} 
                  className="w-3 h-3 text-emerald-500 rounded bg-white/10 border-transparent focus:ring-emerald-500 cursor-pointer"
                />
                <span className="text-[10px] text-white/50 group-hover:text-white/80 transition-colors">只查看已保存点位</span>
              </label>
            </h3>
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
                        onPointClick={onPointClick}
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
              disabled={selectedRouteIds.length < 2 || isCalculatingRoute}
              className="mt-4 w-full py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-white/5 disabled:text-white/30 disabled:cursor-not-allowed text-black font-bold text-xs rounded transition-colors flex items-center justify-center gap-2"
            >
              {isCalculatingRoute ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                  <span className="text-emerald-500">计算中...</span>
                </>
              ) : (
                <>
                  <RouteIcon className="w-4 h-4" />
                  {selectedRouteIds.length < 2 ? '请选择至少2个点位进行规划' : '线路规划和耗时统计'}
                </>
              )}
            </button>
          )}
        </section>

      </div>
    </div>
  );
}

function LeftPanel({ 
  onClose, 
  savedEbirdLocIds,
  onHighlightLocations,
  fetchHotspotObs,
  onPanTo
}: { 
  onClose: () => void, 
  savedEbirdLocIds: string[],
  onHighlightLocations: (locIds: Set<string> | null) => void,
  fetchHotspotObs: (locId: string) => void,
  onPanTo: (lat: number, lng: number) => void
}) {
  const { cachedObservations, hotspotFilterDays, showSavedHotspotsOnly, cachedHotspots } = useStore();
  const [activeTab, setActiveTab] = useState<'species' | 'hotspots'>('species');
  const [expandedHotspot, setExpandedHotspot] = useState<string | null>(null);
  
  const [speciesQuery, setSpeciesQuery] = useState('');
  const [hotspotQuery, setHotspotQuery] = useState('');
  const [selectedSpeciesCode, setSelectedSpeciesCode] = useState<string | null>(null);

  useEffect(() => {
    setSelectedSpeciesCode(null);
    setExpandedHotspot(null);
    onHighlightLocations(null);
  }, [activeTab, onHighlightLocations]);

  const filteredObs = useMemo(() => {
    let list = cachedObservations || [];

    if (showSavedHotspotsOnly) {
      list = list.filter(o => savedEbirdLocIds.includes(o.locId));
    }
    
    if (hotspotFilterDays !== null) {
      list = list.filter(o => {
        if (!o.obsDt) return false;
        const obsDate = new Date(o.obsDt.replace(' ', 'T'));
        if (isNaN(obsDate.getTime())) return false;
        const diffDays = (Date.now() - obsDate.getTime()) / (1000 * 60 * 60 * 24);
        return diffDays <= hotspotFilterDays;
      });
    }
    
    return list;
  }, [cachedObservations, showSavedHotspotsOnly, savedEbirdLocIds, hotspotFilterDays]);

  const speciesData = useMemo(() => {
    const map = new Map<string, {
      code: string,
      name: string,
      count: number,
      latestDt: string,
      locations: Set<string>,
      locIds: Set<string>
    }>();
    
    const totalRecords = filteredObs.length;

    filteredObs.forEach(o => {
      if (!map.has(o.speciesCode)) {
        map.set(o.speciesCode, {
          code: o.speciesCode,
          name: o.comName,
          count: 0,
          latestDt: o.obsDt,
          locations: new Set(),
          locIds: new Set()
        });
      }
      const entry = map.get(o.speciesCode)!;
      entry.count += (o.howMany || 1);
      if (o.obsDt > entry.latestDt) {
        entry.latestDt = o.obsDt;
      }
      entry.locations.add(o.locName);
      entry.locIds.add(o.locId);
    });

    return Array.from(map.values()).sort((a, b) => b.latestDt.localeCompare(a.latestDt)).map(s => {
      let rarity = "常见";
      const freq = s.count / (totalRecords || 1);
      if (s.count <= 2) rarity = "极稀有";
      else if (s.count <= 5) rarity = "稀有";
      else if (freq < 0.01) rarity = "少见";
      
      return { ...s, rarity };
    });
  }, [filteredObs]);

  const filteredSpeciesData = useMemo(() => {
    if (!speciesQuery.trim()) return speciesData;
    const q = speciesQuery.toLowerCase();
    return speciesData.filter(s => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q));
  }, [speciesData, speciesQuery]);

  const hotspotsData = useMemo(() => {
    const map = new Map<string, {
      locId: string,
      name: string,
      latestDt: string,
      species: Set<string>,
      obs: typeof filteredObs,
      numSpeciesAllTime?: number
    }>();

    let baseHotspots = Object.values(cachedHotspots) as EbirdHotspot[];
    
    if (showSavedHotspotsOnly) {
      baseHotspots = baseHotspots.filter(h => savedEbirdLocIds.includes(h.locId));
    }
    
    if (hotspotFilterDays !== null) {
      baseHotspots = baseHotspots.filter(h => {
        if (!h.latestObsDt) return false;
        const obsDate = new Date(h.latestObsDt.replace(' ', 'T'));
        if (isNaN(obsDate.getTime())) return false;
        const diffDays = (Date.now() - obsDate.getTime()) / (1000 * 60 * 60 * 24);
        return diffDays <= hotspotFilterDays;
      });
    }

    baseHotspots.forEach(h => {
      map.set(h.locId, {
        locId: h.locId,
        name: h.locName,
        latestDt: h.latestObsDt || '无',
        species: new Set(),
        obs: [],
        numSpeciesAllTime: h.numSpeciesAllTime
      });
    });

    filteredObs.forEach(o => {
      if (!map.has(o.locId)) {
        map.set(o.locId, {
          locId: o.locId,
          name: o.locName,
          latestDt: o.obsDt,
          species: new Set(),
          obs: []
        });
      }
      const entry = map.get(o.locId)!;
      entry.species.add(o.speciesCode);
      entry.obs.push(o);
      if (entry.latestDt === '无' || o.obsDt > entry.latestDt) {
        entry.latestDt = o.obsDt;
      }
    });

    return Array.from(map.values()).sort((a, b) => b.latestDt.localeCompare(a.latestDt));
  }, [filteredObs, cachedHotspots, showSavedHotspotsOnly, savedEbirdLocIds, hotspotFilterDays]);

  const filteredHotspotsData = useMemo(() => {
    if (!hotspotQuery.trim()) return hotspotsData;
    const q = hotspotQuery.toLowerCase();
    return hotspotsData.filter(h => h.name.toLowerCase().includes(q));
  }, [hotspotsData, hotspotQuery]);

  // Handle species selection change
  useEffect(() => {
    if (activeTab === 'species') {
      if (selectedSpeciesCode) {
        const species = speciesData.find(s => s.code === selectedSpeciesCode);
        if (species) {
          onHighlightLocations(species.locIds);
        }
      } else {
        onHighlightLocations(null);
      }
    }
  }, [selectedSpeciesCode, activeTab, speciesData, onHighlightLocations]);

  return (
    <div className="absolute top-0 left-0 h-full w-full sm:w-96 bg-[#25282c] backdrop-blur-xl shadow-2xl z-2000 flex flex-col transform transition-transform border-r border-white/10">
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight text-emerald-400 flex items-center gap-2">
          <List className="w-5 h-5" />
          鸟种/鸟点分析
        </h2>
        <button onClick={onClose} className="p-2 -mr-2 text-white/40 hover:text-white/80 hover:bg-white/5 rounded-full transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex border-b border-white/10 shrink-0">
        <button 
          onClick={() => setActiveTab('species')}
          className={cn(
            "flex-1 py-3 text-xs font-bold transition-colors",
            activeTab === 'species' ? "text-emerald-400 border-b-2 border-emerald-400 bg-emerald-400/5" : "text-white/50 hover:text-white/80 hover:bg-white/5"
          )}
        >
          鸟种记录 ({filteredSpeciesData.length})
        </button>
        <button 
          onClick={() => setActiveTab('hotspots')}
          className={cn(
            "flex-1 py-3 text-xs font-bold transition-colors",
            activeTab === 'hotspots' ? "text-emerald-400 border-b-2 border-emerald-400 bg-emerald-400/5" : "text-white/50 hover:text-white/80 hover:bg-white/5"
          )}
        >
          观鸟点位 ({filteredHotspotsData.length})
        </button>
      </div>

      {activeTab === 'species' && (
        <div className="px-4 py-2 border-b border-white/10 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input
              type="text"
              placeholder="搜索鸟种名称或编码..."
              value={speciesQuery}
              onChange={(e) => setSpeciesQuery(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-md pl-9 pr-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-emerald-500/50 outline-none transition-colors"
            />
          </div>
        </div>
      )}
      
      {activeTab === 'hotspots' && (
        <div className="px-4 py-2 border-b border-white/10 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input
              type="text"
              placeholder="搜索鸟点名称..."
              value={hotspotQuery}
              onChange={(e) => setHotspotQuery(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-md pl-9 pr-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-emerald-500/50 outline-none transition-colors"
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'species' && (
          <div className="space-y-3">
            {filteredSpeciesData.length === 0 ? (
              <p className="text-center text-xs text-white/40 py-8">无匹配鸟种，请尝试放宽过滤条件</p>
            ) : (
              filteredSpeciesData.map((s, idx) => (
                <div 
                  key={s.code} 
                  className={cn(
                    "bg-black/20 border rounded-lg p-3 hover:border-emerald-500/50 transition-colors cursor-pointer",
                    selectedSpeciesCode === s.code ? "border-emerald-500 bg-emerald-500/10" : "border-white/5"
                  )}
                  onClick={() => setSelectedSpeciesCode(selectedSpeciesCode === s.code ? null : s.code)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">{idx + 1}</span>
                      <h4 className="font-bold text-sm text-white/90">{s.name}</h4>
                    </div>
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded font-bold border",
                      s.rarity === '极稀有' ? "bg-red-500/10 text-red-400 border-red-500/20" : 
                      s.rarity === '稀有' ? "bg-orange-500/10 text-orange-400 border-orange-500/20" :
                      s.rarity === '少见' ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" :
                      "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    )}>{s.rarity}</span>
                  </div>
                  <div className="space-y-1 text-xs text-white/60">
                    <p className="flex justify-between"><span className="text-white/40">最近观测:</span> <span>{s.latestDt}</span></p>
                    <p className="flex justify-between"><span className="text-white/40">累计数量:</span> <span>{s.count} 只</span></p>
                    <p className="flex justify-between items-start">
                      <span className="text-white/40 w-16 shrink-0">分布点位:</span> 
                      <span className="text-right ml-4 line-clamp-2" title={Array.from(s.locations).join(', ')}>
                        {Array.from(s.locations).join(', ')}
                      </span>
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'hotspots' && (
          <div className="space-y-3">
            {filteredHotspotsData.length === 0 ? (
              <p className="text-center text-xs text-white/40 py-8">无匹配点位，请尝试放宽过滤条件</p>
            ) : (
              filteredHotspotsData.map((h, idx) => (
                <div 
                  key={h.locId} 
                  className={cn(
                    "bg-black/20 border rounded-lg overflow-hidden transition-colors hover:border-emerald-500/50",
                    expandedHotspot === h.locId ? "border-emerald-500 bg-emerald-500/10" : "border-white/5"
                  )}
                >
                  <div 
                    className={cn("p-3 cursor-pointer flex items-center justify-between hover:bg-white/5")}
                    onClick={() => {
                      if (expandedHotspot === h.locId) {
                        setExpandedHotspot(null);
                        onHighlightLocations(null);
                      } else {
                        setExpandedHotspot(h.locId);
                        fetchHotspotObs(h.locId);
                        onHighlightLocations(new Set([h.locId]));
                        const hotspot = cachedHotspots[h.locId];
                        if (hotspot) onPanTo(hotspot.lat, hotspot.lng);
                      }
                    }}
                  >
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] font-mono text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded shrink-0">{idx + 1}</span>
                        <h4 className="font-bold text-sm text-white/90 truncate">{h.name}</h4>
                      </div>
                      <div className="flex gap-4 text-[10px] text-white/50 pl-7">
                        <span>最后记录: {h.latestDt}</span>
                        <span>历史鸟种: <span className="font-bold text-white/80">{h.numSpeciesAllTime || '未知'}</span></span>
                        {h.species.size > 0 && (
                          <span>近期已加载: <span className="font-bold text-emerald-400">{h.species.size}</span></span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {expandedHotspot === h.locId && (
                    <div className="bg-black/40 p-3 border-t border-white/5">
                      <h5 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2 px-1">本点位近期加载的鸟种记录</h5>
                      {h.obs.length > 0 ? (
                        <div className="space-y-2">
                          {h.obs.map((o, i) => (
                            <div key={`${o.speciesCode}-${i}`} className="flex items-center justify-between text-xs p-1.5 hover:bg-white/5 rounded transition-colors">
                              <span className="text-white/80">{o.comName}</span>
                              <div className="flex items-center gap-3 text-[10px] text-white/40">
                                <span>{o.obsDt.split(' ')[0]}</span>
                                <span className="w-8 text-right text-emerald-400/80">{o.howMany || 1}只</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-white/30 px-1 mt-2">
                          由于 eBird API 限制（仅返回区域内每种鸟类的最新记录），当前点位暂无近期的详细鸟种列表。
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
