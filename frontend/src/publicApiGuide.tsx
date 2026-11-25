import { lazy, Suspense, useEffect } from "react";
import { useUiLocale } from "./uiLocale";
import { LoadingContent } from "./LoadingContent";
import "./publicApiGuide.css";

const PUBLIC_ORIGIN = "https://navigator.modavis.org";
const SEARCH = "/api/entities/search?q=Leipzig&limit=5";
const CONTEXT = "/api/workbench/context";
const DATA_ACCESS = "/pod-explorer?collection=data-access";
const ORGAN = "7PDZ-MDM0-0";
const ApiReference = lazy(() => import("./publicApiReference").then(module => ({ default: module.PublicApiReference })));

const REST_EXAMPLES = [
  { id: "search", label: ["Search for Leipzig", "Nach Leipzig suchen"], path: SEARCH, description: ["Up to five ranked matches across public organs, actors, places and documented events.", "Bis zu fünf nach Relevanz geordnete Treffer aus öffentlichen Datensätzen zu Orgeln, Akteuren, Orten und dokumentierten Ereignissen."] },
  { id: "specification", label: ["Read the Nikolaikirche specification", "Disposition der Nikolaikirche abrufen"], path: `/api/organs/${ORGAN}/specification`, description: ["Specification, component hierarchy and source-specific records where available.", "Disposition, Gliederung der Bauteile und quellenspezifische Datensätze, soweit erfasst."] },
  { id: "formats", label: ["Find formats for this organ", "Exportformate für diese Orgel anzeigen"], path: `/api/exports/organ/${ORGAN}`, description: ["Links to native data and the semantic export profiles available for this record.", "Links zu Daten im MODAVIS-Format und zu den für diesen Datensatz verfügbaren semantischen Exportprofilen."] },
  { id: "evidence", label: ["Inspect evidence coverage", "Beleglage prüfen"], path: `/api/exports/organ/${ORGAN}/evidence`, description: ["Field-level evidence context, release version and record checksum.", "Belegkontext je Datenfeld, Datensatzversion und Prüfsumme des Datensatzes."] },
  { id: "vocabularies", label: ["List vocabularies", "Vokabulare auflisten"], path: "/api/vocab/catalogue", description: ["Available vocabulary collections, counts and coverage information.", "Verfügbare Vokabularsammlungen mit Angaben zu Umfang und Abdeckung."] },
] as const;

const GRAPHQL_EXAMPLE = `python3 - <<'PY'
import json
from urllib.request import Request, urlopen

origin = "${PUBLIC_ORIGIN}"
with urlopen(origin + "${CONTEXT}", timeout=15) as response:
    snapshot = json.load(response)["publicCoreSha256"]

payload = {
    "snapshot": snapshot,
    "query": """
        query Organ($id: ID!) {
            entity(kind: organ, id: $id) {
                id
                title
                canonicalUri
            }
        }
    """,
    "variables": {"id": "${ORGAN}"},
}
request = Request(
    origin + "/api/graphql",
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urlopen(request, timeout=15) as response:
    print(json.dumps(json.load(response), indent=2))
PY`;

export function PublicApiGuide() {
  const { t } = useUiLocale();
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id === "api-rest" || id === "api-graphql" || id === "api-reuse") {
      document.getElementById(id)?.scrollIntoView({ block: "start" });
    }
  }, []);

  if (new URLSearchParams(window.location.search).get("reference") === "1") {
    return <Suspense fallback={<LoadingContent kind="article" label={t("guide.api.reference.loading", "Loading the API reference…", "API-Referenz wird geladen …")} />}><ApiReference /></Suspense>;
  }

  return (
    <article className="entity-section release-guide api-guide" id="api-guide">
      <header className="release-guide-hero public-data-guide-hero">
        <div>
          <p className="eyebrow">{t("guide.api.eyebrow", "About and guidance", "Information und Hilfe")}</p>
          <h1>{t("guide.api.title", "Navigator API guide", "Leitfaden zur Navigator-API")}</h1>
          <p>{t("guide.api.intro", "Read public MODAVIS records from a script, retrieve specifications and evidence, or query a specific dataset snapshot. These read-only requests work without an account.", "Rufen Sie öffentliche MODAVIS-Datensätze, Dispositionen und Belegdaten per Skript ab oder fragen Sie einen bestimmten Datenstand ab. Für diese Lesezugriffe ist kein Benutzerkonto erforderlich.")}</p>
        </div>
        <nav aria-label={t("guide.api.sections", "On this page", "Auf dieser Seite")}>
          <a href="#api-rest">{t("guide.api.rest.nav", "REST examples", "REST-Beispiele")}</a>
          <a href="#api-graphql">{t("guide.api.graphql.nav", "GraphQL example", "GraphQL-Beispiel")}</a>
          <a href="#api-reuse">{t("guide.api.reuse.nav", "Release and bulk data", "Datensatzversion und Gesamtpakete")}</a>
        </nav>
      </header>

      <section className="release-guide-section" id="api-rest" aria-labelledby="api-rest-heading">
        <h2 id="api-rest-heading">{t("guide.api.rest.title", "Read JSON with REST", "JSON-Daten über REST abrufen")}</h2>
        <p>{t("guide.api.rest.intro", "Open any example to see the JSON response. The command uses the public Navigator. For another installation, change the origin to its address.", "Öffnen Sie ein Beispiel, um die JSON-Antwort zu sehen. Der Befehl greift auf den öffentlichen Navigator zu. Für eine andere Installation verwenden Sie deren Basisadresse.")}</p>
        <p><a href="/about/api?reference=1">{t("guide.api.reference.open", "Read the full API reference", "Vollständige API-Referenz lesen")} <span lang="en">(English)</span></a> · <a href="/navigator-api.md" download>{t("guide.api.reference.download", "Download Markdown", "Markdown herunterladen")}</a></p>
        <pre role="region" tabIndex={0} aria-label={t("guide.api.rest.command", "Command to search public records", "Befehl zur Suche in öffentlichen Datensätzen")}><code>{`curl -fsS "${PUBLIC_ORIGIN}${SEARCH}"`}</code></pre>
        <dl className="api-guide-endpoints">
          {REST_EXAMPLES.map(({id, label, path, description}) => (
            <div key={path}>
              <dt><a href={path}>{t(`guide.api.rest.example.${id}.label`, label[0], label[1])}</a></dt>
              <dd>{t(`guide.api.rest.example.${id}.description`, description[0], description[1])}<code>GET {path}</code></dd>
            </div>
          ))}
        </dl>
        <p>{t("guide.api.rest.response", "Search accepts a limit from 1 to 50. The response lists the returned items, counts by entity kind and a hasMore flag separately. Evidence coverage distinguishes attached evidence receipts, source identifiers and fields without evidence mapping.", "Der Suchparameter limit akzeptiert Werte von 1 bis 50. Die Antwort enthält getrennt die ausgegebenen Treffer unter items, die Trefferzahlen je Entitätstyp und das Kennzeichen hasMore. Die Belegübersicht unterscheidet zwischen hinterlegten Belegen, Quellenkennungen und Feldern ohne Belegzuordnung.")}</p>
        <details>
          <summary>{t("guide.api.tuning.title", "Query temperament occurrences", "Quellenangaben zu Stimmungssystemen abfragen")}</summary>
          <p>{t("guide.api.tuning.scope", "The occurrence_scope parameter accepts all, exact or family. The selected count determines the sort order and the inclusive min_occurrences and max_occurrences bounds.", "Der Parameter occurrence_scope akzeptiert all, exact oder family. Die gewählte Zählweise bestimmt die Sortierung und die Filtergrenzen min_occurrences und max_occurrences. Beide Grenzwerte sind eingeschlossen.")} <a href="/api/temperaments?sort=occurrences_desc&occurrence_scope=exact&min_occurrences=1&limit=10">{t("guide.api.tuning.list", "List tuning systems by exact organ count", "Stimmungssysteme nach der Zahl exakt zugeordneter Orgeldatensätze sortieren")}</a></p>
          <p>{t("guide.api.tuning.organScope", "The linked-organ endpoint accepts the same categories via scope and returns both evidence counts alongside the filtered page.", "Der Endpunkt für verknüpfte Orgeldatensätze akzeptiert dieselben Kategorien über den Parameter scope. Er gibt beide Trefferzahlen zusammen mit der gefilterten Ergebnisseite zurück.")} <a href="/api/temperaments/2hKi2/organs?scope=family&limit=10">{t("guide.api.tuning.related", "Read related source wording for Kirnberger II", "Verwandten Quellenwortlaut zu Kirnberger II abrufen")}</a></p>
        </details>
        <details>
          <summary>{t("guide.api.dispositions.title", "Find captured stop combinations", "Kombinationen erfasster Register suchen")}</summary>
          <p>{t("guide.api.dispositions.parameters", "Send a snapshot, a scope of account or division, and two to four stop criteria as name and optional pitch separated by a vertical bar.", "Geben Sie einen festen Datenstand, den Suchbereich account oder division und zwei bis vier Registerkriterien an. Trennen Sie die Bezeichnung und die optionale Fußtonlage mit einem senkrechten Strich.")}</p>
          <code>GET /api/workbench/dispositions?snapshot=…&amp;scope=account&amp;stop=Vox%20Humana%7C8&amp;stop=Quintadena%7C16</code>
          <p>{t("guide.api.dispositions.export", "Use the export endpoint with the same filters for the complete bounded JSON selection and source account revisions.", "Der Exportendpunkt liefert mit denselben Filtern die vollständige Auswahl innerhalb der geltenden Grenzen als JSON, einschließlich der Revisionen der Quellenbeschreibungen.")} <code>/api/workbench/dispositions/export</code></p>
          <p><a href="/use-cases/research-workbench?view=dispositions">{t("guide.api.dispositions.open", "Open the disposition finder", "Dispositionssuche öffnen")}</a></p>
        </details>
      </section>

      <section className="release-guide-section" id="api-graphql" aria-labelledby="api-graphql-heading">
        <h2 id="api-graphql-heading">{t("guide.api.graphql.title", "Query a pinned snapshot with GraphQL", "Einen festen Datenstand mit GraphQL abfragen")}</h2>
        <p>{t("guide.api.graphql.request", "Send POST /api/graphql with a JSON body containing snapshot, query and any variables. The example reads publicCoreSha256 and returns the Nikolaikirche identifier, title and canonical URI.", "Senden Sie eine POST-Anfrage an /api/graphql mit snapshot, query und gegebenenfalls variables im JSON-Anfragekörper. Das Beispiel liest publicCoreSha256 und gibt Kennung, Titel und kanonische URI der Nikolaikirche zurück.")} <a href={CONTEXT}>{t("guide.api.graphql.context", "Open the workbench context", "Kontext der Recherchewerkzeuge öffnen")}</a></p>
        <pre role="region" tabIndex={0} aria-label={t("guide.api.graphql.python", "Python example for a snapshot-pinned GraphQL query", "Python-Beispiel für eine GraphQL-Abfrage mit festem Datenstand")}><code>{GRAPHQL_EXAMPLE}</code></pre>
        <p><a href={`${DATA_ACCESS}#pod-graphql`}>{t("guide.api.graphql.try", "Try GraphQL in the POD Explorer", "GraphQL im POD-Explorer ausprobieren")}</a></p>
        <details>
          <summary>{t("guide.api.graphql.limits", "Supported queries and limits", "Unterstützte Abfragen und Grenzwerte")}</summary>
          <p>{t("guide.api.graphql.fields", "The supported root fields are snapshot, entity and organs. A request can contain one query with up to four root fields. The organ list accepts up to 50 rows per page and an offset of up to 10,000. GraphQL shares the standard ten-second public read budget. Responses are limited to 2 MiB.", "Die Abfragefelder auf oberster Ebene sind snapshot, entity und organs. Eine Anfrage kann eine Abfrage mit bis zu vier Feldern auf dieser Ebene enthalten. Die Orgelliste erlaubt bis zu 50 Zeilen pro Seite und einen Versatz von bis zu 10.000 Zeilen. Für öffentliche GraphQL-Abfragen gilt wie für andere öffentliche Lesezugriffe die reguläre Zeitgrenze von zehn Sekunden. Antworten dürfen höchstens 2 MiB groß sein.")}</p>
          <p>{t("guide.api.graphql.errors", "GraphQL requires a verified workbench snapshot. HTTP 409 indicates a snapshot mismatch or change, and 503 can indicate that a pinned snapshot is unavailable. Check the current context before retrying. To reproduce a query, retain the query, variables and snapshot identifier alongside the result.", "GraphQL setzt einen geprüften Datenstand der Recherchewerkzeuge voraus. HTTP 409 zeigt einen abweichenden oder geänderten Datenstand an. HTTP 503 kann bedeuten, dass der festgelegte Datenstand nicht verfügbar ist. Prüfen Sie vor einem erneuten Versuch den aktuellen Kontext. Bewahren Sie für die Reproduzierbarkeit Abfrage, Variablen und Kennung des Datenstands zusammen mit dem Ergebnis auf.")}</p>
        </details>
      </section>

      <section className="release-guide-section" id="api-reuse" aria-labelledby="api-reuse-heading">
        <h2 id="api-reuse-heading">{t("guide.api.reuse.title", "Identify and reuse the release", "Datensatzversion ermitteln und Daten weiterverwenden")}</h2>
        <ul>
          <li>{t("guide.api.reuse.capabilitiesDescription", "Find available data-access features, formats and the versioned distribution manifest.", "Hier finden Sie die verfügbaren Zugriffsmöglichkeiten, Formate und das versionsgebundene Verzeichnis der Downloadpakete.")} <a href="/api/pod/capabilities">{t("guide.api.reuse.capabilities", "POD capabilities", "POD-Funktionsübersicht")}</a></li>
          <li>{t("guide.api.reuse.statusDescription", "Check which features are currently serving requests.", "Prüfen Sie, welche Funktionen derzeit Anfragen beantworten.")} <a href="/api/health/capabilities">{t("guide.api.reuse.status", "Capability status", "Funktionsstatus")}</a></li>
          <li>{t("guide.api.reuse.contextDescription", "Check the dataset version, public scope and documentation policy.", "Hier finden Sie die Datensatzversion, den öffentlich zugänglichen Umfang und Hinweise zur Dokumentation.")} <a href="/api/release-context">{t("guide.api.reuse.context", "Release context", "Angaben zur Datensatzversion")}</a></li>
          <li>{t("guide.api.reuse.downloadDescription", "Get release files or bounded exports with supporting metadata.", "Laden Sie die Dateien zur Datensatzversion oder abgegrenzte Exporte samt Metadaten herunter.")} <a href={`${DATA_ACCESS}#pod-dataset-downloads`}>{t("guide.api.reuse.download", "Dataset downloads and research selections", "Datensatz-Downloads und Rechercheauswahlen")}</a></li>
        </ul>
      </section>
    </article>
  );
}
