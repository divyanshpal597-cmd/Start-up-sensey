import { useEffect, useRef } from "react";
import L from "leaflet";

export default function PlacesMap({
  center,
  places,
  radiusKm,
  highlightId,
  height = 360,
}: {
  center: { lat: number; lng: number };
  places: any[];
  radiusKm?: number;
  highlightId?: string | null;
  height?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { scrollWheelZoom: false }).setView([center.lat, center.lng], 11);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    L.circleMarker([center.lat, center.lng], { radius: 9, color: "#fff", weight: 3, fillColor: "#0f172a", fillOpacity: 1 })
      .bindTooltip("Your business location", { direction: "top" })
      .addTo(g);
    if (radiusKm) {
      L.circle([center.lat, center.lng], { radius: radiusKm * 1000, color: "#6366f1", weight: 1, fillOpacity: 0.03, dashArray: "4 4" }).addTo(g);
    }
    const pts: L.LatLngExpression[] = [[center.lat, center.lng]];
    places.forEach((p, i) => {
      const hl = p.id === highlightId;
      L.circleMarker([p.lat, p.lng], {
        radius: hl ? 10 : 7,
        color: "#fff",
        weight: 2,
        fillColor: hl ? "#f59e0b" : p.source === "Google Places" ? "#10b981" : "#6366f1",
        fillOpacity: 0.95,
      })
        .bindTooltip(`${i + 1}. ${p.name} · ${p.distanceKm} km`, { direction: "top" })
        .addTo(g);
      pts.push([p.lat, p.lng]);
    });
    if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 14 });
    else m.setView([center.lat, center.lng], 11);
  }, [center.lat, center.lng, places, radiusKm, highlightId]);

  return <div ref={el} style={{ height }} className="w-full overflow-hidden rounded-2xl ring-1 ring-slate-200" />;
}
