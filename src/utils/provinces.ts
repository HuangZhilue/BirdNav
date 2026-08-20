export const CHINA_PROVINCES = [
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

// Approximate center (WGS84) + zoom level used to fly the map to a province once it is selected.
export const PROVINCE_VIEWS: Record<string, { lat: number; lng: number; zoom: number }> = {
  'CN-11': { lat: 39.9042, lng: 116.4074, zoom: 10 }, // 北京
  'CN-12': { lat: 39.0842, lng: 117.2009, zoom: 10 }, // 天津
  'CN-13': { lat: 38.0428, lng: 114.5149, zoom: 7 },  // 河北
  'CN-14': { lat: 37.8706, lng: 112.5489, zoom: 7 },  // 山西
  'CN-15': { lat: 44.0, lng: 113.0, zoom: 5 },        // 内蒙古
  'CN-21': { lat: 41.8057, lng: 123.4315, zoom: 7 },  // 辽宁
  'CN-22': { lat: 43.8378, lng: 125.3236, zoom: 7 },  // 吉林
  'CN-23': { lat: 47.0, lng: 128.0, zoom: 6 },        // 黑龙江
  'CN-31': { lat: 31.2304, lng: 121.4737, zoom: 10 }, // 上海
  'CN-32': { lat: 33.0, lng: 119.5, zoom: 7 },        // 江苏
  'CN-33': { lat: 29.0, lng: 120.0, zoom: 7 },        // 浙江
  'CN-34': { lat: 31.86, lng: 117.28, zoom: 7 },      // 安徽
  'CN-35': { lat: 26.0, lng: 118.0, zoom: 7 },        // 福建
  'CN-36': { lat: 27.6, lng: 115.9, zoom: 7 },        // 江西
  'CN-37': { lat: 36.5, lng: 118.5, zoom: 7 },        // 山东
  'CN-41': { lat: 34.0, lng: 113.6, zoom: 7 },        // 河南
  'CN-42': { lat: 31.0, lng: 112.5, zoom: 7 },        // 湖北
  'CN-43': { lat: 27.6, lng: 111.7, zoom: 7 },        // 湖南
  'CN-44': { lat: 23.3, lng: 113.3, zoom: 7 },        // 广东
  'CN-45': { lat: 23.8, lng: 108.8, zoom: 7 },        // 广西
  'CN-46': { lat: 19.2, lng: 109.7, zoom: 8 },        // 海南
  'CN-50': { lat: 29.5, lng: 107.3, zoom: 8 },        // 重庆
  'CN-51': { lat: 30.6, lng: 102.5, zoom: 6 },        // 四川
  'CN-52': { lat: 26.8, lng: 106.7, zoom: 7 },        // 贵州
  'CN-53': { lat: 24.5, lng: 101.0, zoom: 6 },        // 云南
  'CN-54': { lat: 31.0, lng: 88.0, zoom: 5 },         // 西藏
  'CN-61': { lat: 35.0, lng: 108.9, zoom: 7 },        // 陕西
  'CN-62': { lat: 37.0, lng: 101.0, zoom: 5 },        // 甘肃
  'CN-63': { lat: 35.5, lng: 95.0, zoom: 5 },         // 青海
  'CN-64': { lat: 37.3, lng: 106.0, zoom: 7 },        // 宁夏
  'CN-65': { lat: 41.5, lng: 85.0, zoom: 5 },         // 新疆
  'CN-71': { lat: 23.7, lng: 121.0, zoom: 8 },        // 台湾
  'CN-91': { lat: 22.3, lng: 114.17, zoom: 10 },      // 香港
  'CN-92': { lat: 22.2, lng: 113.55, zoom: 12 },      // 澳门
};
