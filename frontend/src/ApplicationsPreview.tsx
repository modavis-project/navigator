import { ArrowRight } from "lucide-react";
import { useUiLocale } from "./uiLocale";

export function ApplicationsPreview() {
  const { t } = useUiLocale();
  return <section className="explore-applications"><div><p className="eyebrow">{t("applications.preview.eyebrow", "Continue your research", "Recherche fortsetzen")}</p><h2>{t("applications.preview.title", "Record, map and explore", "Aufnehmen, kartieren und erkunden")}</h2><p>{t("applications.preview.summary", "Discover OrgRec, OrgMap, the VAO Standard, vaoXR and the MODAVIS Ontology Network.", "OrgRec, OrgMap, den VAO Standard, vaoXR und das MODAVIS Ontology Network kennenlernen.")}</p></div><a className="public-action-link" href="/applications">{t("applications.preview.link", "Related applications", "Verwandte Anwendungen")} <ArrowRight size={17} /></a></section>;
}
