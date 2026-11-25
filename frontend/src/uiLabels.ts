import type { UiText } from "./uiLocale";

const publicSections: Record<string, string> = {
  explore: "Entdecken", "pod-explorer": "POD erkunden", organs: "Orgeln", events: "Ereignisse",
  persons: "Personen", map: "Karte", literature: "Literatur", scores: "Notenausgaben",
  iconography: "Ikonografie", temperaments: "Stimmungssysteme", vmi: "Virtuelle Instrumente",
  "use-cases": "Datenberichte", docs: "Dokumentation", "release-guide": "Über die Daten", "api-guide": "API-Leitfaden",
};

export function publicSectionLabel(t: UiText, id: string, label: string) {
  return publicSections[id] ? t("shell.section." + id, label, publicSections[id]) : label;
}

const pageLabels: Record<string, string> = {
  "/use-cases/research-workbench": "Recherchewerkzeuge",
  "/applications": "Verwandte Anwendungen",
  "/use-cases/regional-organ-stop-names": "Registerbezeichnungen nach Region und Tradition",
  "/use-cases/organ-corpus-coverage": "Abdeckung und Dokumentationslücken im Orgelkorpus",
  "/use-cases/documented-organ-lifecycles": "Dokumentierte Orgelgeschichten",
  "/use-cases/builder-workshop-networks": "Netzwerke von Orgelbauern und Werkstätten",
};

export function publicPageLabel(t: UiText, path: string, section: string, label: string) {
  const key = path.replace(/\/$/, "") || "/";
  if (key === "/vocab" || key.startsWith("/vocab/")) return t("shell.vocabularies", label, "Vokabulare");
  if (pageLabels[key]) return t("shell.page." + key, label, pageLabels[key]);
  return publicSectionLabel(t, section, label);
}

const organTabs: Record<string, string> = {
  overview: "Übersicht", specification: "Disposition", history: "Geschichte", activities: "Aktivitäten",
  media: "Medien", identifiers: "Kennungen", export: "Export", related: "Verknüpfungen", research: "Forschung", contributions: "Beiträge",
};

export function publicOrganTabLabel(t: UiText, id: string, label: string) {
  return organTabs[id] ? t("organ.tab." + id, label, organTabs[id]) : label;
}
