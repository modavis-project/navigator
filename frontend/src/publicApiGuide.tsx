import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowRight, Code2, Database, GitBranch } from "lucide-react";
import { useUiLocale } from "./uiLocale";
import { LoadingContent } from "./LoadingContent";
import "./publicApiGuide.css";

const SEARCH = "/api/entities/search?q=Leipzig&limit=5";
const CONTEXT = "/api/workbench/context";
const DATA_ACCESS = "/pod-explorer?collection=data-access";
const REFERENCE = "/about/api?reference=1";
const ORGAN = "7PDZ-MDM0-0";
const ApiReference = lazy(() => import("./publicApiReference").then(module => ({ default: module.PublicApiReference })));

const REST_EXAMPLES = [
  { id: "search", label: ["Search for Leipzig", "Nach Leipzig suchen"], path: SEARCH, description: ["See up to five ranked matches across public organs, actors, places and events.", "Ruft bis zu fünf nach Relevanz geordnete Treffer zu Orgeln, Akteuren, Orten und Ereignissen ab."] },
  { id: "specification", label: ["Read a specification", "Eine Disposition abrufen"], path: "/api/organs/" + ORGAN + "/specification", description: ["Read the disposition, component hierarchy and documented source accounts for the organ of Leipzig's Nikolaikirche.", "Ruft die Disposition, die Gliederung der Bauteile und die überlieferten Quellenbeschreibungen zur Orgel der Leipziger Nikolaikirche ab."] },
  { id: "formats", label: ["Find export formats", "Exportformate anzeigen"], path: "/api/exports/organ/" + ORGAN, description: ["Find the formats and export URLs for the Nikolaikirche organ record.", "Zeigt die verfügbaren Formate und Exportadressen für den Orgeldatensatz zur Nikolaikirche an."] },
  { id: "evidence", label: ["Check source evidence", "Quellenbelege prüfen"], path: "/api/exports/organ/" + ORGAN + "/evidence", description: ["See whether individual fields have attached evidence, source identifiers or no evidence mapping. The response also includes the dataset version and record checksum.", "Zeigt je Datenfeld, ob ein Beleg hinterlegt ist, eine Quellenkennung vorliegt oder keine Zuordnung erfasst wurde. Die Antwort enthält auch die Datensatzversion und die Prüfsumme des Orgeldatensatzes."] },
  { id: "vocabularies", label: ["List vocabularies", "Vokabulare auflisten"], path: "/api/vocab/catalogue", description: ["See available vocabulary collections, their sizes and their coverage.", "Listet die verfügbaren Vokabularsammlungen mit Angaben zu Umfang und Abdeckung auf."] },
] as const;

const graphQlExample = (origin: string) => `python3 - <<'PY'
import json
from urllib.request import Request, urlopen

origin = ${JSON.stringify(origin)}
with urlopen(origin + "${CONTEXT}", timeout=15) as response:
    snapshot = json.load(response)["publicCoreSha256"]

payload = {
    "snapshot": snapshot,
    "query": """
        query Organ($id: ID!) {
            entity(kind: organ, id: $id) { id title canonicalUri }
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

function RequestExample({ code, label }: { code: string; label: string }) {
  const { t } = useUiLocale();
  const [copy, setCopy] = useState<"copied" | "unavailable">();
  return <div className="api-command">
    <div className="api-command-bar">
      <span>{label}</span>
      <button className="secondary" type="button" onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopy("copied");
        } catch {
          setCopy("unavailable");
        }
      }}>{t("guide.api.copy", "Copy command", "Befehl kopieren")}</button>
    </div>
    <pre role="region" tabIndex={0} aria-label={label}><code>{code}</code></pre>
    {copy && <p className="api-copy-status" role="status">{copy === "copied"
      ? t("guide.api.copied", "Command copied.", "Befehl kopiert.")
      : t("guide.api.copyUnavailable", "Select the command to copy it.", "Markieren Sie den Befehl, um ihn zu kopieren.")}</p>}
  </div>;
}

function RestQuickstart({ origin }: { origin: string }) {
  const { t } = useUiLocale();
  const [exampleId, setExampleId] = useState<(typeof REST_EXAMPLES)[number]["id"]>("search");
  const example = REST_EXAMPLES.find(entry => entry.id === exampleId) ?? REST_EXAMPLES[0];
  return <section className="release-guide-section" id="api-rest" aria-labelledby="api-rest-heading">
    <h2 id="api-rest-heading">{t("guide.api.rest.title", "Read records with REST", "Datensätze über REST abrufen")}</h2>
    <p>{t("guide.api.rest.intro", "Choose an example and open the JSON response in your browser, or run the command in a terminal.", "Wählen Sie ein Beispiel. Öffnen Sie die JSON-Antwort im Browser oder führen Sie den Befehl im Terminal aus.")}</p>
    <div className="api-rest-example">
      <div className="api-rest-select">
        <label htmlFor="api-rest-example">{t("guide.api.rest.choose", "Example request", "Beispielanfrage")}</label>
        <select id="api-rest-example" value={exampleId} onChange={event => {
          const selected = REST_EXAMPLES.find(entry => entry.id === event.target.value);
          if (selected) setExampleId(selected.id);
        }}>
          {REST_EXAMPLES.map(({ id, label }) => <option key={id} value={id}>{t("guide.api.rest.example." + id + ".label", label[0], label[1])}</option>)}
        </select>
      </div>
      <p>{t("guide.api.rest.example." + example.id + ".description", example.description[0], example.description[1])}</p>
      <RequestExample key={example.id} code={"curl -fsS " + JSON.stringify(origin + example.path)} label={t("guide.api.command.shell", "Terminal command", "Terminalbefehl")} />
      <a className="api-primary-link" href={example.path}>{t("guide.api.rest.openJson", "Open JSON response", "JSON-Antwort öffnen")} <ArrowRight aria-hidden="true" size={16} /></a>
    </div>
    {exampleId === "search" && <dl className="api-response-fields" aria-label={t("guide.api.rest.responseFields", "Search response fields", "Felder der Suchantwort")}>
      <div><dt><code>items</code></dt><dd>{t("guide.api.rest.items", "Returned matches", "Ausgegebene Treffer")}</dd></div>
      <div><dt><code>counts</code></dt><dd>{t("guide.api.rest.counts", "Counts by record type", "Trefferzahl je Datensatztyp")}</dd></div>
      <div><dt><code>hasMore</code></dt><dd>{t("guide.api.rest.hasMore", "Whether further matches exist", "Gibt an, ob es weitere Treffer gibt")}</dd></div>
    </dl>}
    <details>
      <summary>{t("guide.api.tuning.title", "Query documented tuning systems", "Dokumentierte Stimmungssysteme abfragen")}</summary>
      <p>{t("guide.api.tuning.scope", "Choose all, exact or family with the occurrence_scope parameter. The count for that category controls sorting and the inclusive filter bounds min_occurrences and max_occurrences.", "Wählen Sie mit occurrence_scope die Kategorie all, exact oder family. Die Trefferzahl dieser Kategorie bestimmt die Sortierung und die Filtergrenzen min_occurrences und max_occurrences. Beide Grenzwerte zählen mit.")}</p>
      <ul>
        <li><a href="/api/temperaments?sort=occurrences_desc&occurrence_scope=exact&min_occurrences=1&limit=10">{t("guide.api.tuning.list", "List tuning systems by exact organ count", "Stimmungssysteme nach der Zahl exakt zugeordneter Orgeldatensätze sortieren")}</a></li>
        <li><a href="/api/temperaments/2hKi2/organs?scope=family&limit=10">{t("guide.api.tuning.related", "Find organs with related wording for Kirnberger II", "Orgeln mit verwandten Quellenbezeichnungen zu Kirnberger II finden")}</a></li>
      </ul>
    </details>
    <details>
      <summary>{t("guide.api.dispositions.title", "Find documented stop combinations", "Dokumentierte Registerkombinationen suchen")}</summary>
      <p>{t("guide.api.dispositions.parameters", "Supply a snapshot, a scope of account or division, and two to four stop criteria. Enter a stop name and, optionally, a pitch separated by a vertical bar.", "Geben Sie den Datenstand (snapshot), den Suchbereich account oder division und zwei bis vier Registerkriterien an. Ergänzen Sie die Registerbezeichnung bei Bedarf um die Fußtonlage und trennen Sie beide Angaben mit einem senkrechten Strich.")}</p>
      <code>GET /api/workbench/dispositions?snapshot=…&amp;scope=account&amp;stop=Vox%20Humana%7C8&amp;stop=Quintadena%7C16</code>
      <p>{t("guide.api.dispositions.export", "Use the same filters at the export endpoint to download all matches within the permitted limits, with the versions of the source accounts.", "Mit denselben Filtern können Sie über den Exportendpunkt alle Treffer innerhalb der geltenden Grenzen samt Fassungen der Quellenbeschreibungen herunterladen.")} <code>/api/workbench/dispositions/export</code></p>
      <p><a href="/use-cases/research-workbench?view=dispositions">{t("guide.api.dispositions.open", "Open the disposition finder", "Dispositionssuche öffnen")}</a></p>
    </details>
  </section>;
}

export function PublicApiGuide() {
  const { locale, t } = useUiLocale();
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id === "api-rest" || id === "api-graphql" || id === "api-reuse") {
      document.getElementById(id)?.scrollIntoView({ block: "start" });
    }
  }, []);

  if (new URLSearchParams(window.location.search).get("reference") === "1") {
    return <Suspense fallback={<LoadingContent kind="article" label={t("guide.api.reference.loading", "Loading the API reference…", "API-Referenz wird geladen …")} />}><ApiReference /></Suspense>;
  }

  const origin = window.location.origin;
  return (
    <article className="entity-section release-guide api-guide" id="api-guide">
      <header className="api-guide-header">
        <div>
          <h1>{t("guide.api.title", "Navigator API guide", "Leitfaden zur Navigator-API")}</h1>
          <p>{t("guide.api.intro", "Search, read and download public MODAVIS data. All requests in this guide are read-only and require no account or access token.", "Durchsuchen Sie öffentliche MODAVIS-Daten, rufen Sie Datensätze ab oder laden Sie Datenpakete herunter. Die Beispiele erlauben nur Lesezugriffe und erfordern weder ein Konto noch ein Zugriffstoken.")}</p>
        </div>
        <div className="api-reference-links">
          <a className="api-primary-link" href={REFERENCE}>{t("guide.api.reference.open", "Full API reference", "Vollständige API-Referenz")} <ArrowRight aria-hidden="true" size={16} /></a>
          <a href={locale === "de" ? "/navigator-api.de.md" : "/navigator-api.md"} download>{t("guide.api.reference.download", "Download Markdown", "Als Markdown herunterladen")}</a>
        </div>
      </header>

      <nav className="api-guide-paths" aria-label={t("guide.api.sections", "On this page", "Auf dieser Seite")}>
        <a href="#api-rest"><Code2 aria-hidden="true" size={20} /><span><strong>REST</strong>{t("guide.api.rest.nav", "Search and read records", "Datensätze suchen und abrufen")}</span></a>
        <a href="#api-graphql"><GitBranch aria-hidden="true" size={20} /><span><strong>GraphQL</strong>{t("guide.api.graphql.nav", "Query selected fields at a fixed data version", "Ausgewählte Felder eines festen Datenstands abfragen")}</span></a>
        <a href="#api-reuse"><Database aria-hidden="true" size={20} /><span><strong>{t("guide.api.reuse.nav", "Dataset downloads", "Datensatz-Downloads")}</strong>{t("guide.api.reuse.navDetail", "Find release files and export selections", "Dateien zur Datensatzversion finden und Auswahlen exportieren")}</span></a>
      </nav>

      <RestQuickstart origin={origin} />

      <section className="release-guide-section" id="api-graphql" aria-labelledby="api-graphql-heading">
        <h2 id="api-graphql-heading">{t("guide.api.graphql.title", "Run a reproducible GraphQL query", "Eine reproduzierbare GraphQL-Abfrage ausführen")}</h2>
        <p>{t("guide.api.graphql.intro", "Select the fields you need and bind the query to the verified data version used by this installation.", "Wählen Sie die benötigten Felder aus und binden Sie die Abfrage an den geprüften Datenstand dieser Installation.")}</p>
        <ol className="api-gql-steps">
          <li><a href={CONTEXT}>{t("guide.api.graphql.context", "Read the workbench context", "Metadaten der Recherchewerkbank abrufen")}</a>{t("guide.api.graphql.pin", " and use publicCoreSha256 as the value of snapshot.", " und publicCoreSha256 als Wert für snapshot verwenden.")}</li>
          <li>{t("guide.api.graphql.request", "Send POST /api/graphql with the JSON fields snapshot, query and any variables.", "Eine POST-Anfrage an /api/graphql senden. Der JSON-Inhalt enthält snapshot, query und bei Bedarf variables.")}</li>
        </ol>
        <a className="api-primary-link" href={DATA_ACCESS + "#pod-graphql"}>{t("guide.api.graphql.try", "Try GraphQL in the POD Explorer", "GraphQL im POD-Explorer ausprobieren")} <ArrowRight aria-hidden="true" size={16} /></a>
        <details>
          <summary>{t("guide.api.graphql.python", "Python example: read the Nikolaikirche organ", "Python-Beispiel zur Orgel der Leipziger Nikolaikirche")}</summary>
          <RequestExample code={graphQlExample(origin)} label={t("guide.api.command.python", "Python command", "Python-Befehl")} />
        </details>
        <p>{t("guide.api.graphql.reproduce", "Save the query, variables and snapshot identifier with the result.", "Bewahren Sie Abfrage, Variablen und Kennung des Datenstands zusammen mit dem Ergebnis auf.")} <a href={REFERENCE + "#graphql"}>{t("guide.api.graphql.limits", "Supported queries and limits", "Unterstützte Abfragen und Grenzwerte")}</a></p>
      </section>

      <section className="release-guide-section" id="api-reuse" aria-labelledby="api-reuse-heading">
        <h2 id="api-reuse-heading">{t("guide.api.reuse.title", "Check the dataset version and download files", "Datensatzversion prüfen und Dateien herunterladen")}</h2>
        <dl className="api-reuse-links">
          <div><dt><a href="/api/release-context">{t("guide.api.reuse.context", "Dataset version and scope", "Datensatzversion und Umfang")}</a></dt><dd>{t("guide.api.reuse.contextDescription", "Find the version, public scope and documentation policy.", "Angaben zur Version, zum Umfang der öffentlichen Daten und zur Dokumentation.")}</dd></div>
          <div><dt><a href="/api/pod/capabilities">{t("guide.api.reuse.capabilities", "POD formats and files", "POD-Formate und -Dateien")}</a></dt><dd>{t("guide.api.reuse.capabilitiesDescription", "Find available formats and the versioned manifest of distribution files.", "Verfügbare Formate und das Dateiverzeichnis der jeweiligen Datensatzversion.")}</dd></div>
          <div><dt><a href="/api/health/capabilities">{t("guide.api.reuse.status", "Service status", "Funktionsstatus")}</a></dt><dd>{t("guide.api.reuse.statusDescription", "Check which optional services currently answer requests.", "Übersicht der Zusatzfunktionen, die derzeit Anfragen beantworten.")}</dd></div>
          <div><dt><a href={DATA_ACCESS + "#pod-dataset-downloads"}>{t("guide.api.reuse.download", "Downloads and research exports", "Downloads und Rechercheexporte")}</a></dt><dd>{t("guide.api.reuse.downloadDescription", "Download a release or export a research selection with supporting metadata.", "Dateien einer Datensatzversion herunterladen oder eine Rechercheauswahl samt Metadaten exportieren.")}</dd></div>
        </dl>
      </section>
    </article>
  );
}
