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

export interface EbirdObservation {
  speciesCode: string;
  comName: string;
  sciName: string;
  locId: string;
  locName: string;
  obsDt: string;
  howMany?: number;
  lat: number;
  lng: number;
  obsValid: boolean;
  obsReviewed: boolean;
  locationPrivate: boolean;
  subId: string;
}

export interface SavedPoint {
  id: string;
  name: string;
  location: LatLng;
  type: 'custom' | 'ebird' | 'my-location';
  ebirdLocId?: string;
}

export type MapLayer = 'roadmap' | 'satellite';

