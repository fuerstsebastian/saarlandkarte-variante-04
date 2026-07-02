export interface Site {
  id: string;
  name: string;
  gemeinde: string;
  lat: number;
  lng: number;
  beschreibung: string;
  zeitstellung: string | string[];
  kategorie_attraktion: string;
  kategorie_befund: string;
  sichtbarkeit: string;
  barrierefreiheit: boolean;
  oeffnungszeiten: string | null;
  eintrittspreis: string;
  maps_link: string | null;
  denkmalschutzstatus: string | null;
  literatur: string[];
  thumbnail: string | null;
}

export interface Filters {
  search: string;
  gemeinde: string;
  barrierefreiheit: string; // 'alle' | 'barrierefrei'
  kategorie_attraktion: string;
  kategorie_befund: string;
  sichtbarkeit: string;
  eintritt_frei: string; // 'alle' | 'kostenlos'
}

export interface RouteStop {
  id: string; // 'user-location' or site ID
  name: string;
  lat: number;
  lng: number;
  site?: Site;
}


