import { CHINA_PROVINCES } from './provinces';

// English/pinyin province name (normalized to lowercase letters) -> eBird subnational1 code.
// Covers the common variants returned by IP geolocation / reverse-geocoding services.
const ENGLISH_PROVINCE_ALIASES: Record<string, string> = {
  beijing: 'CN-11',
  tianjin: 'CN-12',
  hebei: 'CN-13',
  shanxi: 'CN-14',
  neimongol: 'CN-15',
  innermongolia: 'CN-15',
  neimenggu: 'CN-15',
  liaoning: 'CN-21',
  jilin: 'CN-22',
  heilongjiang: 'CN-23',
  shanghai: 'CN-31',
  jiangsu: 'CN-32',
  zhejiang: 'CN-33',
  anhui: 'CN-34',
  fujian: 'CN-35',
  jiangxi: 'CN-36',
  shandong: 'CN-37',
  henan: 'CN-41',
  hubei: 'CN-42',
  hunan: 'CN-43',
  guangdong: 'CN-44',
  guangxi: 'CN-45',
  hainan: 'CN-46',
  chongqing: 'CN-50',
  sichuan: 'CN-51',
  guizhou: 'CN-52',
  yunnan: 'CN-53',
  tibet: 'CN-54',
  xizang: 'CN-54',
  shaanxi: 'CN-61',
  gansu: 'CN-62',
  qinghai: 'CN-63',
  ningxia: 'CN-64',
  xinjiang: 'CN-65',
  taiwan: 'CN-71',
  hongkong: 'CN-91',
  macau: 'CN-92',
  macao: 'CN-92',
};

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

function matchProvinceCode(region?: string | null): string | null {
  const trimmed = region?.trim();
  if (!trimmed) return null;

  // Direct Chinese name match, e.g. "广东" / "广东省" / "北京市"
  const cnMatch = CHINA_PROVINCES.find(p => trimmed.includes(p.name));
  if (cnMatch) return cnMatch.code;

  // English/pinyin match, e.g. "Guangdong", "Guangdong Province"
  const key = normalize(trimmed);
  for (const alias of Object.keys(ENGLISH_PROVINCE_ALIASES)) {
    if (key.includes(alias)) return ENGLISH_PROVINCE_ALIASES[alias];
  }
  return null;
}

async function fetchJson(url: string, timeoutMs = 6000): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Reverse-geocodes GPS coordinates to a China province code via a free, key-less API. */
async function provinceFromCoords(lat: number, lng: number): Promise<string | null> {
  const data = await fetchJson(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=zh`);
  if (!data) return null;
  return matchProvinceCode(data.principalSubdivision || data.locality);
}

/** Infers the visitor's China province from their public IP address. */
async function provinceFromIp(): Promise<string | null> {
  const data = await fetchJson('https://get.geojs.io/v1/ip/geo.json');
  if (!data || data.country_code !== 'CN') return null;
  return matchProvinceCode(data.region);
}

/**
 * Detects the user's current province code (e.g. 'CN-44' for 广东).
 * Prefers an already-granted GPS position (no permission prompt triggered here),
 * and falls back to IP-based geolocation when GPS is unavailable/denied.
 */
export async function detectCurrentProvinceCode(): Promise<string | null> {
  if (navigator.permissions?.query) {
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      if (status.state === 'granted') {
        const position = await new Promise<GeolocationPosition | null>(resolve => {
          navigator.geolocation.getCurrentPosition(
            p => resolve(p),
            () => resolve(null),
            { timeout: 5000, maximumAge: 5 * 60 * 1000 }
          );
        });
        if (position) {
          const code = await provinceFromCoords(position.coords.latitude, position.coords.longitude);
          if (code) return code;
        }
      }
    } catch {
      // Permissions API unsupported/blocked; fall through to IP-based lookup.
    }
  }
  return provinceFromIp();
}
