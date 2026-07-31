export interface LatLng {
  lat: number;
  lng: number;
}

export interface EbirdHotspot {
  locId: string;
  locName: string;
  lat: number;
  lng: number;
  latestObsDt?: string;
  numSpeciesAllTime?: number;
}

export interface SavedPoint {
  id: string;
  name: string;
  location: LatLng;
  type: 'custom' | 'ebird';
  ebirdLocId?: string;
}

export type MapLayer = 'roadmap' | 'satellite' | 'terrain';

