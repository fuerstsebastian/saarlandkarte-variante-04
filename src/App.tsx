import React, { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { 
  Search, MapPin, Info, Clock, Route, Accessibility, Calendar, Filter, BookOpen, Shield, 
  Trash2, ChevronUp, ChevronDown, Check, Compass, RefreshCw, Navigation, Play, Plus, Minus
} from 'lucide-react';
import sitesData from './data/sites.json';
import { Site, Filters, RouteStop } from './types';

// Helper for great-circle distance (Haversine Formula) in km
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

// Find the index in a coordinates array closest to the target coordinate
const findClosestCoordinateIndex = (coord: [number, number], coords: [number, number][]) => {
  let minDistance = Infinity;
  let closestIndex = 0;
  for (let i = 0; i < coords.length; i++) {
    const d = calculateDistance(coord[0], coord[1], coords[i][0], coords[i][1]);
    if (d < minDistance) {
      minDistance = d;
      closestIndex = i;
    }
  }
  return closestIndex;
};

// Formats OSRM steps into user-friendly German navigation instructions
const getGermanInstruction = (step: any, mode: 'car' | 'bike' | 'walk'): string => {
  const name = step.name || step.ref;
  const modifier = step.maneuver?.modifier;
  const type = step.maneuver?.type;
  
  let actionText = '';
  let streetText = name ? ` auf "${name}"` : '';

  const modeText = mode === 'walk' ? 'Gehen Sie' : 'Fahren Sie';
  
  switch (type) {
    case 'depart':
      actionText = `${modeText} los`;
      break;
    case 'arrive':
      actionText = 'Sie erreichen das Zwischenziel';
      streetText = '';
      break;
    case 'turn':
      actionText = 'Biegen Sie';
      if (modifier === 'left' || modifier === 'sharp left') {
        actionText += ' links ab';
      } else if (modifier === 'right' || modifier === 'sharp right') {
        actionText += ' rechts ab';
      } else if (modifier === 'slight left') {
        actionText += ' leicht links ab';
      } else if (modifier === 'slight right') {
        actionText += ' leicht rechts ab';
      } else if (modifier === 'straight') {
        actionText += ' geradeaus weiter';
      } else {
        actionText += ' ab';
      }
      break;
    case 'new name':
      actionText = `Folgen Sie dem Straßenverlauf`;
      break;
    case 'fork':
      actionText = 'Halten Sie sich';
      if (modifier === 'left') {
        actionText += ' links';
      } else if (modifier === 'right') {
        actionText += ' rechts';
      }
      break;
    case 'roundabout':
      const exitNum = step.maneuver?.exit ? ` die ${step.maneuver.exit}. Ausfahrt` : ' die Ausfahrt';
      actionText = `Im Kreisverkehr nehmen Sie${exitNum}`;
      break;
    default:
      actionText = 'Folgen Sie dem Straßenverlauf';
      break;
  }
  
  const distanceText = step.distance > 0 
    ? ` für ca. ${step.distance >= 1000 ? `${(step.distance / 1000).toFixed(1)} km` : `${Math.round(step.distance)} m`}`
    : '';
  
  return `${actionText}${streetText}${distanceText}`;
};


// Fix for default marker icon in leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Helper for image credit and license info
const getImageCreditName = (siteId: string): string => {
  const credits: Record<string, string> = {
    'dummy-001-gollenstein': 'Wikimedia',
    'dummy-002-spellenstein': 'Wikimedia',
    'dummy-004-hunnenring': 'Wikipedia',
    'dummy-005-kulturpark-bliesbruck-reinheim': 'Flocci Nivis',
    'dummy-006-villa-borg': 'enbodenumer',
    'dummy-007-villa-nennig': 'Wikimedia',
    'dummy-008-roemermuseum-schwarzenacker': 'johann j.m.',
    'dummy-010-emilianus-stollen': 'LoKiLeCh',
    'dummy-012-burg-montclair': 'Wikimedia',
    'dummy-013-abtei-tholey': 'Wikipedia',
    'dummy-014-voelklinger-huette': 'Jakob Montrasio'
  };
  return credits[siteId] || 'Unbekannt';
};

const getImageLicense = (siteId: string): string => {
  const licenses: Record<string, string> = {
    'dummy-001-gollenstein': 'Wikimedia Commons',
    'dummy-002-spellenstein': 'Wikimedia Commons',
    'dummy-004-hunnenring': 'Wikipedia/Wikimedia',
    'dummy-005-kulturpark-bliesbruck-reinheim': 'CC BY 4.0',
    'dummy-006-villa-borg': 'CC BY-NC-SA 2.0',
    'dummy-007-villa-nennig': 'Wikimedia Commons',
    'dummy-008-roemermuseum-schwarzenacker': 'CC BY-NC-SA 2.0',
    'dummy-010-emilianus-stollen': 'CC BY-SA 3.0',
    'dummy-012-burg-montclair': 'Wikimedia Commons',
    'dummy-013-abtei-tholey': 'Wikipedia/Wikimedia',
    'dummy-014-voelklinger-huette': 'CC BY 2.0'
  };
  return licenses[siteId] || 'Unbekannt';
};
const getMarkerIcon = (attraktion: string) => {
  let colorClass = 'bg-orange-700'; // Standard (Bodendenkmal, Gedenkstätte)
  if (attraktion.includes('Museum') || attraktion.includes('Freilichtmuseum')) {
    colorClass = 'bg-blue-600';
  } else if (attraktion.includes('Rekonstruktion')) {
    colorClass = 'bg-green-700';
  }

  return L.divIcon({
    className: 'custom-marker',
    html: `<div class="${colorClass} w-4.5 h-4.5 rounded-full border-2 border-white shadow-md animate-pulse duration-1000"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10]
  });
};

const getSimulatedTravelerIcon = (mode: 'car' | 'bike' | 'walk') => {
  const emoji = mode === 'car' ? '🚗' : mode === 'bike' ? '🚲' : '🥾';
  return L.divIcon({
    className: 'simulated-traveler-marker',
    html: `
      <div class="relative flex items-center justify-center w-8 h-8 bg-amber-500 rounded-full border-2 border-white shadow-lg animate-bounce duration-1000">
        <span class="text-xs absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none">${emoji}</span>
        <div class="absolute -inset-1.5 rounded-full border border-amber-500 animate-ping opacity-50 pointer-events-none"></div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });
};

interface SiteCluster {
  id: string;
  lat: number;
  lng: number;
  sites: Site[];
}

const isCluster = (item: any): item is SiteCluster => {
  return item && 'sites' in item && Array.isArray(item.sites);
};

const getClusterIcon = (count: number) => {
  const size = count > 10 ? 'w-9 h-9 text-xs' : count > 5 ? 'w-8 h-8 text-xs' : 'w-7.5 h-7.5 text-[11px]';
  
  return L.divIcon({
    className: 'custom-cluster-marker',
    html: `
      <div class="relative flex items-center justify-center ${size} bg-natural-olive rounded-full border-2 border-white shadow-md text-white font-sans font-black pointer-events-none select-none hover:scale-105 duration-200">
        <span class="relative z-20">${count}</span>
        <div class="absolute -inset-1 rounded-full bg-natural-olive opacity-20 animate-ping z-10 pointer-events-none"></div>
      </div>
    `,
    iconSize: count > 10 ? [36, 36] : count > 5 ? [32, 32] : [30, 30],
    iconAnchor: count > 10 ? [18, 18] : count > 5 ? [16, 16] : [15, 15]
  });
};

const getClusterThresholdKm = (zoom: number): number => {
  if (zoom <= 6) return 30;
  if (zoom === 7) return 15;
  if (zoom === 8) return 8;
  if (zoom === 9) return 4;
  if (zoom === 10) return 2;
  return 0; // No clustering for zoom >= 11
};

const clusterSites = (sites: Site[], zoom: number): (SiteCluster | Site)[] => {
  const threshold = getClusterThresholdKm(zoom);
  if (threshold <= 0 || zoom >= 11) {
    return sites;
  }

  const results: (SiteCluster | Site)[] = [];
  const visited = new Set<string>();

  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];
    if (visited.has(site.id)) continue;

    const currentClusterSites: Site[] = [site];
    visited.add(site.id);

    for (let j = i + 1; j < sites.length; j++) {
      const otherSite = sites[j];
      if (visited.has(otherSite.id)) continue;

      const dist = calculateDistance(site.lat, site.lng, otherSite.lat, otherSite.lng);
      if (dist <= threshold) {
        currentClusterSites.push(otherSite);
        visited.add(otherSite.id);
      }
    }

    if (currentClusterSites.length > 1) {
      let sumLat = 0;
      let sumLng = 0;
      for (const s of currentClusterSites) {
        sumLat += s.lat;
        sumLng += s.lng;
      }
      results.push({
        id: `cluster-${site.id}`,
        lat: sumLat / currentClusterSites.length,
        lng: sumLng / currentClusterSites.length,
        sites: currentClusterSites
      } as SiteCluster);
    } else {
      results.push(site);
    }
  }

  return results;
};

const ClusterMarker = ({ cluster, currentZoom }: { cluster: SiteCluster; currentZoom: number; key?: string }) => {
  const map = useMap();
  
  const handleClusterClick = () => {
    map.setView([cluster.lat, cluster.lng], Math.min(18, currentZoom + 2));
  };

  return (
    <Marker
      position={[cluster.lat, cluster.lng]}
      icon={getClusterIcon(cluster.sites.length)}
      eventHandlers={{
        click: handleClusterClick
      }}
    >
      <Popup minWidth={220}>
        <div className="p-2 font-sans">
          <div className="font-bold text-natural-olive border-b border-natural-bg pb-1 text-sm flex items-center gap-1">
            <MapPin className="w-4 h-4 text-natural-olive" />
            <span>Gruppe: {cluster.sites.length} Fundstellen</span>
          </div>
          <div className="max-h-32 overflow-y-auto mt-1.5 space-y-1 pr-1 text-[11px] text-gray-700 font-medium">
            {cluster.sites.map(site => (
              <div 
                key={site.id} 
                className="flex items-center justify-between border-b border-gray-50/50 py-0.5"
              >
                <span className="truncate max-w-[130px] font-semibold text-gray-800" title={site.name}>{site.name}</span>
                <span className="text-[9px] uppercase font-mono px-1 py-0.5 bg-natural-bg rounded text-natural-olive shrink-0 font-bold ml-2">
                  {site.kategorie_attraktion.split(' ')[0]}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-2 text-center select-none font-normal italic">Klicken zum Vergrößern</p>
        </div>
      </Popup>
    </Marker>
  );
};

const MapZoomListener = ({ onZoomChange }: { onZoomChange: (zoom: number) => void }) => {
  const map = useMap();
  useEffect(() => {
    const handleZoom = () => {
      onZoomChange(map.getZoom());
    };
    map.on('zoomend', handleZoom);
    handleZoom();
    return () => {
      map.off('zoomend', handleZoom);
    };
  }, [map, onZoomChange]);
  return null;
};

const Header = ({ currentView, setView }: { currentView: 'map' | 'list' | 'impressum'; setView: (v: 'map' | 'list' | 'impressum') => void }) => (
  <header className="h-16 bg-natural-olive text-white flex items-center justify-between px-4 sm:px-8 shrink-0 shadow-md sticky top-0 z-[1000]">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
        <MapPin className="w-6 h-6 text-white" />
      </div>
      <div>
        <h1 className="text-xl font-serif font-bold tracking-tight">
          SaarArchäo
        </h1>
        <span className="text-[10px] uppercase font-sans font-normal opacity-80 block -mt-1">
          Digitales Erbe des Saarlandes
        </span>
      </div>
    </div>
    <nav className="flex gap-4 sm:gap-8">
      <button
        onClick={() => setView('map')}
        className={`pb-1 font-medium text-sm transition-all border-b-2 cursor-pointer ${
          currentView === 'map' ? 'border-white' : 'border-transparent opacity-70 hover:opacity-100'
        }`}
      >
        Karte
      </button>
      <button
        onClick={() => setView('list')}
        className={`pb-1 font-medium text-sm transition-all border-b-2 cursor-pointer ${
          currentView === 'list' ? 'border-white' : 'border-transparent opacity-70 hover:opacity-100'
        }`}
      >
        Liste
      </button>
      <button
        onClick={() => setView('impressum')}
        className={`pb-1 font-medium text-sm transition-all border-b-2 cursor-pointer ${
          currentView === 'impressum' ? 'border-white' : 'border-transparent opacity-70 hover:opacity-100'
        }`}
      >
        Impressum
      </button>
    </nav>
  </header>
);

const Impressum = () => (
  <div className="flex-1 bg-natural-bg overflow-y-auto">
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-12">
      {/* Impressum */}
      <div>
        <h2 className="font-serif text-3xl font-bold mb-8 text-natural-olive text-center">Impressum</h2>
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-natural-border space-y-8 text-[#2d2d2d] leading-relaxed">
          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-natural-olive mb-4">Angaben gemäß § 5 TMG</h3>
            <p className="text-sm">
              Inhalte erstellt durch Teilnehmerinnen und Teilnehmer der Lehrveranstaltung <strong>„Karten, Quellen, KI: Digitale Erschließung archäologischer Attraktionen im Saarland"</strong> im Sommersemester 2026 am Lehrstuhl für Vor- und Frühgeschichte der Universität des Saarlandes unter der Leitung von Sebastian Fürst M.A.
            </p>
            <p className="text-sm mt-3">
              Universität des Saarlandes<br />
              Fachrichtung Altertumswissenschaften<br />
              Lehrstuhl für Vor- und Frühgeschichte<br />
              [Gebäude, Straße, Postfach]<br />
              66123 Saarbrücken<br />
              Deutschland
            </p>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-natural-olive mb-4">Beteiligte und kuratierte Epochen</h3>
            <ul className="text-sm space-y-1 list-disc list-inside">
              <li><strong>Melanie Seiwert</strong> – Steinzeit (Paläolithikum und Neolithikum)</li>
              <li><strong>Michael Dittrich</strong> – Bronzezeit</li>
              <li><strong>Emelie Hene</strong> – Eisenzeit</li>
              <li><strong>Felix Schu</strong> – Römerzeit</li>
              <li><strong>Tobias Nissler</strong> – Mittelalter und frühe Neuzeit</li>
              <li><strong>Oliver Coombes</strong> – Museen, Parks, Neuzeit- und Industriearchäologie</li>
            </ul>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-natural-olive mb-4">Verantwortlich im Sinne des Presserechts (V.i.S.d.P.)</h3>
            <p className="text-sm">
              Sebastian Fürst M.A.<br />
              Lehrstuhl für Vor- und Frühgeschichte<br />
              Universität des Saarlandes<br />
              [Ladungsfähige Anschrift – Gebäude, Straße, PLZ, Ort]
            </p>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-natural-olive mb-4">Kontakt</h3>
            <p className="text-sm">
              E-Mail: [E-Mail-Adresse der Fachrichtung]<br />
              Telefon: [Telefonnummer der Fachrichtung]<br />
              Web: [Webadresse des Lehrstuhls]
            </p>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-natural-olive mb-4">Institutionelle Verantwortlichkeit</h3>
            <p className="text-sm">
              Die Universität des Saarlandes ist eine Körperschaft des öffentlichen Rechts. Sie wird durch die Präsidentin / den Präsidenten der Universität des Saarlandes gesetzlich vertreten.<br />
              [Name der Präsidentin / des Präsidenten]<br />
              [Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG]
            </p>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-natural-olive mb-4">Haftung für Inhalte</h3>
            <p className="text-sm">
              Als Diensteanbieter sind wir gemäß § 7 Abs. 1 TMG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG sind wir als Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen. Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen nach den allgemeinen Gesetzen bleiben hiervon unberührt. Eine diesbezügliche Haftung ist jedoch erst ab dem Zeitpunkt der Kenntnis einer konkreten Rechtsverletzung möglich. Bei Bekanntwerden von entsprechenden Rechtsverletzungen werden wir diese Inhalte umgehend entfernen.
            </p>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-natural-olive mb-4">Haftung für Links</h3>
            <p className="text-sm">
              Unser Angebot enthält Links zu externen Webseiten Dritter, auf deren Inhalte wir keinen Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich. Die verlinkten Seiten wurden zum Zeitpunkt der Verlinkung auf mögliche Rechtsverstöße überprüft. Rechtswidrige Inhalte waren zum Zeitpunkt der Verlinkung nicht erkennbar. Eine permanente inhaltliche Kontrolle der verlinkten Seiten ist jedoch ohne konkrete Anhaltspunkte einer Rechtsverletzung nicht zumutbar. Bei Bekanntwerden von Rechtsverletzungen werden wir derartige Links umgehend entfernen.
            </p>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-natural-olive mb-4">Urheberrecht</h3>
            <p className="text-sm">
              Die durch die Projektbeteiligten erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechts bedürfen der schriftlichen Zustimmung der jeweiligen Autorin oder des jeweiligen Autors. Downloads und Kopien dieser Seite sind nur für den privaten, nicht kommerziellen Gebrauch gestattet. Soweit die Inhalte auf dieser Seite nicht von den Projektbeteiligten erstellt wurden, werden die Urheberrechte Dritter beachtet.
            </p>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-natural-olive mb-4">Bildnachweise</h3>
            <p className="text-sm">
              Die Bildnachweise sind – soweit zutreffend – direkt an den jeweiligen Fundstellenbeschreibungen oder auf einer gesonderten Bildnachweisseite vermerkt. [Ggf. einheitlichen Bildnachweis ergänzen.]
            </p>
          </section>

          <div className="pt-8 border-t border-natural-bg text-xs text-gray-500 bg-natural-bg/30 -mx-8 -mb-8 p-8">
            <p>Dieses Informationsportal ist ein studentisches Projekt zur Wissensvermittlung für archäologisch interessierte Bürger und Laien. Für fachlich verbindliche Auskünfte wenden Sie sich bitte an das Landesdenkmalamt Saarland.</p>
          </div>
        </div>
      </div>

      {/* Datenschutzerklärung */}
      <div>
        <h2 className="font-serif text-3xl font-bold mb-8 text-natural-olive text-center">Datenschutzerklärung</h2>
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-natural-border space-y-8 text-[#2d2d2d] leading-relaxed">
          <p className="text-sm">
            Wir nehmen den Schutz Ihrer persönlichen Daten sehr ernst. Diese Datenschutzerklärung informiert Sie über den Umgang mit Ihren Daten bei der Nutzung dieser Webanwendung. Die Verarbeitung erfolgt im Einklang mit der Datenschutz-Grundverordnung (DSGVO).
          </p>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-natural-olive mb-4">1. Verantwortliche Stelle</h3>
            <p className="text-sm">
              Universität des Saarlandes<br />
              Philosophische Fakultät, Fachrichtung Altertumswissenschaften<br />
              Lehrstuhl für Vor- und Frühgeschichte<br />
              [Gebäude, Straße]<br />
              66123 Saarbrücken<br />
              E-Mail: [E-Mail-Adresse]
            </p>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-natural-olive mb-4">2. Hosting (GitHub Pages)</h3>
            <p className="text-sm">
              Diese Webanwendung wird als statisches Projekt über <strong>GitHub Pages</strong> bereitgestellt, einem Dienst der GitHub Inc. (88 Colin P. Kelly Jr. St, San Francisco, CA 94107, USA). Beim Aufruf der Seite baut Ihr Browser eine Verbindung zu den Servern von GitHub auf. Dabei kann GitHub die IP-Adresse der Besuchenden zu Sicherheitszwecken verarbeiten und loggen. Weitere Informationen finden Sie in den{" "}
              <a href="https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement" className="text-natural-olive underline" target="_blank" rel="noopener noreferrer">GitHub Privacy Statements</a>.
            </p>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-natural-olive mb-4">3. Kartenmaterial (OpenStreetMap / Leaflet)</h3>
            <p className="text-sm">
              Diese Anwendung bindet interaktives Kartenmaterial von <strong>OpenStreetMap</strong> (OSM) ein, um archäologische Fundstellen geografisch darzustellen. OpenStreetMap wird von der OpenStreetMap Foundation (OSMF), St John's Innovation Centre, Cowley Road, Cambridge, CB4 0WS, Großbritannien, bereitgestellt. Beim Laden der Karte fordert Ihr Browser Kartendaten (Kacheln) direkt von den Servern der OSMF an. Dabei wird Ihre IP-Adresse und ggf. weitere technische Browserdaten an die Server der OSMF übertragen. Es werden dabei keine Cookies oder persistenten Tracker durch OSM gesetzt. Weitere Informationen finden Sie in der{" "}
              <a href="https://wiki.osmfoundation.org/wiki/Privacy_Policy" className="text-natural-olive underline" target="_blank" rel="noopener noreferrer">Datenschutzerklärung der OpenStreetMap Foundation</a>.
            </p>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-natural-olive mb-4">4. Externe Dienste</h3>
            <p className="text-sm mb-3">
              Diese Webanwendung nutzt folgende externe Dienste, bei deren Aufruf Ihre IP-Adresse und ggf. weitere technische Daten an die jeweiligen Server übertragen werden:
            </p>
            <ul className="text-sm space-y-2 list-disc list-inside">
              <li>
                <strong>Leaflet-CDN (unpkg.com):</strong> Die Kartenbibliothek Leaflet sowie die zugehörigen Marker-Icons werden über das CDN unpkg.com (NPM Inc., USA) geladen. Beim Abruf der Skript- und Bilddateien wird Ihre IP-Adresse an die Server von unpkg.com übertragen.
              </li>
              <li>
                <strong>Google Fonts:</strong> Zur einheitlichen Darstellung von Schriftarten werden externe Schriftarten von Google Fonts (Google LLC, 1600 Amphitheatre Parkway, Mountain View, CA 94043, USA) geladen. Beim Aufruf wird Ihre IP-Adresse an Server von Google LLC übertragen. Weitere Informationen finden Sie in der{" "}
                <a href="https://policies.google.com/privacy" className="text-natural-olive underline" target="_blank" rel="noopener noreferrer">Datenschutzerklärung von Google</a>.
              </li>
              <li>
                <strong>OSRM-Routing:</strong> Sofern Sie die Routenplanungsfunktion nutzen, werden die Koordinaten Ihrer gewählten Fundstellen an den öffentlichen OSRM-Routingdienst (router.project-osrm.org) übertragen, um eine optimierte Straßenroute zu berechnen. Es werden keine personenbezogenen Daten gespeichert.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-natural-olive mb-4">5. Lokaler Browserspeicher (LocalStorage)</h3>
            <p className="text-sm">
              Zur Speicherung Ihrer bevorzugten Einstellungen (z. B. Filtereinstellungen) nutzt diese Anwendung den lokalen Speicher Ihres Browsers (LocalStorage). Diese Daten verbleiben ausschließlich auf Ihrem Gerät, werden nicht an Server übertragen und dienen allein dem Nutzungskomfort (Art. 6 Abs. 1 lit. f DSGVO).
            </p>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-natural-olive mb-4">6. Keine Tracking-Cookies und Analysetools</h3>
            <p className="text-sm">
              Diese Anwendung verzichtet vollständig auf den Einsatz von Tracking-Cookies, Werbe-Pixeln oder Webanalyse-Diensten (wie z. B. Google Analytics). Es werden keine Nutzerprofile erstellt. Es findet kein Nutzer-Tracking statt.
            </p>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-natural-olive mb-4">7. Ihre Rechte</h3>
            <p className="text-sm">
              Sie haben als betroffene Person jederzeit das Recht auf unentgeltliche Auskunft über Ihre gespeicherten personenbezogenen Daten (Art. 15 DSGVO), auf Berichtigung (Art. 16 DSGVO), auf Löschung (Art. 17 DSGVO), auf Einschränkung der Verarbeitung (Art. 18 DSGVO) und auf Datenübertragbarkeit (Art. 20 DSGVO). Zudem steht Ihnen ein Beschwerderecht bei einer Datenschutz-Aufsichtsbehörde zu (Art. 77 DSGVO). Da wir selbst keine personenbezogenen Daten über die technisch notwendigen Verbindungsdaten der Hosting-Plattform hinaus speichern, betreffen diese Rechte primär die von Ihnen selbst verwalteten LocalStorage-Werte Ihres Browsers. Für Fragen zum Datenschutz wenden Sie sich bitte an die oben genannte Kontaktadresse.
            </p>
          </section>
        </div>
      </div>
    </div>
  </div>
);

export default function App() {
  const [view, setView] = useState<'map' | 'list' | 'impressum'>('map');
  const [selectedListSiteId, setSelectedListSiteId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    search: '',
    gemeinde: '',
    barrierefreiheit: 'alle',
    kategorie_attraktion: '',
    kategorie_befund: '',
    sichtbarkeit: '',
    eintritt_frei: 'alle'
  });
  const [selectedEpochs, setSelectedEpochs] = useState<string[]>([]);
  
  // Route planning states
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [showRoutePlanner, setShowRoutePlanner] = useState<boolean>(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState<boolean>(false);
  const [focusRouteTrigger, setFocusRouteTrigger] = useState<number>(0);
  const [centerUserTrigger, setCenterUserTrigger] = useState<number>(0);

  // In-app Active Navigation states
  const [isNavigating, setIsNavigating] = useState<boolean>(false);
  const [navTransportMode, setNavTransportMode] = useState<'car' | 'bike' | 'walk'>('car');
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number>(0);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [isSimulatorRunning, setIsSimulatorRunning] = useState<boolean>(false);
  const [speechEnabled, setSpeechEnabled] = useState<boolean>(false);

  // Map zoom level for adaptive marker clustering
  const [mapZoom, setMapZoom] = useState<number>(10);

  // Track if any popup is currently open to auto-hide overlapping elements in mobile views
  const [isPopupOpen, setIsPopupOpen] = useState<boolean>(false);

  // Mobile filters collapsed by default to maximize map view
  const [isMobileFiltersExpanded, setIsMobileFiltersExpanded] = useState<boolean>(false);

  // Real street-aligned routing states
  const [roadRouteData, setRoadRouteData] = useState<{
    fullPath: [number, number][];
    legs: {
      distance: number;
      duration: number;
      steps: {
        instruction: string;
        distance: number;
        icon: 'start' | 'left' | 'right' | 'straight' | 'arrival';
        coord: [number, number];
      }[];
      coordinates: [number, number][];
    }[];
  } | null>(null);

  const [isFetchingRoute, setIsFetchingRoute] = useState<boolean>(false);

  // Fetch and build the road route using Open Source Routing Machine (OSRM)
  useEffect(() => {
    if (routeStops.length < 2) {
      setRoadRouteData(null);
      return;
    }
    
    let isMounted = true;
    const loadRoute = async () => {
      setIsFetchingRoute(true);
      
      let profile = 'driving';
      if (navTransportMode === 'bike') {
        profile = 'cycling';
      } else if (navTransportMode === 'walk') {
        profile = 'foot';
      }
      
      const coordsString = routeStops.map(s => `${s.lng},${s.lat}`).join(';');
      const url = `https://router.project-osrm.org/route/v1/${profile}/${coordsString}?overview=full&geometries=geojson&steps=true`;
      
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('OSRM Route API request failed');
        const data = await res.json();
        
        if (!isMounted) return;
        
        if (data.code === 'Ok' && data.routes && data.routes[0]) {
          const route = data.routes[0];
          const fullPathCoords = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
          
          const formattedLegs = route.legs.map((leg: any, legIndex: number) => {
            const fromStop = routeStops[legIndex];
            const toStop = routeStops[legIndex + 1];
            
            const startIndex = findClosestCoordinateIndex([fromStop.lat, fromStop.lng], fullPathCoords);
            const endIndex = findClosestCoordinateIndex([toStop.lat, toStop.lng], fullPathCoords);
            
            const legCoords = fullPathCoords.slice(startIndex, endIndex + 1);
            if (legCoords.length === 0) {
              legCoords.push([fromStop.lat, fromStop.lng], [toStop.lat, toStop.lng]);
            }
            
            const formattedSteps = leg.steps.map((step: any) => {
              const instr = getGermanInstruction(step, navTransportMode);
              const stepCoord: [number, number] = [step.maneuver.location[1], step.maneuver.location[0]];
              
              let iconType: 'start' | 'left' | 'right' | 'straight' | 'arrival' = 'straight';
              const type = step.maneuver?.type;
              const modifier = step.maneuver?.modifier;
              if (type === 'depart') iconType = 'start';
              else if (type === 'arrive') iconType = 'arrival';
              else if (modifier === 'left' || modifier === 'sharp left' || modifier === 'slight left') iconType = 'left';
              else if (modifier === 'right' || modifier === 'sharp right' || modifier === 'slight right') iconType = 'right';
              
              return {
                instruction: instr,
                distance: step.distance / 1000,
                icon: iconType,
                coord: stepCoord
              };
            });
            
            // Add a clean final arrival step
            if (formattedSteps.length === 0 || formattedSteps[formattedSteps.length - 1].icon !== 'arrival') {
              formattedSteps.push({
                instruction: `Sie haben Ihr Zwischenziel "${toStop.name}" erreicht!`,
                distance: 0.1,
                icon: 'arrival',
                coord: [toStop.lat, toStop.lng]
              });
            }
            
            return {
              distance: leg.distance / 1000,
              duration: leg.duration / 60,
              steps: formattedSteps,
              coordinates: legCoords
            };
          });
          
          setRoadRouteData({
            fullPath: fullPathCoords,
            legs: formattedLegs
          });
        } else {
          setRoadRouteData(null);
        }
      } catch (err) {
        console.error("Failed to fetch or parse road route:", err);
        if (isMounted) {
          setRoadRouteData(null);
        }
      } finally {
        if (isMounted) {
          setIsFetchingRoute(false);
        }
      }
    };
    
    loadRoute();
    
    return () => {
      isMounted = false;
    };
  }, [routeStops, navTransportMode]);

  const sites = useMemo(() => sitesData.fundstellen as Site[], []);

  // Compute stats between consecutive stops
  const routeSegments = useMemo(() => {
    const segments: { from: RouteStop; to: RouteStop; distance: number }[] = [];
    for (let i = 0; i < routeStops.length - 1; i++) {
      const from = routeStops[i];
      const to = routeStops[i + 1];
      const dist = calculateDistance(from.lat, from.lng, to.lat, to.lng);
      segments.push({ from, to, distance: dist });
    }
    return segments;
  }, [routeStops]);

  // Dynamic compass bearing and road-name generator for realistic routing instructions
  const getHeadingName = (lat1: number, lon1: number, lat2: number, lon2: number): string => {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    const brng = Math.atan2(y, x) * 180 / Math.PI;
    const headingVal = (brng + 360) % 360;
    if (headingVal >= 337.5 || headingVal < 22.5) return 'Norden';
    if (headingVal >= 22.5 && headingVal < 67.5) return 'Nordosten';
    if (headingVal >= 67.5 && headingVal < 112.5) return 'Osten';
    if (headingVal >= 112.5 && headingVal < 157.5) return 'Südosten';
    if (headingVal >= 157.5 && headingVal < 202.5) return 'Süden';
    if (headingVal >= 202.5 && headingVal < 247.5) return 'Südwesten';
    if (headingVal >= 247.5 && headingVal < 292.5) return 'Westen';
    return 'Nordwesten';
  };

  // Turn-by-turn route step generator for active guidance segment
  const currentSegmentSteps = useMemo(() => {
    if (routeSegments.length === 0 || activeSegmentIndex >= routeSegments.length) return [];
    const segment = routeSegments[activeSegmentIndex];
    if (!segment) return [];
    const d = segment.distance;
    const from = segment.from;
    const to = segment.to;
    const heading = getHeadingName(from.lat, from.lng, to.lat, to.lng);
    
    const steps: { instruction: string; distance: number; icon: 'start' | 'left' | 'right' | 'straight' | 'arrival' }[] = [];
    
    // Step 0 - Start
    steps.push({
      instruction: `Starten Sie die Route bei "${from.name}" und folgen Sie dem Straßenverlauf in Richtung ${heading}.`,
      distance: 0.2,
      icon: 'start'
    });

    // Step 1 - Intermediary bend/direction change based on transport mode
    if (navTransportMode === 'walk') {
      steps.push({
        instruction: `Biegen Sie nach ca. ${(d * 0.25).toFixed(1)} km am hölzernen Wegweiser links ab auf einen schattigen, naturbelassenen Waldweg.`,
        distance: Math.max(0.1, Math.round(d * 0.25 * 10) / 10),
        icon: 'left'
      });
    } else if (navTransportMode === 'bike') {
      steps.push({
        instruction: `Fahren Sie nach ca. ${(d * 0.25).toFixed(1)} km rechts auf den Saar-Radweg in Richtung ${to.site?.gemeinde || 'nächster Fundstelle'}.`,
        distance: Math.max(0.1, Math.round(d * 0.25 * 10) / 10),
        icon: 'right'
      });
    } else {
      steps.push({
        instruction: `Biegen Sie nach ca. ${(d * 0.25).toFixed(1)} km an der Kreuzung rechts ab auf die Landstraße Richtung ${to.site?.gemeinde || 'nächster Fundstelle'}.`,
        distance: Math.max(0.1, Math.round(d * 0.25 * 10) / 10),
        icon: 'right'
      });
    }

    // Step 2 - Extended cruise / route detail
    if (navTransportMode === 'walk') {
      steps.push({
        instruction: `Folgen Sie dem befestigten archäologischen Lehrpfad für ca. ${(d * 0.6).toFixed(1)} km, vorbei an geschichtsträchtigen Hügeln.`,
        distance: Math.max(0.1, Math.round(d * 0.6 * 10) / 10),
        icon: 'straight'
      });
    } else if (navTransportMode === 'bike') {
      steps.push({
        instruction: `Gleiten Sie für ca. ${(d * 0.6).toFixed(1)} km auf dem asphaltierten Fahrradstreifen und genießen Sie das Saarländer Panorama.`,
        distance: Math.max(0.1, Math.round(d * 0.6 * 10) / 10),
        icon: 'straight'
      });
    } else {
      steps.push({
        instruction: `Folgen Sie der Hauptstraße geradeaus für ca. ${(d * 0.6).toFixed(1)} km.`,
        distance: Math.max(0.1, Math.round(d * 0.6 * 10) / 10),
        icon: 'straight'
      });
    }

    // Step 3 - Target arrival
    steps.push({
      instruction: `Sie haben das historische Zwischenziel "${to.name}" erreicht! Parkbuchten und Schautafeln befinden sich direkt vor Ort.`,
      distance: 0.1,
      icon: 'arrival'
    });

    return steps;
  }, [routeSegments, activeSegmentIndex, navTransportMode]);

  // Unified steps selector for active navigation (real road-based steps vs local fallback)
  const currentNavigationSteps = useMemo(() => {
    if (roadRouteData && roadRouteData.legs[activeSegmentIndex]) {
      return roadRouteData.legs[activeSegmentIndex].steps;
    }
    return currentSegmentSteps;
  }, [roadRouteData, activeSegmentIndex, currentSegmentSteps]);

  // Text-To-Speech audio reader in German language
  const speakInstruction = (text: string) => {
    if (!window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'de-DE';
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error("Speech Synthesis failed:", e);
    }
  };

  // Speaks turn-by-turn prompts dynamically when steps advance and speech is unmuted
  useEffect(() => {
    if (speechEnabled && isNavigating && currentNavigationSteps[activeStepIndex]) {
      speakInstruction(currentNavigationSteps[activeStepIndex].instruction);
    }
  }, [activeStepIndex, activeSegmentIndex, speechEnabled, isNavigating, currentNavigationSteps]);

  // Autopilot autopilot simulation looping trigger
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isSimulatorRunning && isNavigating) {
      interval = setInterval(() => {
        setActiveStepIndex(prevStep => {
          if (prevStep < currentNavigationSteps.length - 1) {
            return prevStep + 1;
          } else {
            // Segment finished, move to next segment if available
            let hasNextSegment = false;
            setActiveSegmentIndex(prevSeg => {
              if (prevSeg < routeSegments.length - 1) {
                hasNextSegment = true;
                return prevSeg + 1;
              } else {
                return prevSeg;
              }
            });
            
            if (!hasNextSegment) {
              setIsSimulatorRunning(false);
              setIsNavigating(false);
              speakInstruction("Sie haben Ihre Saarland-Archäologietour erfolgreich abgeschlossen! Vielen Dank fürs Erkunden.");
              alert("Tour beendet! Sie haben Ihr historisches Endziel erreicht.");
              return prevStep;
            } else {
              return 0; // reset step on new segment
            }
          }
        });
      }, 5500); // comfortable reading pacing (5.5s per step)
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isSimulatorRunning, isNavigating, routeSegments.length, currentNavigationSteps]);

  // Compute the interpolated coordinate location of the simulated vehicle/walker
  const currentSimulatedPosition = useMemo((): [number, number] | null => {
    if (routeStops.length < 2 || activeSegmentIndex >= routeSegments.length) return null;
    
    // If we have actual road route data, use the coordinate of the current step!
    if (roadRouteData && roadRouteData.legs[activeSegmentIndex]) {
      const leg = roadRouteData.legs[activeSegmentIndex];
      const step = leg.steps[activeStepIndex];
      if (step && step.coord) {
        return step.coord;
      }
      return [leg.coordinates[0][0], leg.coordinates[0][1]];
    }

    const currentSegment = routeSegments[activeSegmentIndex];
    if (!currentSegment) return null;
    
    const from = currentSegment.from;
    const to = currentSegment.to;
    
    // progress map based on step indices (0 -> 0%, 1 -> 25%, 2 -> 65%, 3 -> 100%)
    const progresses = [0.0, 0.25, 0.65, 1.0];
    const progress = progresses[activeStepIndex] ?? 0.0;
    
    const lat = from.lat + (to.lat - from.lat) * progress;
    const lng = from.lng + (to.lng - from.lng) * progress;
    return [lat, lng];
  }, [routeSegments, activeSegmentIndex, activeStepIndex, routeStops.length, roadRouteData]);

  const handleUseUserLocationAsStart = () => {
    if (!navigator.geolocation) {
      alert('Geolokalisierung wird von Ihrem Browser nicht unterstützt.');
      return;
    }
    setIsLoadingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setUserLocation([lat, lng]);
        
        setRouteStops(prev => {
          // Remove old user-location if exists, insert new at head
          const filtered = prev.filter(stop => stop.id !== 'user-location');
          const userStop: RouteStop = {
            id: 'user-location',
            name: 'Mein Standort',
            lat,
            lng
          };
          return [userStop, ...filtered];
        });
        setIsLoadingLocation(false);
        setCenterUserTrigger(prev => prev + 1);
        setShowRoutePlanner(true);
      },
      (error) => {
        setIsLoadingLocation(false);
        let msg = 'Standort konnte nicht abgerufen werden.';
        if (error.code === 1) msg = 'Standort-Zugriff wurde verweigert. Bitte in Ihren Standorteinstellungen erlauben.';
        alert(msg);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleAddSiteToRoute = (site: Site) => {
    setRouteStops(prev => {
      if (prev.some(stop => stop.id === site.id)) return prev;
      const newStop: RouteStop = {
        id: site.id,
        name: site.name,
        lat: site.lat,
        lng: site.lng,
        site
      };
      return [...prev, newStop];
    });
    setShowRoutePlanner(true);
  };

  const handleRemoveStop = (id: string) => {
    setRouteStops(prev => prev.filter(stop => stop.id !== id));
  };

  const handleMoveStop = (index: number, direction: 'up' | 'down') => {
    setRouteStops(prev => {
      const copy = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= copy.length) return prev;
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
  };

  const handleOptimizeRoute = () => {
    if (routeStops.length <= 2) return;
    const remaining = [...routeStops];
    const optimized: RouteStop[] = [];
    
    // Position 0 stays as starting point
    optimized.push(remaining.shift()!);
    
    while (remaining.length > 0) {
      const current = optimized[optimized.length - 1];
      let nearestIndex = 0;
      let minDistance = Infinity;
      
      for (let i = 0; i < remaining.length; i++) {
        const dist = calculateDistance(current.lat, current.lng, remaining[i].lat, remaining[i].lng);
        if (dist < minDistance) {
          minDistance = dist;
          nearestIndex = i;
        }
      }
      optimized.push(remaining.splice(nearestIndex, 1)[0]);
    }
    setRouteStops(optimized);
  };

  const totalDistance = useMemo(() => {
    if (roadRouteData) {
      return roadRouteData.legs.reduce((sum, leg) => sum + leg.distance, 0);
    }
    return routeSegments.reduce((sum, seg) => sum + seg.distance, 0);
  }, [routeSegments, roadRouteData]);

  // Travel duration predictions
  const travelDurationEstimates = useMemo(() => {
    if (totalDistance === 0) return { car: 0, bike: 0, walk: 0 };
    
    if (roadRouteData) {
      const totalRoadDurationMins = Math.round(roadRouteData.legs.reduce((sum, leg) => sum + leg.duration, 0));
      
      const carMin = navTransportMode === 'car' ? totalRoadDurationMins : (totalDistance / 45) * 60;
      const bikeMin = navTransportMode === 'bike' ? totalRoadDurationMins : (totalDistance / 14) * 60;
      const walkMin = navTransportMode === 'walk' ? totalRoadDurationMins : (totalDistance / 4.0) * 60;
      
      return {
        car: Math.round(carMin),
        bike: Math.round(bikeMin),
        walk: Math.round(walkMin)
      };
    }

    const carMin = (totalDistance / 50) * 60 + (routeStops.length > 2 ? (routeStops.length - 1) * 2 : 0);
    const bikeMin = (totalDistance / 15) * 60;
    const walkMin = (totalDistance / 4.5) * 60;
    return {
      car: Math.round(carMin),
      bike: Math.round(bikeMin),
      walk: Math.round(walkMin)
    };
  }, [totalDistance, routeStops, roadRouteData, navTransportMode]);

  // Filter-Logik
  const filteredSites = useMemo(() => {
    return sites.filter(site => {
      const matchesSearch = !filters.search || 
        site.name.toLowerCase().includes(filters.search.toLowerCase()) || 
        site.beschreibung.toLowerCase().includes(filters.search.toLowerCase());
        
      const matchesGemeinde = !filters.gemeinde || site.gemeinde === filters.gemeinde;
      
      const matchesAccess = filters.barrierefreiheit === 'alle' || 
        (filters.barrierefreiheit === 'barrierefrei' && site.barrierefreiheit === true);
        
      const matchesAttraktion = !filters.kategorie_attraktion || site.kategorie_attraktion === filters.kategorie_attraktion;
      
      const matchesBefund = !filters.kategorie_befund || site.kategorie_befund === filters.kategorie_befund;
      
      const matchesSichtbarkeit = !filters.sichtbarkeit || site.sichtbarkeit === filters.sichtbarkeit;
      
      const matchesEintritt = filters.eintritt_frei === 'alle' || 
        (filters.eintritt_frei === 'kostenlos' && (
          site.eintrittspreis.toLowerCase().includes('kostenlos') || 
          site.eintrittspreis.toLowerCase().includes('frei')
        ));
        
      let matchesEpoch = true;
      if (selectedEpochs.length > 0) {
        if (Array.isArray(site.zeitstellung)) {
          matchesEpoch = site.zeitstellung.some(epoch => selectedEpochs.includes(epoch));
        } else {
          matchesEpoch = selectedEpochs.includes(site.zeitstellung) || site.zeitstellung === 'Mehrere Epochen';
        }
      }
      
      return matchesSearch && matchesGemeinde && matchesAccess && matchesAttraktion && matchesBefund && matchesSichtbarkeit && matchesEintritt && matchesEpoch;
    });
  }, [filters, selectedEpochs, sites]);

  // Alphabetisch sortierte Fundstellen für die Listenansicht
  const sortedSitesAlphabetical = useMemo(() => {
    return [...filteredSites].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [filteredSites]);

  // Dynamischer Marker-Clustering basierend auf dem Zoom-Level
  const clusteredData = useMemo(() => {
    return clusterSites(filteredSites, mapZoom);
  }, [filteredSites, mapZoom]);

  // Dynamische Filteroptionen aus den JSON-Daten
  const gemeinden = useMemo(() => {
    return Array.from(new Set(sites.map(s => s.gemeinde))).filter(Boolean).sort();
  }, [sites]);

  const epochen = useMemo(() => {
    const all = sites.flatMap(s => Array.isArray(s.zeitstellung) ? s.zeitstellung : [s.zeitstellung]);
    return Array.from(new Set(all)).filter(e => e && e !== 'Mehrere Epochen').sort();
  }, [sites]);

  const attraktionen = useMemo(() => {
    return Array.from(new Set(sites.map(s => s.kategorie_attraktion))).filter(Boolean).sort();
  }, [sites]);

  const befundTypen = useMemo(() => {
    return Array.from(new Set(sites.map(s => s.kategorie_befund))).filter(Boolean).sort();
  }, [sites]);

  const sichtbarkeiten = useMemo(() => {
    return Array.from(new Set(sites.map(s => s.sichtbarkeit))).filter(Boolean).sort();
  }, [sites]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.search.trim()) count++;
    if (filters.gemeinde) count++;
    if (filters.kategorie_attraktion) count++;
    if (filters.kategorie_befund) count++;
    if (filters.sichtbarkeit) count++;
    if (filters.barrierefreiheit !== 'alle') count++;
    if (filters.eintritt_frei !== 'alle') count++;
    if (selectedEpochs.length > 0) count += selectedEpochs.length;
    return count;
  }, [filters, selectedEpochs]);

  const resetFilters = () => {
    setFilters({
      search: '',
      gemeinde: '',
      barrierefreiheit: 'alle',
      kategorie_attraktion: '',
      kategorie_befund: '',
      sichtbarkeit: '',
      eintritt_frei: 'alle'
    });
    setSelectedEpochs([]);
  };

  return (
    <div className="h-screen bg-natural-bg flex flex-col font-sans overflow-hidden text-[#2d2d2d]">
      <Header currentView={view} setView={setView} />
      
      {view === 'map' || view === 'list' ? (
        <main className="flex-1 flex flex-col relative overflow-hidden">
          {/* Filter Bar */}
          <div className="bg-white border-b border-natural-border p-3 md:p-4 shadow-sm z-[1001]">
            <div className="max-w-7xl mx-auto flex flex-col gap-2.5">
              
              {/* Always visible top bar with Search and Route Planner Toggle */}
              <div className="flex flex-col md:flex-row gap-2 md:items-center">
                <div className="flex gap-2 items-center w-full">
                  {/* Search Text */}
                  <div className="relative group flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-natural-olive transition-colors" />
                    <input
                      type="text"
                      placeholder="Suche Fundstelle oder Info..."
                      value={filters.search}
                      onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                      className="w-full pl-9 pr-3 py-1.5 md:py-2 bg-natural-bg/40 border border-natural-border rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-natural-olive/25 focus:border-natural-olive transition-all outline-none"
                    />
                  </div>

                  {/* Route Planner Toggle Button */}
                  <button
                    onClick={() => setShowRoutePlanner(!showRoutePlanner)}
                    className={`px-3 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-semibold transition-all flex items-center gap-1.5 cursor-pointer border shrink-0 ${
                      showRoutePlanner 
                      ? 'bg-natural-olive text-white border-natural-olive shadow-sm ring-1 ring-natural-olive' 
                      : 'bg-white text-natural-olive border-natural-border hover:bg-natural-bg'
                    }`}
                    title="Routenplaner einblenden"
                  >
                    <Route className="w-4 h-4" />
                    <span className="hidden sm:inline">Routenplaner</span>
                    {routeStops.length > 0 && <span className="font-mono bg-amber-500 text-white rounded-full px-1.5 py-0.2 text-[10px]">{routeStops.length}</span>}
                  </button>

                  {/* Mobile Filter Toggle Button */}
                  <button
                    onClick={() => setIsMobileFiltersExpanded(!isMobileFiltersExpanded)}
                    className={`md:hidden p-2 border rounded-lg flex items-center gap-1 cursor-pointer transition-all shrink-0 text-xs font-bold leading-none ${
                      isMobileFiltersExpanded 
                      ? 'bg-natural-olive text-white border-natural-olive' 
                      : 'bg-natural-bg border-natural-border text-natural-olive hover:bg-natural-border/20'
                    }`}
                  >
                    <Filter className="w-4 h-4" />
                    <span>Filter</span>
                    {activeFiltersCount > 0 && (
                      <span className="bg-amber-600 text-white rounded-full w-4 h-4 text-[9px] flex items-center justify-center font-mono font-bold">
                        {activeFiltersCount}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Collapsible Selects and Epochen (Expanded on desktop automatically) */}
              <div className={`transition-all duration-300 overflow-hidden ${
                isMobileFiltersExpanded 
                ? 'max-h-[60vh] opacity-100 py-1 border-t border-dashed border-natural-border/50 mt-1' 
                : 'max-h-0 md:max-h-none opacity-0 md:opacity-100 overflow-hidden md:block'
              }`}>
                <div className="flex flex-wrap gap-2 items-center pt-1.5 md:pt-0">
                  {/* Gemeinde select */}
                  <select
                    value={filters.gemeinde}
                    onChange={e => setFilters(f => ({ ...f, gemeinde: e.target.value }))}
                    className="px-3 py-1.5 md:py-2 bg-natural-bg/40 border border-natural-border rounded-lg text-xs md:text-sm focus:ring-2 focus:ring-natural-olive/20 outline-none hover:bg-white transition-colors cursor-pointer flex-1 min-w-[130px] md:flex-initial"
                  >
                    <option value="">Alle Gemeinden</option>
                    {gemeinden.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>

                  {/* Kategorie/Attraktion select */}
                  <select
                    value={filters.kategorie_attraktion}
                    onChange={e => setFilters(f => ({ ...f, kategorie_attraktion: e.target.value }))}
                    className="px-3 py-1.5 md:py-2 bg-natural-bg/40 border border-natural-border rounded-lg text-xs md:text-sm focus:ring-2 focus:ring-natural-olive/20 outline-none hover:bg-white transition-colors cursor-pointer flex-1 min-w-[130px] md:flex-initial"
                  >
                    <option value="">Alle Attraktionen</option>
                    {attraktionen.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>

                  {/* Kategorie/Befund select */}
                  <select
                    value={filters.kategorie_befund}
                    onChange={e => setFilters(f => ({ ...f, kategorie_befund: e.target.value }))}
                    className="px-3 py-1.5 md:py-2 bg-natural-bg/40 border border-natural-border rounded-lg text-xs md:text-sm focus:ring-2 focus:ring-natural-olive/20 outline-none hover:bg-white transition-colors cursor-pointer flex-1 min-w-[150px] md:flex-initial"
                  >
                    <option value="">Alle Befunde / Strukturen</option>
                    {befundTypen.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>

                  {/* Sichtbarkeit select */}
                  <select
                    value={filters.sichtbarkeit}
                    onChange={e => setFilters(f => ({ ...f, sichtbarkeit: e.target.value }))}
                    className="px-3 py-1.5 md:py-2 bg-natural-bg/40 border border-natural-border rounded-lg text-xs md:text-sm focus:ring-2 focus:ring-natural-olive/20 outline-none hover:bg-white transition-colors cursor-pointer flex-1 min-w-[130px] md:flex-initial"
                  >
                    <option value="">Sichtbarkeit: Alle</option>
                    {sichtbarkeiten.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>

                  {/* Barrierefreiheit select */}
                  <select
                    value={filters.barrierefreiheit}
                    onChange={e => setFilters(f => ({ ...f, barrierefreiheit: e.target.value }))}
                    className="px-3 py-1.5 md:py-2 bg-natural-bg/40 border border-natural-border rounded-lg text-xs md:text-sm focus:ring-2 focus:ring-natural-olive/20 outline-none hover:bg-white transition-colors cursor-pointer flex-1 min-w-[130px] md:flex-initial"
                  >
                    <option value="alle">Barrierefreiheit: Alle</option>
                    <option value="barrierefrei">Nur Barrierefreie</option>
                  </select>

                  {/* Eintritt select */}
                  <select
                    value={filters.eintritt_frei}
                    onChange={e => setFilters(f => ({ ...f, eintritt_frei: e.target.value }))}
                    className="px-3 py-1.5 md:py-2 bg-natural-bg/40 border border-natural-border rounded-lg text-xs md:text-sm focus:ring-2 focus:ring-natural-olive/20 outline-none hover:bg-white transition-colors cursor-pointer flex-1 min-w-[110px] md:flex-initial"
                  >
                    <option value="alle">Eintritt: Alle</option>
                    <option value="kostenlos">Nur Kostenlos</option>
                  </select>

                  {/* Reset button */}
                  {activeFiltersCount > 0 && (
                    <button
                      onClick={resetFilters}
                      className="p-1.5 text-rose-700 hover:text-rose-900 transition-colors flex items-center justify-center cursor-pointer ml-auto shrink-0 text-xs font-bold leading-none bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200"
                      title="Filter zurücksetzen"
                    >
                      <Filter className="w-3.5 h-3.5 mr-1 text-rose-600" />
                      <span>Leeren</span>
                    </button>
                  )}
                </div>

                {/* Epoch / Chronology filter quick-actions */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2.5 mt-2 border-t border-dashed border-natural-border/30">
                  <div className="flex items-center gap-1.5 text-natural-olive shrink-0">
                    <Calendar className="w-4 h-4 text-natural-olive" />
                    <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider">Epochen filtern:</span>
                  </div>
                  <div className="flex flex-wrap gap-1 items-center">
                    {epochen.map(epoch => {
                      const isSelected = selectedEpochs.includes(epoch);
                      return (
                        <button
                          key={epoch}
                          onClick={() => {
                            setSelectedEpochs(prev =>
                              prev.includes(epoch)
                                ? prev.filter(e => e !== epoch)
                                : [...prev, epoch]
                            );
                          }}
                          className={`px-2.5 py-1 rounded-full text-[10px] md:text-xs font-semibold transition-all cursor-pointer ${
                            isSelected 
                            ? 'bg-natural-olive text-white shadow-sm ring-1 ring-natural-olive/35' 
                            : 'bg-natural-bg text-gray-700 hover:bg-gray-200 border border-natural-border'
                          }`}
                        >
                          {epoch}
                        </button>
                      );
                    })}
                    {selectedEpochs.length > 0 && (
                      <button
                        onClick={() => setSelectedEpochs([])}
                        className="px-2 py-1 text-natural-olive hover:text-natural-olive-dark text-[10px] md:text-xs font-semibold underline cursor-pointer"
                      >
                        Alle Epochen
                      </button>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Map & Panels area */}
          {view === 'map' ? (
            <div className="flex-1 flex flex-col md:flex-row relative overflow-hidden">
            
            {/* Slide-in sidebar for Route Planning */}
            <div className={`transition-all duration-300 flex flex-col border-r border-natural-border bg-white z-[1002] shrink-0 md:relative absolute bottom-0 left-0 right-0 md:top-0 ${
              showRoutePlanner 
              ? 'h-[45vh] md:h-full w-full md:w-[380px] translate-y-0 opacity-100 shadow-xl' 
              : 'h-0 md:h-full w-full md:w-0 translate-y-full md:translate-y-0 opacity-0 md:opacity-0 overflow-hidden border-none'
            }`}>
              {isNavigating ? (
                /* --- IN-APP ACTIVE NAVIGATION CONTROL CENTER --- */
                <div className="flex-1 flex flex-col h-full overflow-hidden bg-natural-bg/10">
                  {/* Header alert panel */}
                  <div className="p-4 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between shadow-xs">
                    <div className="flex items-center gap-2.5">
                      <Compass className="w-5 h-5 text-amber-700 animate-spin-slow shrink-0" />
                      <div>
                        <h4 className="font-serif font-black text-[#1b2a1a] text-sm">Aktive Navigation</h4>
                        <span className="text-[10px] text-amber-800 font-bold tracking-tight block leading-none mt-0.5">
                          Etappe {activeSegmentIndex + 1} von {routeSegments.length}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setIsNavigating(false);
                        setIsSimulatorRunning(false);
                        if (window.speechSynthesis) window.speechSynthesis.cancel();
                      }}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-bold uppercase transition-all shadow-sm cursor-pointer hover:scale-105"
                    >
                      Beenden
                    </button>
                  </div>

                  {/* Body Content */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    
                    {/* Transit selection */}
                    <div className="space-y-1.5">
                      <span className="text-[9px] uppercase font-bold text-gray-400 block tracking-wider">Verkehrsmittel wählen</span>
                      <div className="grid grid-cols-3 gap-1 px-0.5">
                        {[
                          { id: 'car', icon: '🚗', name: 'Auto' },
                          { id: 'bike', icon: '🚲', name: 'Fahrrad' },
                          { id: 'walk', icon: '🥾', name: 'Wandern' }
                        ].map(tMode => {
                          const isActive = navTransportMode === tMode.id;
                          return (
                            <button
                              key={tMode.id}
                              onClick={() => {
                                setNavTransportMode(tMode.id as any);
                                setActiveStepIndex(0);
                              }}
                              className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1 cursor-pointer hover:bg-natural-bg/50 ${
                                isActive 
                                ? 'bg-natural-olive text-white border-natural-olive shadow-xs ring-1 ring-natural-olive/35'
                                : 'bg-white text-gray-700 border-natural-border hover:bg-natural-bg'
                              }`}
                            >
                              <span className="text-sm shrink-0">{tMode.icon}</span>
                              <span className="text-[11px] truncate">{tMode.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Active dynamic turn-by-turn card */}
                    {currentNavigationSteps[activeStepIndex] && (
                      <div className="bg-amber-50/45 p-4 rounded-xl border border-amber-500/15 shadow-sm flex flex-col gap-3 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-[0.04] font-serif text-7xl pointer-events-none select-none italic text-amber-900">
                          {activeStepIndex === currentNavigationSteps.length - 1 ? '🏁' : '➦'}
                        </div>
                        
                        {isFetchingRoute && (
                          <div className="absolute inset-0 bg-white/70 backdrop-blur-xs flex items-center justify-center gap-2 z-10">
                            <RefreshCw className="w-4 h-4 animate-spin text-amber-700" />
                            <span className="text-xs font-bold text-amber-900">Lade optimale Straßenroute...</span>
                          </div>
                        )}

                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-800 font-bold shrink-0 shadow-3xs border border-amber-500/15">
                            {(() => {
                              const stepIcon = currentNavigationSteps[activeStepIndex].icon;
                              if (stepIcon === 'start') return <Compass className="w-5 h-5 text-amber-800 animate-spin-slow" />;
                              if (stepIcon === 'left') return <ChevronDown className="w-5 h-5 text-amber-800 -rotate-90" />;
                              if (stepIcon === 'right') return <ChevronDown className="w-5 h-5 text-amber-800 rotate-90" />;
                              if (stepIcon === 'arrival') return <Check className="w-5 h-5 text-amber-800" />;
                              return <ChevronUp className="w-5 h-5 text-amber-800" />;
                            })()}
                          </div>

                          <div className="flex-1">
                            <span className="text-[9px] uppercase font-bold text-amber-800 tracking-wider block">Nächste Anweisung</span>
                            <p className="text-xs font-bold text-gray-800 leading-relaxed font-sans mt-0.5">
                              {currentNavigationSteps[activeStepIndex].instruction}
                            </p>
                          </div>
                        </div>

                        {/* Sub-duration / metric line */}
                        <div className="flex justify-between items-center text-[10px] text-amber-900/90 font-semibold bg-white rounded-lg px-2.5 py-2 border border-amber-500/10 shadow-3xs">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-amber-700" />
                            <span>Streckenteilstück:</span>
                          </span>
                          <span className="font-mono text-amber-950 font-black text-sm">
                            {currentNavigationSteps[activeStepIndex].distance.toFixed(1)} km
                          </span>
                        </div>

                        {/* Audio guide controllers */}
                        <div className="flex items-center justify-between gap-4 pt-1 border-t border-amber-500/10">
                          <button
                            onClick={() => speakInstruction(currentNavigationSteps[activeStepIndex].instruction)}
                            className="bg-white hover:bg-amber-100/60 border border-amber-500/15 text-amber-900 py-1.5 px-3 rounded-lg text-[10px] font-bold transition-all shadow-3xs flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M12 18.75V5.25L7.75 9.5H4.5v5h3.25L12 18.75z" />
                            </svg>
                            <span>Schritt vorlesen</span>
                          </button>

                          <button
                            onClick={() => setSpeechEnabled(!speechEnabled)}
                            className={`py-1.5 px-3 rounded-lg text-[10px] font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                              speechEnabled 
                              ? 'bg-amber-600 border-amber-600 text-white shadow-3xs' 
                              : 'bg-white border-amber-500/15 text-amber-900 hover:bg-amber-50'
                            }`}
                          >
                            <span>{speechEnabled ? '🔈 Audio AN' : '🔇 Audio AUS'}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Step Controls */}
                    <div className="p-3 bg-white border border-natural-border/60 rounded-xl space-y-3.5 shadow-3xs">
                      <div>
                        <span className="text-[9px] uppercase font-black text-gray-400 block tracking-wider leading-none">Routensteuerung</span>
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            disabled={activeSegmentIndex === 0 && activeStepIndex === 0}
                            onClick={() => {
                              if (activeStepIndex > 0) {
                                setActiveStepIndex(prev => prev - 1);
                              } else if (activeSegmentIndex > 0) {
                                const prevSegIndex = activeSegmentIndex - 1;
                                const prevStepsCount = roadRouteData && roadRouteData.legs[prevSegIndex]
                                  ? roadRouteData.legs[prevSegIndex].steps.length
                                  : 4;
                                setActiveSegmentIndex(prevSegIndex);
                                setActiveStepIndex(prevStepsCount - 1);
                              }
                            }}
                            className="flex-1 py-2 bg-white hover:bg-natural-bg text-natural-olive disabled:opacity-40 disabled:cursor-not-allowed border border-natural-border rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer shadow-3xs"
                          >
                            <ChevronDown className="w-4 h-4 rotate-90 shrink-0" />
                            <span>ZURÜCK</span>
                          </button>

                          <button
                            disabled={
                              activeSegmentIndex === routeSegments.length - 1 && activeStepIndex === currentNavigationSteps.length - 1
                            }
                            onClick={() => {
                              if (activeStepIndex < currentNavigationSteps.length - 1) {
                                setActiveStepIndex(prev => prev + 1);
                              } else if (activeSegmentIndex < routeSegments.length - 1) {
                                setActiveSegmentIndex(prev => prev + 1);
                                setActiveStepIndex(0);
                              }
                            }}
                            className="flex-1 py-2 bg-white hover:bg-natural-bg text-natural-olive disabled:opacity-40 disabled:cursor-not-allowed border border-natural-border rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer shadow-3xs"
                          >
                            <span>WEITER</span>
                            <ChevronDown className="w-4 h-4 -rotate-90 shrink-0" />
                          </button>
                        </div>
                      </div>

                      {/* Autopilot Automation */}
                      <div className="pt-2 border-t border-natural-bg/50">
                        <button
                          onClick={() => setIsSimulatorRunning(!isSimulatorRunning)}
                          className={`w-full py-2.5 rounded-xl border font-black text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer ${
                            isSimulatorRunning 
                            ? 'bg-amber-600 border-amber-600 text-white' 
                            : 'bg-white border-amber-300 text-amber-900 hover:bg-amber-50/50'
                          }`}
                        >
                          <RefreshCw className={`w-4 h-4 shrink-0 ${isSimulatorRunning ? 'animate-spin' : ''}`} />
                          <span>{isSimulatorRunning ? 'AUTOPILOT STOPPEN' : 'SIMULATION STARTEN (AUTOPILOT)'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Historical Destination Site Detail card */}
                    {(() => {
                      const nextStop = routeStops[activeSegmentIndex + 1];
                      const site = nextStop?.site;
                      if (!site) return null;
                      return (
                        <div className="bg-white p-4 rounded-xl border border-natural-border shadow-sm space-y-3 font-sans transition-all">
                          <div className="flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-natural-olive shrink-0" />
                            <span className="text-[9px] uppercase font-bold text-gray-400 tracking-wider">Erwarteter Fundort</span>
                          </div>
                          
                          <div className="font-serif font-black text-natural-olive text-sm leading-tight">
                            {site.name}
                          </div>
                          
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            <span className="bg-natural-bg text-natural-olive text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wide">
                              {site.kategorie_attraktion}
                            </span>
                            <span className="bg-[#1b2a1a]/5 text-natural-olive/95 text-[9px] font-bold px-2 py-0.5 rounded-md uppercase font-mono">
                              {site.zeitstellung}
                            </span>
                          </div>

                          <p className="text-xs text-gray-500 leading-relaxed italic max-h-24 overflow-y-auto pr-1">
                            "{site.beschreibung}"
                          </p>

                          <button
                            onClick={() => speakInstruction(`${site.name}. Epoche: ${site.zeitstellung}. Information: ${site.beschreibung}`)}
                            className="w-full bg-natural-bg hover:bg-natural-border/40 text-natural-olive font-bold text-[10px] py-2 rounded-xl border border-natural-border transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-3xs"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M12 18.75V5.25L7.75 9.5H4.5v5h3.25L12 18.75z" />
                            </svg>
                            <span>Audio-Guide: Geschichte anhören</span>
                          </button>
                        </div>
                      );
                    })()}

                  </div>

                  {/* Progress metric footer */}
                  <div className="p-4 border-t border-natural-border bg-amber-50/10 space-y-2 shrink-0">
                    <div className="flex justify-between text-xs text-gray-650 font-bold">
                      <span>Verbleibende Reststrecke:</span>
                      <span className="font-mono text-natural-olive font-black text-sm">
                        {(() => {
                          const doneSegsDist = routeSegments.slice(0, activeSegmentIndex).reduce((sum, seg) => sum + seg.distance, 0);
                          const activeSeg = routeSegments[activeSegmentIndex];
                          const activeSegProgressDist = activeSeg ? activeSeg.distance * ([0.0, 0.25, 0.65, 1.0][activeStepIndex] ?? 0) : 0;
                          const totalDone = doneSegsDist + activeSegProgressDist;
                          return Math.max(0, totalDistance - totalDone).toFixed(1);
                        })()} km
                      </span>
                    </div>

                    <div className="w-full bg-natural-bg h-2 rounded-full overflow-hidden border border-natural-border/55">
                      <div 
                        className="bg-amber-600 h-full transition-all duration-300" 
                        style={{
                          width: `${(() => {
                            const doneSegsDist = routeSegments.slice(0, activeSegmentIndex).reduce((sum, seg) => sum + seg.distance, 0);
                            const activeSeg = routeSegments[activeSegmentIndex];
                            const activeSegProgressDist = activeSeg ? activeSeg.distance * ([0.0, 0.25, 0.65, 1.0][activeStepIndex] ?? 0) : 0;
                            const totalDone = doneSegsDist + activeSegProgressDist;
                            return Math.min(100, Math.max(0, (totalDone / totalDistance) * 100));
                          })()}%`
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* --- STANDBY: ROUTE PLANNER STOP CONFIGURATION PANEL --- */
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                  <div className="p-4 bg-natural-bg/50 border-b border-natural-border flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                      <Route className="w-5 h-5 text-natural-olive" />
                      <h3 className="font-serif font-bold text-natural-olive text-base">Routenplaner</h3>
                    </div>
                    <button
                      onClick={() => setShowRoutePlanner(false)}
                      className="p-1 hover:bg-natural-border rounded-full text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
                      title="Einklappen"
                    >
                      <ChevronDown className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Route stop list / controls */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Location control */}
                    {!routeStops.some(s => s.id === 'user-location') ? (
                      <button
                        onClick={handleUseUserLocationAsStart}
                        disabled={isLoadingLocation}
                        className="w-full py-2.5 px-3 bg-white hover:bg-blue-50/50 border border-blue-200 rounded-xl text-blue-800 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-3xs disabled:opacity-75 disabled:cursor-not-allowed"
                      >
                        {isLoadingLocation ? (
                          <RefreshCw className="w-4 h-4 animate-spin text-blue-700" />
                        ) : (
                          <Compass className="w-4 h-4 text-blue-700" />
                        )}
                        <span>Meinen Standort als Startpunkt verwenden</span>
                      </button>
                    ) : (
                      <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 font-semibold text-blue-900">
                          <Compass className="w-4 h-4 text-blue-700" />
                          <span>Benutzerstandort ist Startpunkt</span>
                        </div>
                        <button
                          onClick={() => {
                            setUserLocation(null);
                            handleRemoveStop('user-location');
                          }}
                          className="text-[10px] text-red-600 font-bold hover:underline"
                        >
                          Entfernen
                        </button>
                      </div>
                    )}

                    {/* Stops list */}
                    {routeStops.length === 0 ? (
                      <div className="text-center py-8 text-xs text-gray-400 font-medium">
                        <MapPin className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                        <p>Noch keine Stopps in der Route.</p>
                        <p className="mt-1 text-[10px]">Wähle eine Fundstelle auf der Karte und klicke "Route hinzufügen".</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider mb-2">Gewählte Stopps</span>
                        <div className="relative">
                          {routeStops.map((stop, index) => {
                            const isUserLoc = stop.id === 'user-location';
                            const segmentToNext = routeSegments[index];
                            
                            return (
                              <div key={stop.id} className="relative">
                                <div className="p-3 bg-natural-bg/30 rounded-xl border border-natural-border/60 hover:bg-white transition-colors flex items-center gap-3 relative z-10 group shadow-3xs">
                                  {/* Number/Icon badge */}
                                  <div className={`w-6 h-6 rounded-full text-xs font-mono font-bold flex items-center justify-center shrink-0 ${
                                    isUserLoc ? 'bg-blue-600 text-white' : 'bg-[#1b2a1a] text-white'
                                  }`}>
                                    {isUserLoc ? <Compass className="w-3.5 h-3.5" /> : index + 1}
                                  </div>

                                  {/* Stop title */}
                                  <div className="flex-1 min-w-0">
                                    <span className="text-xs font-bold font-serif text-natural-olive block truncate" title={stop.name}>
                                      {stop.name}
                                    </span>
                                    {!isUserLoc && stop.site && (
                                      <span className="text-[10px] text-gray-500 block truncate leading-none mt-0.5 font-sans">
                                        {stop.site.gemeinde}
                                      </span>
                                    )}
                                  </div>

                                  {/* Up/Down/Delete Controls */}
                                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                                    {index > 0 && (
                                      <button
                                        onClick={() => handleMoveStop(index, 'up')}
                                        className="p-1 text-gray-400 hover:text-natural-olive rounded-md hover:bg-natural-bg cursor-pointer"
                                        title="Nach oben verschieben"
                                      >
                                        <ChevronUp className="w-4 h-4" />
                                      </button>
                                    )}
                                    {index < routeStops.length - 1 && (
                                      <button
                                        onClick={() => handleMoveStop(index, 'down')}
                                        className="p-1 text-gray-400 hover:text-natural-olive rounded-md hover:bg-natural-bg cursor-pointer"
                                        title="Nach unten verschieben"
                                      >
                                        <ChevronDown className="w-4 h-4" />
                                      </button>
                                    )}
                                    <button
                                      onClick={() => {
                                        if (isUserLoc) setUserLocation(null);
                                        handleRemoveStop(stop.id);
                                      }}
                                      className="p-1 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50 cursor-pointer"
                                      title="Stopp entfernen"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>

                                {/* Line connecting to next with distance banner */}
                                {segmentToNext && (
                                  <div className="my-1.5 ml-3 pl-5 border-l-2 border-dashed border-natural-border/60 relative h-7 flex items-center">
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2.5 h-[2px] bg-natural-border/60"></div>
                                    <div className="bg-natural-bg/90 backdrop-blur-xs border border-natural-border text-[9px] font-mono font-bold text-natural-olive py-0.5 px-2 rounded-full shadow-3xs leading-none">
                                      {(() => {
                                        const dist = roadRouteData && roadRouteData.legs[index]
                                          ? roadRouteData.legs[index].distance
                                          : segmentToNext.distance;
                                        return `${dist.toFixed(1)} km ${roadRouteData ? '(Straße)' : '(Luftlinie)'}`;
                                      })()} bis zum nächsten Stopp
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Bottom stats & action triggers */}
                  {routeStops.length > 0 && (
                    <div className="p-4 border-t border-natural-border bg-natural-bg/40 space-y-3 shrink-0">
                      {/* Stats card */}
                      <div className="p-3 bg-white rounded-xl border border-natural-border space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-gray-500">Gesamtdistanz:</span>
                          <span className="font-mono font-black text-sm text-natural-olive">{totalDistance.toFixed(1)} km</span>
                        </div>

                        {/* Estimates grid */}
                        {totalDistance > 0 && (
                          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-natural-bg text-[10px] text-gray-600 font-semibold font-sans">
                            <div className="flex flex-col items-center bg-natural-bg/30 p-1.5 rounded-lg border border-natural-border/40">
                              <span className="text-gray-400 uppercase text-[8px] tracking-tight">Fahrzeit</span>
                              <span className="font-bold text-[#2d2d2d] mt-1">
                                {travelDurationEstimates.car >= 60 
                                  ? `${Math.floor(travelDurationEstimates.car / 60)}h ${travelDurationEstimates.car % 60}m` 
                                  : `${travelDurationEstimates.car} Min.`}
                              </span>
                            </div>
                            <div className="flex flex-col items-center bg-natural-bg/30 p-1.5 rounded-lg border border-natural-border/40">
                              <span className="text-gray-400 uppercase text-[8px] tracking-tight">Radzeit</span>
                              <span className="font-bold text-[#2d2d2d] mt-1">
                                {travelDurationEstimates.bike >= 60 
                                  ? `${Math.floor(travelDurationEstimates.bike / 60)}h ${travelDurationEstimates.bike % 60}m` 
                                  : `${travelDurationEstimates.bike} Min.`}
                              </span>
                            </div>
                            <div className="flex flex-col items-center bg-natural-bg/30 p-1.5 rounded-lg border border-natural-border/40">
                              <span className="text-gray-400 uppercase text-[8px] tracking-tight">Gehzeit</span>
                              <span className="font-bold text-[#2d2d2d] mt-1">
                                {travelDurationEstimates.walk >= 60 
                                  ? `${Math.floor(travelDurationEstimates.walk / 60)}h ${travelDurationEstimates.walk % 60}m` 
                                  : `${travelDurationEstimates.walk} Min.`}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Actions buttons */}
                      <div className="space-y-1.5">
                        {routeStops.length > 2 && (
                          <button
                            onClick={handleOptimizeRoute}
                            className="w-full bg-white hover:bg-natural-bg text-natural-olive border border-natural-border py-2 rounded-lg text-xs font-bold transition-all shadow-3xs flex items-center justify-center gap-1.5 cursor-pointer"
                            title="Sortiert Stops, um die Gesamtstrecke zu minimieren"
                          >
                            <RefreshCw className="w-3.5 h-3.5 animate-spin-slow text-natural-olive" />
                            Reihenfolge optimieren
                          </button>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setFocusRouteTrigger(prev => prev + 1)}
                            className="bg-white hover:bg-natural-bg text-natural-olive border border-natural-border py-2 rounded-lg text-xs font-bold transition-all shadow-3xs flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Navigation className="w-3.5 h-3.5" />
                            Fokussieren
                          </button>

                          <button
                            onClick={() => {
                              setUserLocation(null);
                              setRouteStops([]);
                            }}
                            className="bg-red-50 hover:bg-red-100 text-red-750 border border-red-200 py-2 rounded-lg text-xs font-bold transition-all shadow-3xs flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Route leeren
                          </button>
                        </div>

                        {totalDistance > 0 && (
                          <div className="space-y-2 pt-1 border-t border-natural-border/40">
                            {/* Primary fully local in-app navigation */}
                            <button
                              onClick={() => {
                                setIsNavigating(true);
                                setActiveSegmentIndex(0);
                                setActiveStepIndex(0);
                              }}
                              className="w-full bg-natural-olive hover:bg-natural-olive-dark text-white py-2.5 rounded-xl text-xs font-black transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.01]"
                            >
                              <Compass className="w-4 h-4 text-white animate-spin-slow" />
                              <span>Aktive Navigation starten</span>
                            </button>

                            <div className="text-center py-1 bg-amber-50 rounded-lg border border-amber-200">
                              <span className="text-[10px] font-bold text-amber-800 flex items-center justify-center gap-1">
                                🚗 Aktives Straßen-Routing (100% intern)
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Map & Legend area */}
            <div className="flex-1 relative h-full min-h-[400px]">
              <MapContainer
                center={[49.38, 6.95]}
                zoom={window.innerWidth < 768 ? 9 : 10}
                className="h-full w-full"
                zoomControl={true}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                
                <CustomMetricScaleControl />

                {/* Draw Route Polyline */}
                {routeStops.length > 1 && (
                  <Polyline
                    positions={
                      roadRouteData && roadRouteData.fullPath.length > 0
                        ? roadRouteData.fullPath
                        : routeStops.map(s => [s.lat, s.lng] as [number, number])
                    }
                    color="#5A5A40"
                    weight={4}
                    opacity={0.65}
                    dashArray={roadRouteData ? undefined : "6, 8"}
                  />
                )}

                {/* Highlighted Active Navigation segment of the current leg */}
                {isNavigating && (
                  <Polyline
                    positions={
                      roadRouteData && roadRouteData.legs[activeSegmentIndex]
                        ? roadRouteData.legs[activeSegmentIndex].coordinates
                        : routeSegments[activeSegmentIndex]
                        ? [
                            [routeSegments[activeSegmentIndex].from.lat, routeSegments[activeSegmentIndex].from.lng],
                            [routeSegments[activeSegmentIndex].to.lat, routeSegments[activeSegmentIndex].to.lng]
                          ]
                        : []
                    }
                    color="#d97706"
                    weight={5}
                    opacity={0.9}
                  />
                )}

                {/* Map Action Sync Controller */}
                <MapActions 
                  points={routeStops.map(s => [s.lat, s.lng] as [number, number])}
                  focusTrigger={focusRouteTrigger}
                  userLoc={userLocation}
                  centerTrigger={centerUserTrigger}
                />

                {/* Tracks map zoom for adaptive site clustering */}
                <MapZoomListener onZoomChange={setMapZoom} />

                {/* Map Legend (Bottom-Left overlay, placed inside MapContainer for proper mobile z-index stacking context) */}
                <div className={`absolute bottom-6 left-6 bg-white/95 backdrop-blur-xs p-3.5 rounded-xl border border-natural-border flex-col gap-2.5 shadow-md z-[500] md:z-[1000] select-none text-[11px] font-sans transition-all duration-200 ${
                  isPopupOpen ? 'hidden md:flex' : 'flex'
                }`}>
                  <div className="font-bold text-natural-olive border-b border-natural-bg pb-1 uppercase tracking-wider text-[10px]">
                    Kategorienschlüssel
                  </div>
                  <div className="flex items-center gap-2 font-semibold text-gray-700">
                    <div className="w-3 h-3 rounded-full bg-blue-600 border border-white shadow-xs"></div>
                    Museum & Freilichtmuseum
                  </div>
                  <div className="flex items-center gap-2 font-semibold text-gray-700">
                    <div className="w-3 h-3 rounded-full bg-green-700 border border-white shadow-xs"></div>
                    Rekonstruktion
                  </div>
                  <div className="flex items-center gap-2 font-semibold text-gray-700">
                    <div className="w-3 h-3 rounded-full bg-orange-700 border border-white shadow-xs"></div>
                    Bodendenkmal & Gedenkstätte
                  </div>
                  <div className="text-[10px] text-gray-400 pt-1 text-right italic font-normal">
                    {filteredSites.length} von {sites.length} Orten gefunden
                  </div>
                </div>

                {/* User Location Marker */}
                {userLocation && (
                  <Marker 
                    position={userLocation} 
                    icon={getUserLocationIcon()}
                    eventHandlers={{
                      popupopen: () => setIsPopupOpen(true),
                      popupclose: () => setIsPopupOpen(false),
                    }}
                  >
                    <Popup minWidth={180}>
                      <div className="p-2 text-center text-xs font-sans">
                        <div className="font-bold text-natural-olive flex items-center gap-1 justify-center">
                          <Compass className="w-3.5 h-3.5 text-blue-700" />
                          Mein Startpunkt
                        </div>
                        <p className="text-gray-500 mt-1">Hier beginnt Ihre Route</p>
                        <button 
                          onClick={() => {
                            setUserLocation(null);
                            handleRemoveStop('user-location');
                          }}
                          className="mt-2 text-[10px] text-red-600 font-semibold hover:underline cursor-pointer"
                        >
                          Startpunkt löschen
                        </button>
                      </div>
                    </Popup>
                  </Marker>
                )}

                {/* Active Simulated Position Marker */}
                {isNavigating && currentSimulatedPosition && (
                  <Marker 
                    position={currentSimulatedPosition} 
                    icon={getSimulatedTravelerIcon(navTransportMode)}
                    eventHandlers={{
                      popupopen: () => setIsPopupOpen(true),
                      popupclose: () => setIsPopupOpen(false),
                    }}
                  >
                    <Popup minWidth={180}>
                      <div className="p-2 text-center text-xs font-sans">
                        <div className="font-bold text-amber-900 flex items-center gap-1 justify-center">
                          <Compass className="w-3.5 h-3.5 text-amber-700 animate-spin-slow" />
                          <span>Ihre Position (Simuliert)</span>
                        </div>
                        <p className="text-gray-500 mt-1 text-[11px]">Sie bewegen sich entlang der Route.</p>
                        <div className="mt-2 text-[10px] font-mono bg-amber-500/10 text-amber-950 rounded py-0.5 px-1 inline-block">
                          {currentSimulatedPosition[0].toFixed(5)}, {currentSimulatedPosition[1].toFixed(5)}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                )}

                {/* Dynamically clustered or individual site markers */}
                {clusteredData.map(item => {
                  if (isCluster(item)) {
                    return (
                      <ClusterMarker 
                        key={item.id} 
                        cluster={item} 
                        currentZoom={mapZoom} 
                      />
                    );
                  }

                  const site = item;
                  const stopIndex = routeStops.findIndex(s => s.id === site.id);
                  const isStopInRoute = stopIndex !== -1;
                  return (
                    <Marker 
                      key={site.id} 
                      position={[site.lat, site.lng]}
                      icon={getMarkerIcon(site.kategorie_attraktion)}
                      eventHandlers={{
                        popupopen: () => setIsPopupOpen(true),
                        popupclose: () => setIsPopupOpen(false),
                      }}
                    >
                      <Popup minWidth={330} className="arch-popup">
                        <SitePopup 
                          site={site} 
                          isStopInRoute={isStopInRoute}
                          routeIndex={stopIndex !== -1 ? stopIndex + 1 : undefined}
                          onAddToRoute={handleAddSiteToRoute}
                          onRemoveFromRoute={handleRemoveStop}
                        />
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            </div>
          </div>
          ) : (
            <div className="flex-1 flex flex-col md:flex-row relative overflow-hidden bg-[#f4f5f0]">
              {/* Left Panel: Alphabetically sorted list of sites */}
              <div className={`w-full md:w-[380px] border-r border-natural-border bg-white flex flex-col shrink-0 h-full overflow-hidden ${
                selectedListSiteId ? 'hidden md:flex' : 'flex'
              }`}>
                {/* List Header/Sub-Header showing count of sites */}
                <div className="p-4 border-b border-natural-border bg-natural-bg/10 flex items-center justify-between">
                  <span className="text-xs font-bold text-natural-olive uppercase tracking-wider">
                    {sortedSitesAlphabetical.length} {sortedSitesAlphabetical.length === 1 ? 'Fundstelle' : 'Fundstellen'} gefunden
                  </span>
                  {filteredSites.length !== sites.length && (
                    <button
                      onClick={resetFilters}
                      className="text-[10px] text-natural-olive hover:underline font-bold"
                    >
                      Filter zurücksetzen
                    </button>
                  )}
                </div>

                {/* Scrollable list items */}
                <div className="flex-1 overflow-y-auto divide-y divide-natural-bg">
                  {sortedSitesAlphabetical.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-sm text-gray-500 font-sans">
                        Keine Fundorte entsprechen Ihren Filtereinstellungen.
                      </p>
                      <button
                        onClick={resetFilters}
                        className="mt-4 px-4 py-2 bg-natural-olive text-white rounded-lg text-xs font-bold hover:bg-natural-olive-dark transition-all cursor-pointer"
                      >
                        Filter zurücksetzen
                      </button>
                    </div>
                  ) : (
                    sortedSitesAlphabetical.map(site => {
                      const isStopInRoute = routeStops.some(stop => stop.id === site.id);
                      return (
                        <div
                          key={site.id}
                          onClick={() => setSelectedListSiteId(site.id)}
                          className={`p-4 transition-all cursor-pointer flex flex-col gap-2 relative border-l-4 ${
                            selectedListSiteId === site.id
                              ? 'bg-natural-bg/35 border-l-natural-olive'
                              : 'bg-white border-l-transparent hover:bg-natural-bg/15'
                          }`}
                        >
                          <div>
                            <h3 className="font-serif font-black text-sm text-gray-800 hover:text-natural-olive transition-colors leading-snug">
                              {site.name}
                            </h3>
                            <div className="flex items-center gap-1.5 text-[10px] text-gray-500 font-medium font-sans mt-1">
                              <MapPin className="w-3.5 h-3.5 text-natural-olive/70 shrink-0" />
                              <span>{site.gemeinde}</span>
                              <span className="text-gray-300">•</span>
                              <span className="italic block capitalize">
                                {Array.isArray(site.zeitstellung) ? site.zeitstellung.join(', ') : site.zeitstellung}
                              </span>
                            </div>
                          </div>

                          <p className="text-[11px] text-gray-600 line-clamp-2 leading-relaxed">
                            {site.beschreibung}
                          </p>

                          <div className="flex flex-wrap gap-1 mt-1">
                            <span className="bg-natural-olive/10 text-natural-olive text-[9px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wide">
                              {site.kategorie_attraktion}
                            </span>
                            <span className="bg-gray-100 text-gray-600 text-[9px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wide border border-gray-200">
                              {site.kategorie_befund}
                            </span>
                            {site.barrierefreiheit && (
                              <span className="bg-emerald-50 text-emerald-700 text-[9px] font-semibold px-1.5 py-0.5 rounded-md uppercase tracking-wide border border-emerald-100 flex items-center gap-0.5">
                                <Accessibility className="w-2.5 h-2.5" />
                                BF
                              </span>
                            )}
                            {isStopInRoute && (
                              <span className="bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide flex items-center gap-0.5">
                                <Check className="w-2.5 h-2.5" />
                                Route
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Panel: Selected site details */}
              <div className={`flex-1 h-full overflow-y-auto bg-[#F9FAF6] p-4 md:p-6 flex flex-col justify-start ${
                !selectedListSiteId ? 'hidden md:flex items-center justify-center' : 'flex'
              }`}>
                {selectedListSiteId ? (
                  (() => {
                    const site = sites.find(s => s.id === selectedListSiteId);
                    if (!site) return null;
                    const isStopInRoute = routeStops.some(stop => stop.id === site.id);
                    const stopIndex = routeStops.findIndex(stop => stop.id === site.id);

                    return (
                      <div className="max-w-2xl w-full mx-auto bg-white rounded-2xl shadow-sm border border-natural-border overflow-hidden flex flex-col">
                        {/* Mobile back button */}
                        <div className="md:hidden px-4 py-3 border-b border-natural-border bg-white flex items-center">
                          <button
                            onClick={() => setSelectedListSiteId(null)}
                            className="text-xs font-bold text-natural-olive flex items-center gap-1 cursor-pointer"
                          >
                            ← Zurück zur Liste
                          </button>
                        </div>

                        <div className="p-2">
                          <SitePopup
                            site={site}
                            isStopInRoute={isStopInRoute}
                            routeIndex={stopIndex !== -1 ? stopIndex + 1 : undefined}
                            onAddToRoute={handleAddSiteToRoute}
                            onRemoveFromRoute={handleRemoveStop}
                          />
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="text-center p-8 max-w-sm flex flex-col items-center justify-center my-auto">
                    <div className="w-16 h-16 bg-natural-olive/10 rounded-full flex items-center justify-center mb-4 text-natural-olive">
                      <Compass className="w-8 h-8 animate-spin-slow" />
                    </div>
                    <h3 className="text-lg font-serif font-black text-natural-olive mb-2">Details zur Fundstelle</h3>
                    <p className="text-xs text-gray-500 leading-relaxed font-sans">
                      Wählen Sie einen Fundort aus der linken Liste aus, um detaillierte Informationen, Bilder, wissenschaftliche Literatur und Anreisemöglichkeiten zu sehen.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      ) : (
        <Impressum />
      )}
    </div>
  );
}

const SitePopup = ({ 
  site, 
  isStopInRoute = false, 
  routeIndex, 
  onAddToRoute, 
  onRemoveFromRoute 
}: { 
  site: Site;
  isStopInRoute?: boolean;
  routeIndex?: number;
  onAddToRoute: (site: Site) => void;
  onRemoveFromRoute: (siteId: string) => void;
}) => {
  const isAccessible = site.barrierefreiheit;

  // Bestimme den Maps Link
  const targetMapsUrl = site.maps_link || `https://maps.google.com/?q=${site.lat},${site.lng}`;

  return (
    <div className="bg-white rounded-xl overflow-hidden font-sans">
      {/* Visual Header */}
      {site.thumbnail ? (
        <div className="h-48 bg-natural-bg relative overflow-hidden border-b border-natural-border">
          <img src={site.thumbnail} alt={site.name} className="w-full h-full object-cover" loading="lazy" />
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-1.5 flex items-center justify-between">
            <span className="text-white text-[10px] font-medium">Bild: {getImageCreditName(site.id)}</span>
            <span className="text-white/80 text-[10px]">{getImageLicense(site.id)}</span>
          </div>
          <div className="absolute top-2 left-2">
            {isStopInRoute && (
              <span className="bg-[#1b2a1a] text-white text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wide shadow-xs flex items-center gap-1">
                <Check className="w-3 h-3 text-green-400" />
                Stopp {routeIndex}
              </span>
            )}
          </div>
          <div className="absolute top-2 right-2 flex flex-wrap gap-1 justify-end">
            <span className="bg-natural-olive text-white text-[9px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wide shadow-xs">
              {site.kategorie_attraktion}
            </span>
            <span className="bg-[#DFE1D2] text-[#333324] text-[9px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wide border border-natural-border">
              {site.kategorie_befund}
            </span>
          </div>
        </div>
      ) : (
        <div className="h-24 bg-natural-bg relative overflow-hidden flex items-center justify-center p-4 border-b border-natural-border">
          <div className="absolute inset-0 bg-[#5A5A40]/5 flex items-center justify-center text-natural-olive/20 font-serif text-sm select-none italic tracking-wider">
            Saar-Archäologieschatz
          </div>
          <div className="absolute top-2 left-2">
            {isStopInRoute && (
              <span className="bg-[#1b2a1a] text-white text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wide shadow-xs flex items-center gap-1">
                <Check className="w-3 h-3 text-green-400" />
                Stopp {routeIndex}
              </span>
            )}
          </div>
          <div className="absolute top-2 right-2 flex flex-wrap gap-1 justify-end">
            <span className="bg-natural-olive text-white text-[9px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wide shadow-xs">
              {site.kategorie_attraktion}
            </span>
            <span className="bg-[#DFE1D2] text-[#333324] text-[9px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wide border border-natural-border">
              {site.kategorie_befund}
            </span>
          </div>
        </div>
      )}
      
      {/* Details Area */}
      <div className="p-4 space-y-4">
        <div>
          <h2 className="text-lg font-serif font-black text-natural-olive leading-tight mb-1">
            {site.name}
          </h2>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium font-sans">
            <MapPin className="w-3.5 h-3.5 text-natural-olive shrink-0" />
            <span>{site.gemeinde}</span>
            <span className="text-gray-300">•</span>
            <span className="italic block capitalize">
              {Array.isArray(site.zeitstellung) ? site.zeitstellung.join(', ') : site.zeitstellung}
            </span>
          </div>
        </div>

        <p className="text-xs text-gray-600 leading-relaxed font-sans border-l-2 border-natural-border pl-2.5">
          {site.beschreibung}
        </p>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-3 p-2.5 bg-natural-bg/30 rounded-xl border border-natural-border/60 text-[11px]">
          <div>
            <span className="text-[9px] uppercase font-bold text-gray-400 block tracking-tight">Barrierefreiheit</span>
            <div className="flex items-center gap-1 font-semibold text-gray-700 mt-0.5 font-sans">
              <Accessibility className="w-3.5 h-3.5 text-natural-olive shrink-0" />
              <span>{isAccessible ? 'Barrierefrei' : 'Eingeschränkt'}</span>
            </div>
          </div>
          <div>
            <span className="text-[9px] uppercase font-bold text-gray-400 block tracking-tight">Eintrittspreis</span>
            <div className="flex items-center gap-1 font-semibold text-gray-700 mt-0.5 truncate font-sans" title={site.eintrittspreis}>
              <Clock className="w-3.5 h-3.5 text-natural-olive shrink-0" />
              <span>{site.eintrittspreis}</span>
            </div>
          </div>
          <div>
            <span className="text-[9px] uppercase font-bold text-gray-400 block tracking-tight">Öffnungszeiten</span>
            <div className="text-gray-600 font-medium mt-0.5 max-h-12 overflow-y-auto font-sans" title={site.oeffnungszeiten || ''}>
              {site.oeffnungszeiten || 'Frei zugänglich'}
            </div>
          </div>
          <div>
            <span className="text-[9px] uppercase font-bold text-gray-400 block tracking-tight">Sichtbarkeit</span>
            <div className="flex items-center gap-1 font-semibold text-gray-700 mt-0.5 font-sans">
              <Info className="w-3.5 h-3.5 text-natural-olive shrink-0" />
              <span className="capitalize">{site.sichtbarkeit}</span>
            </div>
          </div>
        </div>

        {/* Denkmalschutz (Optional) */}
        {site.denkmalschutzstatus && (
          <div className="flex items-start gap-1.5 text-[10px] bg-amber-50 rounded-lg p-2 border border-amber-200/50 text-amber-900 leading-tight">
            <Shield className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold font-sans">Denkmalschutz:</span> {site.denkmalschutzstatus}
            </div>
          </div>
        )}

        {/* Literature sources (For students/profs) */}
        {site.literatur && site.literatur.length > 0 && (
          <div className="text-[10px] space-y-1">
            <span className="font-bold text-natural-olive uppercase tracking-wider block text-[9px] flex items-center gap-1">
              <BookOpen className="w-3 h-3 text-natural-olive" />
              Wissenschaftliche Literatur:
            </span>
            <ul className="list-disc list-inside space-y-0.5 text-gray-500 text-[10px] pl-1 max-h-16 overflow-y-auto">
              {site.literatur.map((lit, i) => (
                <li key={i} className="truncate" title={lit}>
                  {lit}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Buttons Trigger Grid */}
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-natural-bg">
          <button 
            onClick={() => window.open(targetMapsUrl, '_blank')}
            className="w-full bg-white text-natural-olive border border-natural-border py-2 rounded-lg font-bold text-xs hover:bg-natural-bg transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Route className="w-3.5 h-3.5 text-natural-olive" />
            Navigieren
          </button>

          {isStopInRoute ? (
            <button 
              onClick={() => onRemoveFromRoute(site.id)}
              className="w-full bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 py-2 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-700" />
              Herausnehmen
            </button>
          ) : (
            <button 
              onClick={() => onAddToRoute(site)}
              className="w-full bg-natural-olive text-white py-2 rounded-lg font-bold text-xs hover:bg-natural-olive-dark transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-white" />
              Route hinzufügen
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const CustomMetricScaleControl = () => {
  const map = useMap();
  const [scale, setScale] = useState<{ width: number; label: string; midLabel: string } | null>(null);

  useEffect(() => {
    const updateScale = () => {
      const mapSize = map.getSize();
      if (mapSize.x === 0 || mapSize.y === 0) return;

      const isMobile = window.innerWidth < 768;
      const targetWidth = isMobile ? 80 : 160;
      
      const center = map.getCenter();
      const pt1 = map.containerPointToLatLng([0, mapSize.y / 2]);
      const pt2 = map.containerPointToLatLng([1, mapSize.y / 2]);
      const metersPerPixel = map.distance(pt1, pt2);
      
      if (!metersPerPixel || isNaN(metersPerPixel)) return;

      const groundDistance = targetWidth * metersPerPixel;
      
      const niceDistances = [
        1, 2, 5, 10, 20, 50, 100, 200, 500, 
        1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000
      ];
      
      let selectedDistance = niceDistances[0];
      for (const dist of niceDistances) {
        if (dist <= groundDistance) {
          selectedDistance = dist;
        } else {
          break;
        }
      }
      
      const widthInPx = selectedDistance / metersPerPixel;
      
      const formatDistance = (m: number): string => {
        if (m >= 1000) {
          const kms = m / 1000;
          return `${kms % 1 === 0 ? kms : kms.toFixed(1)} km`;
        }
        return `${m} m`;
      };
      
      setScale({
        width: widthInPx,
        midLabel: formatDistance(selectedDistance / 2),
        label: formatDistance(selectedDistance)
      });
    };

    map.on('zoomend moveend resize load', updateScale);
    updateScale();
    
    const timer = setTimeout(updateScale, 100);

    return () => {
      map.off('zoomend moveend resize load', updateScale);
      clearTimeout(timer);
    };
  }, [map]);

  if (!scale || scale.width <= 0) return null;

  return (
    <div className="absolute bottom-3 right-3 md:bottom-6 md:right-6 z-[1000] pointer-events-none select-none">
      <div className="bg-white/95 backdrop-blur-xs p-2 md:p-3 rounded-xl border border-natural-border flex flex-col items-center justify-center shadow-md min-w-[70px] md:min-w-[120px]">
        <span className="text-[7.5px] md:text-[9px] uppercase font-bold text-natural-olive tracking-wider mb-1 md:mb-2">
          Maßstab (Metrisch)
        </span>
        
        <div className="flex flex-col items-center" style={{ width: `${scale.width}px` }}>
          <div className="flex justify-between w-full text-[8px] md:text-[10px] font-mono font-bold text-[#2d2d2d] mb-0.5 md:mb-1">
            <span className="w-4 md:w-8 text-left">0</span>
            <span className="text-center flex-1">{scale.midLabel}</span>
            <span className="w-4 md:w-8 text-right">{scale.label}</span>
          </div>
          
          <div className="relative h-1.5 md:h-2.5 border border-gray-700 w-full flex overflow-hidden rounded-xs bg-gray-100 shadow-inner">
            <div className="w-1/2 h-full bg-natural-olive border-r border-[#3e3e2c]"></div>
            <div className="w-1/2 h-full bg-amber-600/10"></div>
          </div>
          
          <div className="flex justify-between w-full h-0.5 md:h-1 text-gray-500 relative">
            <div className="absolute left-0 top-0 w-[1px] h-0.5 md:h-1 bg-gray-600"></div>
            <div className="absolute left-1/2 top-0 w-[1px] h-0.5 md:h-1 bg-gray-600 -translate-x-1/2"></div>
            <div className="absolute right-0 top-0 w-[1px] h-0.5 md:h-1 bg-gray-600"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Custom User Location Icon (Pulsing blue light)
const getUserLocationIcon = () => {
  return L.divIcon({
    className: 'custom-user-marker',
    html: `
      <div class="relative w-6 h-6 flex items-center justify-center">
        <div class="absolute inset-0 bg-blue-500/30 rounded-full animate-ping"></div>
        <div class="relative w-3.5 h-3.5 bg-blue-600 rounded-full border-2 border-white shadow-md"></div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -10]
  });
};

// MapActions to perform imperatively focused updates inside Leaflet
interface MapActionsProps {
  points: [number, number][];
  focusTrigger: number;
  userLoc: [number, number] | null;
  centerTrigger: number;
}

const MapActions = ({ points, focusTrigger, userLoc, centerTrigger }: MapActionsProps) => {
  const map = useMap();
  
  useEffect(() => {
    if (focusTrigger > 0 && points.length > 0) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [60, 60] });
    }
  }, [focusTrigger, points, map]);

  useEffect(() => {
    if (centerTrigger > 0 && userLoc) {
      map.setView(userLoc, 13);
    }
  }, [centerTrigger, userLoc, map]);

  return null;
};

