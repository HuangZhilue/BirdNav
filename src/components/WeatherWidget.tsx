import React, { useEffect, useState, useRef } from 'react';
import { 
  Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, 
  CloudSnow, CloudLightning, Wind, Droplets, Thermometer,
  ChevronDown, ChevronUp, Loader2
} from 'lucide-react';
import { wgs84ToGcj02, gcj02ToWgs84 } from '../utils/coords';

interface WeatherWidgetProps {
  lat: number;
  lng: number;
}

const getWeatherIcon = (code: number, className = "w-5 h-5") => {
  if (code === 0) return <Sun className={className} />;
  if (code === 1) return <CloudSun className={className} />;
  if (code === 2) return <CloudSun className={className} />;
  if (code === 3) return <Cloud className={className} />;
  if (code === 45 || code === 48) return <CloudFog className={className} />;
  if (code >= 51 && code <= 57) return <CloudDrizzle className={className} />;
  if (code >= 61 && code <= 67) return <CloudRain className={className} />;
  if (code >= 71 && code <= 77) return <CloudSnow className={className} />;
  if (code >= 80 && code <= 82) return <CloudRain className={className} />;
  if (code >= 85 && code <= 86) return <CloudSnow className={className} />;
  if (code >= 95 && code <= 99) return <CloudLightning className={className} />;
  return <Sun className={className} />;
};

const getWeatherDesc = (code: number) => {
  if (code === 0) return "晴";
  if (code === 1) return "大部晴朗";
  if (code === 2) return "局部多云";
  if (code === 3) return "阴天";
  if (code === 45 || code === 48) return "雾";
  if (code >= 51 && code <= 57) return "毛毛雨";
  if (code >= 61 && code <= 67) return "雨";
  if (code >= 71 && code <= 77) return "雪";
  if (code >= 80 && code <= 82) return "阵雨";
  if (code >= 85 && code <= 86) return "阵雪";
  if (code >= 95 && code <= 99) return "雷雨";
  return "未知";
};

export default function WeatherWidget({ lat, lng }: WeatherWidgetProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Determine the true WGS84 coordinate (assuming passed lat,lng is GCJ02 from map center)
    // Wait, the map center is GCJ02. So we need to convert to WGS84 for Open-Meteo.
    const wgs = gcj02ToWgs84(lat, lng);
    
    let cancelled = false;
    const fetchWeather = async () => {
      setLoading(true);
      try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${wgs.lat.toFixed(4)}&longitude=${wgs.lng.toFixed(4)}&current=temperature_2m,wind_speed_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&wind_speed_unit=ms&timezone=auto`);
        if (!res.ok) throw new Error('Weather fetch failed');
        const json = await res.json();
        if (!cancelled) {
          setData(json);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    // Debounce the fetch slightly to avoid spamming while panning
    const timeout = setTimeout(fetchWeather, 500);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [lat, lng]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!data && loading) {
    return (
      <div className="absolute top-[max(6.5rem,env(safe-area-inset-top,0px)+5rem)] sm:top-[max(1.5rem,env(safe-area-inset-top,0px))] left-1/2 -translate-x-1/2 sm:left-auto sm:right-[260px] sm:translate-x-0 z-[2000] bg-[#25282c]/90 backdrop-blur-md px-4 py-2 rounded-lg border border-white/10 shadow-2xl flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const current = data.current;
  const daily = data.daily;
  const todayPrecipProb = daily.precipitation_probability_max[0] || 0;
  
  return (
    <div 
      ref={wrapperRef}
      className="absolute top-[max(6.5rem,env(safe-area-inset-top,0px)+5rem)] sm:top-[max(1.5rem,env(safe-area-inset-top,0px))] left-1/2 -translate-x-1/2 sm:left-auto sm:right-60 sm:translate-x-0 z-[2000] flex flex-col gap-2 items-center sm:items-end"
    >
      <div 
        onClick={() => setExpanded(!expanded)}
        className="bg-[#25282c]/90 hover:bg-[#25282c] transition-colors cursor-pointer backdrop-blur-md px-3 py-2 rounded-lg border border-white/10 shadow-2xl flex items-center gap-4 select-none"
      >
        <div className="flex items-center gap-2 text-emerald-400" title={getWeatherDesc(current.weather_code)}>
          {getWeatherIcon(current.weather_code, "w-6 h-6")}
          <span className="text-lg font-bold text-white">{Math.round(current.temperature_2m)}°C</span>
        </div>
        
        <div className="flex items-center gap-3 border-l border-white/10 pl-3">
          <div className="flex items-center gap-1 text-white/70" title="风速">
            <Wind className="w-4 h-4 text-blue-300" />
            <span className="text-xs font-mono">{current.wind_speed_10m} m/s</span>
          </div>
          <div className="flex items-center gap-1 text-white/70" title="降水概率">
            <Droplets className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-mono">{todayPrecipProb}%</span>
          </div>
        </div>

        <div className="text-white/40 ml-1">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {expanded && (
        <div className="bg-[#25282c]/95 backdrop-blur-md border border-white/10 rounded-lg shadow-2xl w-full sm:w-[320px] p-3 animate-in fade-in slide-in-from-top-2">
          <h4 className="text-xs font-bold text-white/50 uppercase tracking-widest mb-3 border-b border-white/10 pb-2">7日预报</h4>
          <div className="flex flex-col gap-2">
            {daily.time.map((time: string, index: number) => {
              const date = new Date(time);
              const isToday = index === 0;
              const dayStr = isToday ? "今天" : ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
              
              return (
                <div key={time} className="flex items-center justify-between text-sm py-1 border-b border-white/5 last:border-0">
                  <div className="flex items-center gap-3 w-20">
                    <span className={isToday ? "text-emerald-400 font-bold" : "text-white/80"}>{dayStr}</span>
                  </div>
                  
                  <div className="flex items-center gap-2 flex-1 justify-center text-white/70">
                    <div title={getWeatherDesc(daily.weather_code[index])}>
                      {getWeatherIcon(daily.weather_code[index], "w-4 h-4")}
                    </div>
                    <span className="text-xs">{daily.precipitation_probability_max[index]}%</span>
                  </div>
                  
                  <div className="flex items-center gap-2 w-24 justify-end font-mono">
                    <span className="text-white/50 text-xs">{Math.round(daily.temperature_2m_min[index])}°</span>
                    <div className="w-8 h-1 rounded-full bg-gradient-to-r from-blue-500 to-orange-500 opacity-70"></div>
                    <span className="text-white font-bold text-xs">{Math.round(daily.temperature_2m_max[index])}°</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
