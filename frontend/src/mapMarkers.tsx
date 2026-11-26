import { RefObject, useEffect, useState } from "react";
import { useUiLocale } from "./uiLocale";
import "./mapRegions.css";

export const mapBridgeChannel = "navigator:map-regions";

export function installMapBridge(frame: HTMLIFrameElement | null, regionOverlay = true) {
  const doc = frame?.contentDocument;
  if (!doc || doc.location.pathname === "/map-viewer.html") return;
  const script = doc.createElement("script");
  script.type = "module";
  script.src = regionOverlay ? "/geolibre-region-bridge.mjs?v=2" : "/geolibre-region-bridge.mjs?v=2&areas=0";
  doc.head.append(script);
  return () => script.remove();
}

interface Marker {
  siteCount: number;
  organCount: number | null;
  aggregate: boolean;
  approximate?: boolean;
  title?: string;
}

export function MapMarkerInspector({ frameRef, regionOverlay = true }: {
  frameRef: RefObject<HTMLIFrameElement | null>;
  regionOverlay?: boolean;
}) {
  const { t, formatNumber } = useUiLocale();
  const [available, setAvailable] = useState(false);
  const [inspection, setInspection] = useState<{ marker: Marker; pinned: boolean }>();
  const send = (event: string, fields?: object) => frameRef.current?.contentWindow?.postMessage(
    { type: mapBridgeChannel, event, ...fields },
    window.location.origin,
  );

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.contentWindow
        || event.data?.type !== mapBridgeChannel) return;
      const message = event.data;
      if (message.event === "markers-available") {
        setAvailable(message.available === true);
      } else if (message.event === "marker") {
        const marker = message.marker;
        if (!marker || !Number.isSafeInteger(marker.siteCount) || marker.siteCount < 1
          || (marker.organCount !== null && (!Number.isSafeInteger(marker.organCount) || marker.organCount < 0))) {
          setInspection(undefined);
        } else {
          setInspection({ marker, pinned: message.pinned === true });
        }
      }
    };
    window.addEventListener("message", receive);
    const remove = regionOverlay ? undefined : installMapBridge(frame, false);
    return () => {
      window.removeEventListener("message", receive);
      remove?.();
    };
  }, [frameRef, regionOverlay]);

  if (!available && !inspection) return null;
  const marker = inspection?.marker;
  const pinned = Boolean(inspection?.pinned);
  const title = marker?.approximate && !marker.aggregate
    ? t("map.marker.approximate", "Approximate locality", "Ungefähre Ortsangabe")
    : marker?.title;
  const sites = marker && (marker.siteCount === 1
    ? t("map.marker.oneSite", "1 mapped site", "1 kartierter Standort")
    : t("map.marker.sites", "{count} mapped sites", "{count} kartierte Standorte", { count: formatNumber(marker.siteCount) }));
  const organs = marker && marker.organCount !== null && (marker.aggregate
    ? marker.organCount === 1
      ? t("map.marker.oneOccurrence", "1 mapped organ occurrence", "1 kartierter Orgelnachweis")
      : t("map.marker.occurrences", "{count} mapped organ occurrences", "{count} kartierte Orgelnachweise", { count: formatNumber(marker.organCount) })
    : marker.organCount === 1
      ? t("map.marker.oneOrgan", "1 organ record", "1 Orgeldatensatz")
      : t("map.marker.organs", "{count} organ records", "{count} Orgeldatensätze", { count: formatNumber(marker.organCount) }));

  return <div className="map-marker-inspection" onKeyDown={(event) => {
    if (event.key === "Escape" && pinned) {
      event.stopPropagation();
      send("marker-clear");
      event.currentTarget.querySelector("button")?.focus();
    }
  }}>
    <button type="button" className="map-marker-step" onClick={() => send("marker-step", { direction: 1 })}>
      {pinned
        ? t("map.marker.next", "Next marker", "Nächster Marker")
        : t("map.marker.inspect", "Inspect markers", "Marker erkunden")}
    </button>
    {pinned && <button type="button" className="map-marker-step"
      aria-label={t("map.marker.previous", "Previous marker", "Vorheriger Marker")}
      onClick={() => send("marker-step", { direction: -1 })}>‹</button>}
    {marker && <span className={"map-marker-readout " + (pinned ? "is-pinned" : "is-preview")} aria-live={pinned ? "polite" : "off"}>
      {title && <strong>{title}</strong>}
      <span>{sites}</span>
      {organs && <span>{organs}</span>}
    </span>}
    {pinned && marker && <>
      <button type="button" className="map-marker-step" onClick={() => send("marker-open")}>
        {marker.aggregate
          ? t("map.marker.zoom", "Zoom to group", "Gruppe vergrößern")
          : t("map.marker.open", "Show site records", "Standortdatensätze anzeigen")}
      </button>
      <button type="button" className="map-marker-step"
        aria-label={t("map.marker.clear", "Clear marker selection", "Markerauswahl aufheben")}
        onClick={(event) => {
          event.currentTarget.closest(".map-marker-inspection")?.querySelector("button")?.focus();
          send("marker-clear");
        }}>×</button>
    </>}
  </div>;
}
