# Öffentliche API des MODAVIS Navigators

Der Navigator stellt den öffentlichen Pfeifenorgeldatensatz (POD) über HTTP-Endpunkte zum Lesen bereit. REST verwendet `GET`, GraphQL verwendet `POST` für Abfragen. Öffentliche Lesezugriffe erfordern weder ein Konto noch ein Zugriffstoken.

Diese Referenz beschreibt das aktuelle öffentliche Profil des Navigators. Datensatz und Anwendung haben jeweils eigene Versionsnummern. Je nach Installation können optionale Sammlungen, Rechercheindizes, Referenzdatensätze oder frühere Datensatzversionen fehlen. Prüfen Sie bei der verwendeten Installation [die verfügbaren Funktionen](#runtime-discovery).

<a id="quickstart"></a>
## Schnellstart

Setzen Sie die Basisadresse auf die öffentliche Instanz oder Ihre lokale Installation. Die Terminalbeispiele verwenden curl und an den angegebenen Stellen jq. Das GraphQL-Beispiel verwendet Python 3 mit der Standardbibliothek.

```sh
BASE=https://navigator.modavis.org
# Für die lokale Vorschau verwenden Sie BASE=http://127.0.0.1:5280

curl -fsS "$BASE/api/release-context" | jq '{releaseVersion, capabilities}'

curl -fsS --get "$BASE/api/entities/search" \
  --data-urlencode 'q=Leipzig' \
  --data-urlencode 'kinds=organs,places' \
  --data-urlencode 'limit=5' |
  jq '{items, counts, hasMore}'
```

Verwenden Sie die Datensatzkennung oder den ausgegebenen API-Link, um einen Treffer zu öffnen. Die Orgel der Leipziger Nikolaikirche hat die Kurzkennung `7PDZ-MDM0-0` und die vollständige Kennung `MDVS:ENTY:7PDZ-MDM0-0`. Viele Orgelendpunkte akzeptieren beide Formen. Für Noten, Literatur, Stimmungssysteme, Vokabulareinträge und Quelldatensätze verwenden Sie die Kennung aus der jeweiligen Sammlung. Kodieren Sie bei Bedarf Pfadkennungen und Abfragewerte für die URL.

```sh
ORGAN=7PDZ-MDM0-0
curl -fsS "$BASE/api/organs/$ORGAN" | jq '.organ | {mdvsId, title, citation}'
curl -fsS "$BASE/api/organs/$ORGAN/specification" |
  jq '{specificationDescriptions, technicalEvidence}'
```

<a id="pagination-and-filters"></a>
## Seitennavigation und Filter

Die meisten Kataloge kombinieren einen nullbasierten Versatz `offset` mit einer begrenzten Seitengröße `limit`. Lesen Sie die tatsächlich verwendeten Werte, sofern die Antwort sie enthält. Vergleichen Sie `offset + len(items)` mit `total` oder prüfen Sie `hasMore`. Antwortstruktur und Zähleinheit hängen vom jeweiligen Endpunkt ab. Bei einem Stimmungssystem stehen verknüpfte Orgeldatensätze beispielsweise im Objekt `organs`.

```sh
curl -fsS --get "$BASE/api/organs" \
  --data-urlencode 'q=Leipzig' \
  --data-urlencode 'sort=stops' \
  --data-urlencode 'limit=10' \
  --data-urlencode 'offset=10' |
  jq '{total, limit, offset, returned: (.items | length)}'
```

Behalten Sie beim Wechsel zur nächsten Seite Filter und Sortierung bei. Viele Katalogendpunkte begrenzen Zahlenwerte auf den zulässigen Bereich. Endpunkte mit strikter Prüfung lehnen ungültige Werte ab. Recherchewerkbank und Analysen verwenden nullbasierte Seitenzahlen unter `page`. Die sammlungsübergreifende Suche gibt 1 bis 50 nach Relevanz geordnete Treffer aus und bietet keinen Versatz. Verwenden Sie zur Seitennavigation den jeweiligen Katalog. Für den Export vollständiger Auswahlen gibt es eigene Endpunkte.

Übergeben Sie Suchtext direkt in `q` oder `term`. Geben Sie Filter als benannte Parameter an und verwenden Sie `true` oder `false` für Wahrheitswerte. Endpunkte mit strikter Prüfung lehnen unbekannte, mehrfach vergebene, unvereinbare oder fehlerhaft formatierte Parameter ab. Die Dispositionssuche akzeptiert ausdrücklich mehrere `stop`-Parameter.

<a id="responses-and-errors"></a>
## Antworten und Fehler

JSON ist das Standardformat für Lesezugriffe. Downloads können stattdessen CSV, RDF, ZIP oder Kartenkacheln liefern. Beachten Sie `Content-Type`, `Content-Disposition` und vorhandene Prüfsummenheader. Gibt der Server ein `ETag` zurück, kann eine bedingte GET-Anfrage mit HTTP 304 und ohne Antwortinhalt beantwortet werden.

| Status | Bedeutung und Vorgehen |
| --- | --- |
| `200` | Lesezugriff erfolgreich. Eine leere Ergebnisliste oder der Zählwert null zeigt an, dass es keine Treffer gibt. |
| `304` | Die bedingte Anfrage bezieht sich auf eine unveränderte Darstellung. Verwenden Sie die zwischengespeicherten Daten erneut. |
| `400` | Prüfen Sie Parameternamen, Werte, Wertebereiche und Anfrageformat. GraphQL kann die Ausführung auch mit einem `errors`-Array ablehnen. |
| `403` | Vorgang oder Modus liegt außerhalb des öffentlichen Lesezugriffs. |
| `404` | Datensatz, Endpunkt, Exportformat oder Datensatzversion ist nicht verfügbar. |
| `405` | Verwenden Sie die dokumentierte HTTP-Methode. GraphQL akzeptiert `POST`. |
| `409` | Der angegebene Datenstand, der Stand einer Bewertung oder die Fassung einer Beschreibung stimmt mit der verfügbaren Fassung nicht überein oder hat sich während des Lesezugriffs geändert. Stellen Sie vor einer Wiederholung genau die angeforderte Fassung bereit. |
| `413` | Eine Grenze für Anfrage, Antwort oder Feldbelege wurde überschritten. Schränken Sie die Abfrage ein oder fragen Sie weniger Felder ab. |
| `422` | Rechercheergebnis oder Datenpaket überschreitet eine Auswahl- oder Größengrenze. Schränken Sie die Auswahl ein. |
| `503` | Funktion, Abhängigkeit oder Lesekapazität steht nicht zur Verfügung. Prüfen Sie den Funktionsstatus und beachten Sie `Retry-After`, falls vorhanden. |
| `504` | Der Lesezugriff hat seine Zeitgrenze überschritten. Schränken Sie die Anfrage ein oder wiederholen Sie sie nach der angegebenen Wartezeit. |

Die meisten REST-Fehler liefern einen `error`-Text. Manche enthalten zusätzlich `message`, `retryable` oder eine Kennung des Antwortvertrags. GraphQL kann stattdessen ein `errors`-Array zurückgeben. Prüfen Sie den HTTP-Status, bevor Sie die Antwort auswerten. Eine abgelehnte Anfrage sagt nichts über die Trefferzahl aus. Behandeln Sie HTML-Antworten eines Proxys als Übertragungs- oder Installationsfehler.

Der optionale Header `X-Request-Timeout-Ms` erwartet eine positive ganze Zahl in Millisekunden und kann die Zeitgrenze des Servers verkürzen. Sofern verfügbar, geben `X-MODAVIS-Query-Budget-Ms` und `Server-Timing` die zugeteilte Zeit und die serverseitigen Laufzeiten an.

<a id="runtime-discovery"></a>
## Verfügbare Funktionen prüfen

| GET-Pfad | Zweck |
| --- | --- |
| `/api/health/live` | Prüft, ob der HTTP-Prozess erreichbar ist. |
| `/api/health/ready` | Prüft die Betriebsbereitschaft der öffentlichen Instanz. HTTP 503 weist auf fehlende Pflichtfunktionen hin. |
| `/api/health/capabilities` | Status der einzelnen Funktionen, Verfügbarkeit der Downloads und weitere Angaben zur Betriebsbereitschaft. |
| `/api/release-context` | Datensatzversion, Umfang der öffentlichen Daten und Anwendungsfunktionen. |
| `/api/pod/capabilities` | Verfügbarkeit öffentlicher Sammlungen und deren Zähleinheiten. Das Objekt `dataAccess` nennt GraphQL, Exporttypen, Profile und das versionsgebundene Verzeichnis der Downloadpakete. |
| `/api/discovery/context` | Umfang und Bestandszahlen, die der nach Relevanz geordneten Suche zugrunde liegen. |
| `/api/uri-policy` | Regeln für kanonische URIs, Bereitstellungsadressen und Datensatzversionen. |
| `/api/workbench/context` | Geprüfter Datenstand der Recherche, Filterwerte, Exportgrenze und Verfügbarkeit von Recherchepaketen. |

<a id="catalogue-and-record-endpoints"></a>
## Kataloge und einzelne Datensätze

Alle folgenden Pfade verwenden GET. Die aufgeführten Parameter stehen für öffentliche Lesezugriffe zur Verfügung. Die optionalen Angaben zu Katalogfiltern und zur Verfügbarkeit zeigen, welche Werte die jeweilige Installation unterstützt.

| Pfad | Abfrageparameter und Antwort |
| --- | --- |
| `/api/explore` | `q`, `limit`. Übersichten zum Datenbestand und Kennzahlen zur Suche. |
| `/api/entities/search` | `q`, `kinds` (durch Kommas getrennte Werte `organs,people,places,events`), `limit` (Standard 12, Bereich 1–50). Liefert nach Relevanz geordnete `items`, `counts`, `groups`, `hasMore` und die Abfragekennung. |
| `/api/organs` | `q`, `source`, `builder`, `location_state`, `media_state`, `conflict_scope`, `specification_state`, `event_type`, `virtual_instrument`, `sort`, `include_facets`, `limit`, `offset`. Die Sortierung ist nach Registern (`stops`), Quellen (`sources`), Medien (`media`) oder Namen möglich. |
| `/api/organs/facets` | Filterwerte und Trefferzahlen des Orgelkatalogs. |
| `/api/organs/{id}` | Der Orgeldatensatz steht unter `organ`. Detailangaben lassen sich über die folgenden Endpunkte abrufen. |
| `/api/organs/{id}/citation` | Zitationsangaben unter `citation`, einschließlich der Metadaten zur Datensatzversion und, falls vorhanden, BibTeX. |
| `/api/organs/{id}/sources` | Zugeordnete Quellen und öffentliche Quellenlinks. |
| `/api/organs/{id}/specification` | Erfasste Disposition und Komponenten, einzeln zugeordnete Beschreibungen, technische Belege und Vergleichsgruppen. |
| `/api/organs/{id}/specification-descriptions/{description_id}` | Eine Quellenbeschreibung unter `description`. Übergeben Sie ihre `revision`, damit geänderte Fassungen abgelehnt werden. Beide Kennungen stehen in der Antwort des Dispositionsendpunkts. |
| `/api/organs/{id}/history`, `/api/organs/{id}/related`, `/api/organs/{id}/media` | Quellengestützte Geschichte, verknüpfte Datensätze bzw. Medienverweise. |
| `/api/organs/{id}/pipe-positions` | `component_id` erforderlich. Optional sind `reference_id`, `limit` (Standard 100, Bereich 1–200) und `offset`. Funktionale Pfeifenpositionen werden berechnet, soweit die erfasste Disposition es zulässt. |
| `/api/pipe-positions/{reference_id}` | `organ_id` und `component_id` erforderlich. Die funktionale Referenz samt zugehörigen Belegen. |
| `/api/pod/organs/{id}/resources` | Quellenbelegte Ressourcen, zugehörige virtuelle Instrumente und dokumentierte Bezeichnungen für Stimmungssysteme. |
| `/api/persons` | `q`, `source`, `publication_state`, `role`, `entity_class`, `sort`, `limit`, `offset`. Das Verzeichnis umfasst auch Quellennennungen mit ungeklärter Zuordnung. |
| `/api/entities/{category}/{id}` | Kategorien `people`, `persons`, `organizations`, `institutions` und `source-actors`. Für kanonische Akteursdatensätze liefert `view=summary` eine Übersicht und `view=full` die ausführliche Darstellung. |
| `/api/actors/{id}/mentions`, `/api/actors/{id}/relationships` | Belege zu Nennungen und Beziehungen eines Akteurs. Parameter sind `q`, `limit` (1–100) und `offset`. |
| `/api/entities/names/{id}` | Strukturierte Namensangabe unter `name`. |
| `/api/events` | `q`, `participant` (kanonische Akteurskennung), `subject`, `type`, `route` (Belege für Ausgangs- oder Zielorte oder Verfügbarkeit der Kartenansicht), `source`, `year_from`, `year_to`, `sort` (`newest`, `oldest`, `type`), `limit`, `offset`. |
| `/api/events/{id}` | Eine dokumentierte Ereignisangabe. Mehrere Angaben können dasselbe historische Ereignis betreffen. |
| `/api/pod/places`, `/api/places/{id}` | Ortsverzeichnis (`q`, `kind`, `limit`, `offset`) und Ortsdatensatz. |
| `/api/pod/sources` | Quellenverzeichnis mit `q`, `source`, `limit` und `offset`. Für Orts- und Quellenverzeichnisse des POD gelten `limit` 1–50 und `offset` 0–10.000. |
| `/api/public/sources/{id}`, `/api/public/sources/{id}/structured.json` | Öffentlicher Quelldatensatz und seine strukturierte Fassung für die Veröffentlichung. |
| `/api/literature`, `/api/literature/status` | Literaturverzeichnis mit `q`, `source`, `collection`, `year_from`, `year_to`, `publication_type`, `author`, `venue`, `volume`, `container_type`, `confidence`, `digitized`, `sort`, `limit`, `offset`. Der Status-Endpunkt gibt die Verfügbarkeit an. |
| `/api/literature/{id}` | Ein bibliografischer Datensatz mit Quellen- und Zugangslinks. |
| `/api/scores` | Notenkatalog mit `q`, `collection`, `format`, `evidence_strength`, `analysis_status`, `sort`, `limit`, `offset`. |
| `/api/scores/{id}`, `/api/scores/{id}/assets/{asset_id}` | Metadaten zu Noten und Dateien, Formate und verfügbare Analysen. Verwenden Sie die angegebenen Zugangslinks für die Dateien. |
| `/api/virtual-instruments`, `/api/virtual-instruments/status` | Katalog und Verfügbarkeit virtueller Instrumente. Filter: `q`, `producer`, `platform`, `access_category`, `license_category`, `catalog_status`, `country`, `granularity`, `independently_distributed`, `link_state`, `organ_link`, `limit`, `offset`. |
| `/api/virtual-instruments/{id}` | Metadaten eines virtuellen Instruments und Bezüge zu Orgeln mit Angaben zur Art der Verknüpfung. |

Bei Standortwechseln filtert `route` mit `origin`, `destination`, `either` oder `both` nach dokumentierten Ausgangs- und Zielorten. `mapped` und `unresolved` filtern nach der Verfügbarkeit einer schematischen Kartenverbindung. `transferEndpoints` gruppiert Orte nach ihrer erfassten Rolle. Mit `q` lassen sich in einer Auswahl von Standortwechseln auch die Namen dieser Orte durchsuchen. Ein Ortslink bezeichnet den genannten Ort. Für die Kartenverbindung müssen beide Koordinaten den historischen Belegen zugeordnet sein.

Quellenzuordnungen geben an, woher die Angaben stammen. Sie belegen weder eine unabhängige Bestätigung noch den Erhalt der historischen Substanz oder den heutigen Zustand. Funktionale Pfeifenpositionen beschreiben keine physische Pfeifengeometrie. Medien und Noten können auf externe Angebote mit eigenen Nutzungsrechten und eigener Verfügbarkeit verweisen.

<a id="tuning-systems"></a>
## Stimmungssysteme

| GET-Pfad | Abfrageparameter und Antwort |
| --- | --- |
| `/api/temperaments` | `q`, `group_key`, `precise_variant`, `commentary_available`, `commentary_q`, Suchbereich `scope`, Parameter zu dokumentierten Zuordnungen, `limit`, `offset`. Die Liste enthält die Trefferzahlen je Katalogeintrag. |
| `/api/temperaments/{id}` | Katalogeintrag, Centwerte, Kommentar und verwandte Katalogvarianten, soweit verfügbar. |
| `/api/temperaments/{id}/organs` | `scope` akzeptiert `all`, `exact` oder `family`. `limit` hat den Standardwert 200 (Bereich 1–500), `offset` liegt zwischen 0 und 100.000. Das Objekt `organs` enthält die gefilterte Ergebnisseite, ihre Gesamttrefferzahl, die ungefilterten Zahlen je Kategorie und die Quellenangaben. |

Im Katalog richtet sich `sort=catalogue|occurrences_desc|occurrences_asc` nach der mit `occurrence_scope=all|exact|family` gewählten Zählweise. `min_occurrences` und `max_occurrences` akzeptieren ganzzahlige Grenzen von 0 bis 1.000.000. Beide Grenzwerte zählen mit. Der Filter wird vor der Aufteilung in Ergebnisseiten angewendet. Der Suchbereich `scope=evidence` beschränkt die Katalogtreffer auf belegten Quellenwortlaut, unabhängig von der gewählten Zählweise.

```sh
curl -fsS "$BASE/api/temperaments?sort=occurrences_desc&occurrence_scope=exact&min_occurrences=1&limit=5" |
  jq '{total, filters, occurrences: [.items[].occurrences]}'

curl -fsS "$BASE/api/temperaments/2hKi2/organs?scope=family&limit=5" |
  jq '.organs | {scope, total, exactVariantCount, familyWordingCount, hasMore, items}'
```

Eine exakte Angabe bezeichnet die konkrete Katalogvariante. Verwandter Quellenwortlaut kann sich auf eine ganze Gruppe beziehen oder die genaue Variante offenlassen. Pro Katalogeintrag zählt eine Orgel einmal, wobei eine exakte Zuordnung Vorrang hat. Zuordnungen über verwandten Quellenwortlaut können sich über mehrere Katalogeinträge überschneiden. Der Wortlaut einer Quelle allein belegt keine heutige Stimmung.

<a id="research-snapshots-and-queries"></a>
## Datenstände und Rechercheabfragen

Über `GET /api/workbench/context` erhalten Sie `publicCoreSha256` und weitere Hashwerte zum gebundenen Datenstand. Verwenden Sie für reproduzierbare Abfragen der Recherchewerkbank `snapshot=<publicCoreSha256>`. Wenn die Identitätsbewertung Teil Ihrer Fragestellung ist, geben Sie zusätzlich `assessment=<occurrenceAssessmentSha256>` an. Bewahren Sie die Abfrageparameter sowie gegebenenfalls `semanticQuery` und `selectionSha256` aus der Antwort auf. Darstellungsoptionen und Ergebnisseiten können unabhängig von der inhaltlichen Auswahl sein.

```sh
SNAPSHOT=$(curl -fsS "$BASE/api/workbench/context" | jq -er '.publicCoreSha256')

curl -fsS --get "$BASE/api/workbench/selection" \
  --data-urlencode "snapshot=$SNAPSHOT" \
  --data-urlencode 'section=configurations' \
  --data-urlencode "organ=$ORGAN" \
  --data-urlencode 'page=0' |
  jq '{total, limit, offset, hasMore, semanticQuery, items}'
```

| GET-Pfad | Abfrageparameter und Antwort |
| --- | --- |
| `/api/workbench/selection`, `/api/workbench/selection/export` | Wählen Sie für `section` einen der Werte `events`, `sequences`, `configurations` oder `organs`. Filter und Zähleinheiten hängen von der Auswahl ab. Ergebnisseiten enthalten bis zu 50 Datensätze. Exportformate sind JSON, CSV und, falls verfügbar, RO-Crate. |
| `/api/workbench/account/{description_id}` | Eine Quellenbeschreibung der Orgelkonfiguration. Mit `revision` lässt sich die genaue Fassung angeben. |
| `/api/workbench/compare` | `left`, `right` sind die unterschiedlichen Kennungen zweier Quellenbeschreibungen. `leftRevision` und `rightRevision` binden die Abfrage an deren Fassungen. Die Antwort enthält beide Quellenbeschreibungen mit Zuordnung sowie einen Vergleich der erfassten Einträge. |
| `/api/workbench/organ-comparison` | `organs` enthält zwei bis vier durch Kommas getrennte Orgelkennungen. Die Antwort stellt die Quellenbeschreibungen, Quellen, Ereignisse und technischen Belege pro Orgel getrennt dar. Die JSON-Vorschau weist auf begrenzte Belegumfänge hin. |
| `/api/workbench/timeline/{organ_id}`, `/api/workbench/claims/{organ_id}` | Dokumentierte Ereignisse und Konfigurationen bzw. nach Quelle gruppierte Aussagen. |
| `/api/workbench/terms`, `/api/workbench/terms/export` | `mode`, `q`, `concept`, `pitch`, `country`, `source`, `from`, `to`. Unterstützte Arten von Benennungen stehen bei den Filtern der Recherchewerkbank. |
| `/api/workbench/identities` | Geprüfte Zusammenfassung der öffentlichen Identitätszuordnungen. |
| `/api/workbench/occurrences`, `/api/workbench/occurrences/export` | Identitätsbelege für einzelne Nennungen mit `event`, `actor`, `native`, `organ`, `source`, `status`, `kind`, sofern die Bewertung vorliegt. |
| `/api/workbench/dispositions`, `/api/workbench/dispositions/export` | Gemeinsame Vorkommen erfasster Register in einer Quellenbeschreibung oder einem Werk. Siehe [Dispositionssuche](#disposition-finder). |
| `/api/research/context`, `/api/research/stories`, `/api/research/identity-audit` | Datenstand des Rechercheindex, Datenberichte und Prüfung der Identitätszuordnungen. |
| `/api/research/stop-names`, `/api/research/stop-names/download` | Recherche zu erfassten Registernamen. Die Liste verwendet `q`, `country` und nullbasierte `page` mit 20 Einträgen pro Seite. Der Download enthält die aufbereitete Recherchedatei. |
| `/api/research/actors`, `/api/research/actors/{id}` | Akteurssuche (`q`, `page`) und Zusammenfassung zum ausgewählten Akteur. |
| `/api/research/actors/{id}/{section}` | `neighbors`, `organs`, `events`, `configurations` oder `sequences`. Verwendet `q` und `page`. Bei gemeinsamen Orgeln, gemeinsamen Ereignissen oder aufeinanderfolgenden Tätigkeiten bezeichnet `other` den zweiten Akteur. |
| `/api/research-exploration/terms/{family}`, `/api/research-exploration/terms/{family}/export` | Verteilungen von Benennungen für unterstützte Gruppen. Parameter sind unter anderem `term`, `match`, `source`, `dimension`, `zeros`, `page`, `snapshot`, `analysis`. Der Export ist in JSON und CSV möglich. |
| `/api/research-exploration/network`, `/api/research-exploration/network/export` | Ausgewählter Akteur `actor` mit `mode` (`shared`, `joint`, `earlier` oder `later\)) sowie `page`, `snapshot` und `assessment`. Der Export ist in JSON oder, falls verfügbar, in RO-Crate möglich. |

Die Recherchewerkbank wertet in den unterstützten Ansichten `actor`, `organ`, `q` und `source` aus. Für Ereignisse und Abfolgen stehen zusätzlich `other`, `from`, `to`, `date`, `activity`, `role` und `identity` zur Verfügung. Abfolgen setzen zwei Akteure voraus. Konfigurationen unterstützen außerdem `from`, `to`, `date` und `coverage`. Für die Orgelauswahl steht auch `other` zur Verfügung. Mindestens ein Akteur, eine Orgel, eine Quelle oder ein Suchtext ist erforderlich. Datumsfilter akzeptieren die Jahre 1 bis 2100. `appliedFilters` zeigt die angewendeten Filter. `navigationState` enthält die beibehaltenen Anzeigeoptionen.

Standardexporte der Recherchewerkbank sind auf 50.000 Datensätze begrenzt. RO-Crate setzt einen exakt angegebenen aktuellen Datenstand und eine aktivierte Exportfunktion voraus. Datenpakete unterstützen die vollständige Rechercheauswahl, Exporte von Benennungen und Nennungen, Vergleiche von Quellenbeschreibungen und Orgeln, Abfragen zu Identitäten, Quellenbeschreibungen, Zeitleisten und Aussagen sowie Exporte von Analysen und Wortlautbelegen. Die Pakete enthalten Auswahl, Metadaten, Nutzungsrechte, Prüfsummen und Hinweise zur Wiederholung. Exporte mit unvollständigen oder zu umfangreichen Belegen werden abgelehnt. Die Größengrenze von 32 MiB bezieht sich auf das Datenpaket. Für Ergebnisseiten gelten eigene Grenzen.

<a id="disposition-finder"></a>
### Dispositionssuche

`GET /api/workbench/dispositions` setzt einen exakt angegebenen `snapshot` und zwei bis vier wiederholte `stop`-Parameter voraus. Jedes Kriterium besteht aus einem 1 bis 100 Zeichen langen Registernamen. Nach einem senkrechten Strich kann eine Fußtonangabe mit bis zu 24 Zeichen folgen. Ohne diese Angabe wird nur nach der Bezeichnung gesucht. Der Standard `scope=account` verlangt unterschiedliche erfasste Registerzeilen in derselben Quellenbeschreibung. Bei `scope=division` müssen sie zusätzlich demselben namentlich dokumentierten Werk zugeordnet sein.

```sh
curl -fsS --get "$BASE/api/workbench/dispositions" \
  --data-urlencode "snapshot=$SNAPSHOT" \
  --data-urlencode 'scope=account' \
  --data-urlencode 'stop=Vox Humana|8' \
  --data-urlencode 'stop=Quintadena|16' \
  --data-urlencode 'page=0' |
  jq '{total, unit, accountCount, organCount, selectionSha256, hasMore, items}'

curl -fsS --get "$BASE/api/workbench/dispositions/export" \
  --data-urlencode "snapshot=$SNAPSHOT" \
  --data-urlencode 'scope=account' \
  --data-urlencode 'stop=Vox Humana|8' \
  --data-urlencode 'stop=Quintadena|16' \
  --output disposition-selection.json
```

Ergebnisseiten enthalten bis zu 50 Treffer. `total` bezieht sich auf die ausgewählte Zähleinheit. `accountCount` und `organCount` zählen Quellenbeschreibungen bzw. Orgeln jeweils ohne Mehrfachzählung. Die Ergebnisse halten die Fassung der Quellenbeschreibung, Quellenpfade, ursprünglichen Wortlaut und die zu jedem Suchkriterium passenden erfassten Zeilen fest. Der Hashwert der Auswahl kennzeichnet die normalisierten Kriterien, den Suchbereich, die Abfragemethode und die gebundenen Datenstände. Die Antwort enthält auch `X-Selection-SHA256`. Der JSON-Export liefert die vollständige Auswahl innerhalb der geltenden Grenzen unabhängig von der angezeigten Ergebnisseite.

Die Suche ist auf 100.000 passende Zeilen begrenzt. Beim Export dürfen Treffer- und Belegzeilen zusammen höchstens 50.000 ergeben. Für JSON gilt eine Größengrenze von 32 MiB. Die Zeitgrenze beträgt 25 Sekunden für die Vorschau und 30 Sekunden für den Export. Wird eine Grenze überschritten, gibt die API dies ausdrücklich an. Ein Treffer beschreibt die Erfassung aus der Quelle, einschließlich eigens gekennzeichneter nachträglich erschlossener Zeilen. Daraus lassen sich weder der heutige Zustand noch das Fehlen unerfasster Register ableiten.

<a id="vocabularies-and-independent-references"></a>
## Vokabulare und unabhängige Referenzen

`/api/vocab/catalogue` listet die verfügbaren Sammlungen und ihre Datenstände auf. Kontrollierte Begriffe, Begriffskandidaten, Schemakategorien, erfasster Quellenwortlaut und unabhängige Referenzen unterscheiden sich in Beleglage und Versionsbezug.

| GET-Pfad | Abfrageparameter und Antwort |
| --- | --- |
| `/api/vocab/catalogue`, `/api/vocab/overview`, `/api/vocab/schemes` | Sammlungsübersicht, Kennzahlen und Verzeichnis der Begriffssysteme. |
| `/api/vocab/releases` | Verzeichnis der veröffentlichten Vokabularversionen. Je nach Profil können die Vokabulare ausschließlich als Teil des POD vorliegen. |
| `/api/vocab/concepts` | `scheme_code`, `q`, `language`, `limit` (1–500), `offset`, `snapshot`. Der Datenstand kennzeichnet den Inhalt eines kontrollierten Begriffssystems und setzt dessen Kennung voraus. |
| `/api/vocab/concepts/{id}` | Angaben zu einem Begriff oder einer Kategorie. Optional sind `scheme_code` und der `snapshot` des kontrollierten Begriffssystems. |
| `/api/vocab/snapshots/{scheme}`, `/api/vocab/snapshots/{scheme}.{format}` | Metadaten zum Datenstand oder Download in `json`, `jsonld`, `ttl`, `skos` oder `csv`. Optional bindet `snapshot` den Abruf an die SHA-256-Prüfsumme des Inhalts. |
| `/api/vocab/source-terms/{id}` | Ein öffentlicher Datensatz zu einer Quellenbenennung, soweit verfügbar. |
| `/api/vocab/usage/{family}`, `/api/vocab/usage/{family}/export` | Erfasster Quellenwortlaut oder Belege zu einzelnen Vorkommen. Verwenden Sie `q` für die Wortlautsuche oder `term` mit `match=exact` bzw. `contains`. Unterstützte Parameter: `source`, `organ_q`, `section`, `sort`, `dimension`, `bucket`, `page` und gegebenenfalls ein POD-`snapshot`. Die Liste enthält 30 Einträge pro Seite. Verwenden Sie die Gruppenkennungen aus dem Katalog. |
| `/api/vocab/registry`, `/api/vocab/registry/concept`, `/api/vocab/registry/export` | Register der Begriffskandidaten. Liste und Export filtern nach `scheme`, `q`, `language`. Die Detailabfrage verwendet `uri`. Für die Seitennavigation dienen `offset` und `limit`. Exportformate sind `json`, `csv`, `jsonld`, `ttl` und `skos`. Die Datenstände werden über `snapshot` (Register), `coreSnapshot` (POD) und `indexSnapshot` (Rechercheindex) angegeben. |
| `/api/vocab/references`, `/api/vocab/references/{code}` | Verzeichnis unabhängiger Referenzen und Suche innerhalb einer Sammlung. Parameter: `q`, `kind`, `scheme`, `language`, `offset`, `limit` und der eigene `snapshot` der Sammlung. |
| `/api/vocab/references/{code}/concept`, `/api/vocab/references/{code}/download/{extension}` | Referenzdatensatz nach `uri` und optional `language` oder verfügbares Downloadpaket einer bestimmten Version. |
| `/api/omaro`, `/api/omaro/concepts`, `/api/omaro/concept`, `/api/omaro/download/{key}` | OMARO-Versionsmetadaten, Sammlungsansicht, Ressource nach `uri` und originale Downloadpakete. Die Sammlungsansicht akzeptiert `collection` (`instruments`, `hs` oder `ontology\)) sowie `q`, `offset`, `limit` (1–100), `snapshot` und gegebenenfalls `language` und `resolution`. Der Datenstand von OMARO ist unabhängig vom POD. |

```sh
curl -fsS --get "$BASE/api/vocab/usage/stops" \
  --data-urlencode "snapshot=$SNAPSHOT" \
  --data-urlencode 'term=Vox Humana' \
  --data-urlencode 'match=exact' |
  jq '{total, counts, publicCoreSha256, hasMore}'
```

Eine akzeptierte Wortlautzuordnung macht aus einem Begriffskandidaten keinen kontrollierten Begriff. Eine Namensübereinstimmung mit einem Referenzdatensatz führt zu keiner Klassifikation einer Orgel im POD. Sprachfilter für erfasste Benennungen ändern die ausgegebenen Daten. Die Sprache der Navigator-Oberfläche kann unabhängig davon gewählt werden.

<a id="maps-and-identifier-resolution"></a>
## Karten und Auflösung von Kennungen

| GET-Pfad | Zweck |
| --- | --- |
| `/api/map/summary.json`, `/api/map/places.geojson` | Kennzahlen zur Karte und Standortgruppen. `precision` akzeptiert `all`, `exact` oder `fallback`; Standard ist `exact`. Der GeoJSON-Endpunkt akzeptiert `bbox=west,south,east,north`, `limit` und `compact`. |
| `/api/map/nearby.json` | Prüft, ob in der mit `bbox` angegebenen Fläche passende Standortgruppen liegen. |
| `/api/map/group-at.json`, `/api/map/groups/{site_group_id}` | Standortgruppe zu `longitude` und `latitude` oder Seitennavigation in einer bekannten Standortgruppe mit `offset` und `limit`. |
| `/api/map/tiles/{z}/{x}/{y}.mvt` | Vektorkachel, optional an `release` gebunden. Verwendet die gewählte Koordinatengenauigkeit und die unterstützten Katalogfilter. |
| `/api/map/movements.geojson`, `/api/map/coordinate-relocation-summary.json` | Erhaltene Belege zu Bewegungen und Ortswechseln. Zu den Filtern gehören `datetime`, `movement` und `movement_type`. |
| `/api/map/project.geolibre.json` | GeoLibre-Projekt für `mode=places` oder `mode=events`. |
| `/api/organs/{id}/map-context.geolibre.json`, `/api/actors/{id}/activity-map.geolibre.json` | Kartenprojekt zu einem Datensatz, soweit geografische Belege vorliegen. |
| `/api/id/{identifier}`, `/api/id/{identifier}/publication-status` | Auflösung öffentlicher Kennungen und Veröffentlichungsstatus. |
| `/api/aliases/{kind}/{slug}` | Löst einen unterstützten öffentlichen Alias zum kanonischen Datensatz auf. |
| `/resolve/{family}/{token}`, `/resolve/alias/{kind}/{slug}` | HTTP-Endpunkte zur Auflösung. Folgen Sie der Weiterleitung und bewahren Sie die zurückgegebene kanonische Kennung auf. |

Standortgruppen, ungefähre Ortsangaben, Koordinaten und Orgeldatensätze sind unterschiedliche Zähleinheiten. Eine Näherungskoordinate gibt den genauen Standort einer Orgel nicht an. Verbindungslinien auf der Karte geben belegte Ortsbeziehungen wieder, ohne einen tatsächlich zurückgelegten Weg zu rekonstruieren.

<a id="entity-exports-and-evidence"></a>
## Datensatzexporte und Quellenbelege

`GET /api/exports/{kind}/{id}` liefert das Exportverzeichnis mit versionsgebundenen Links unter `native` und `profiles` sowie, soweit verfügbar, `datasheetUrl` und `sourceDataUrl`. Verwenden Sie die unter `/api/pod/capabilities` angegebenen Datensatztypen. Das öffentliche Profil umfasst `organ`, `person`, `organization`, `place`, `name` und `virtual_instrument`. Die MODAVIS-eigenen Darstellungen stehen je nach Datensatz als JSON-LD, Turtle, N-Triples oder RDF/XML zur Verfügung. Zu den semantischen Profilen zählen CIDOC CRM, Polifonia Ontology Network und Europeana Data Model.

```sh
curl -fsS "$BASE/api/exports/organ/$ORGAN" | jq '{mdvsId, native, profiles, sourceDataUrl}'

TURTLE=$(curl -fsS "$BASE/api/exports/organ/$ORGAN" |
  jq -er '.native[] | select(.key == "turtle") | .url')
curl -fsS "$BASE$TURTLE" --output nikolaikirche.ttl

curl -fsS "$BASE/api/exports/organ/$ORGAN/evidence" |
  jq '{releaseVersion, complete, recordSha256, fieldCount, states}'
```

`GET /api/exports/{kind}/{id}/sources` listet die öffentlichen strukturierten Quellenfassungen auf. Der Belegendpunkt `/api/exports/{kind}/{id}/evidence` verzeichnet die Felder des vollständigen öffentlichen Exportdatensatzes als JSON Pointer. Er liefert `releaseVersion`, `recordSha256`, `fieldCount`, `complete`, `states` und die einzelnen `fields`. HTTP 413 lehnt Datensätze ab, die 20.000 Felder oder die zulässige Verschachtelungstiefe überschreiten. Der Hashwert bezieht sich auf den Exportdatensatz. RDF-Ausgabeformate können unterschiedliche Dateiprüfsummen haben.

| Belegstatus | Bedeutung |
| --- | --- |
| `evidence_context_available` | Am übergeordneten Objekt ist ein Beleg hinterlegt. |
| `source_context_only` | Eine Quellenkennung liegt vor. Am übergeordneten Objekt ist kein entsprechender Beleg hinterlegt. |
| `unavailable` | Für das Feld liegt keine Belegzuordnung vor. |

Diese Statuswerte beschreiben den Belegkontext. Aus ihnen folgt weder eine automatische Zuordnung einzelner Felder noch eine inhaltliche Prüfung oder unabhängige Bestätigung. Für Medien und Texte gelten weiterhin die Rechte der jeweiligen Quelle.

<a id="dataset-downloads-and-content-negotiation"></a>
### Datensatz-Downloads und Formatauswahl per HTTP

`GET /api/pod/capabilities` nennt das Verzeichnis `dataAccess.distributionManifest`. Dort stehen versionsgebundene Dateipfade, Formate, Nutzungsrechte und Prüfsummen. Zu den Endpunkten für Datensatzversionen gehören:

- `/dataset/pod/version/{version}/distribution-manifest.json`
- `/dataset/pod/version/{version}/distributions/...`, mit vollständigen Dateipfaden aus dem Verzeichnis
- `/dataset/pod/version/{version}/schema/public-source-projection-1.0.json`
- `/dataset/pod/version/{version}/{family}/{artifact}`, mit genauen Pfaden aus dem Exportverzeichnis des jeweiligen Datensatzes
- `/dataset/pod/dataset.{profile}.jsonld` und der entsprechende Pfad unter `/dataset/pod/version/{version}/` für die ausgewiesenen Datensatzprofile
- `/dataset/pod/dataset.edm.xml` und der entsprechende versionsgebundene Pfad für EDM in RDF/XML

Verwenden Sie den im Verzeichnis angegebenen Download-Link und prüfen Sie die zugehörige SHA-256-Prüfsumme. Wählen Sie für reproduzierbare Ergebnisse die genaue Datensatzversion und das benötigte Profil. Frühere Versionen werden nur bereitgestellt, wenn die Installation dafür konfiguriert ist und die Dateien vorliegen.

Die öffentlichen Endpunkte zur Auflösung von Kennungen liefern eine HTTP-Weiterleitung. Übliche Browseranfragen führen zur lesbaren Webseite. Mit `Accept: application/ld+json` fordern Sie verknüpfte Daten an; `Accept-Profile` wählt ein verfügbares Profil aus. Der Resolver interpretiert `Accept: application/rdf+xml` als EDM. Für ein bestimmtes Format wie Turtle verwenden Sie den direkten Link aus dem Exportverzeichnis. REST-Katalogendpunkte liefern unabhängig von diesen Resolverprofilen JSON.

```sh
curl -fsS -D - --output /dev/null \
  -H 'Accept: application/ld+json' \
  "$BASE/resolve/entity/$ORGAN"
```

<a id="graphql"></a>
## GraphQL

`POST /api/graphql` erwartet eine JSON-Anfrage mit `snapshot` und `query`. Optional sind `variables` und `operationName`. Setzen Sie `Content-Type: application/json` und lesen Sie `publicCoreSha256` aus den Metadaten der Recherchewerkbank. GraphQL bietet das dokumentierte Schema für Lesezugriffe.

| Feld auf oberster Ebene | Struktur |
| --- | --- |
| `snapshot` | Geprüfte SHA-256-Prüfsumme der öffentlichen Kerndaten. |
| `entity(kind: EntityKind!, id: ID!)` | Ein öffentlicher Datensatz oder null, falls er fehlt. Felder: `id`, `kind`, `title`, `canonicalUri` und `evidence`. Datensatztypen: `organ`, `person`, `organization`, `place`, `name` und `virtual_instrument`. |
| `organs(query: String, limit: Int = 20, offset: Int = 0)` | `total` und `items`. Die Kurzeinträge für Orgeln enthalten `id`, `title` und `canonicalUri`. |

Das Feld `evidence` enthält `fieldCount`, `unavailable`, `sourceContextOnly`, `evidenceContextAvailable` und `recordSha256`. Wenn Sie Metadaten ohne `evidence` abfragen, greift die Begrenzung für Belegfelder nicht. Überschreitet die angeforderte Belegmenge die Grenze, liefert die API HTTP 400 mit einem GraphQL-`errors`-Array und dem Pfad zum Belegfeld.

```sh
BASE="$BASE" python3 - <<'PY'
import json
import os
from urllib.request import Request, urlopen

base = os.environ["BASE"]
with urlopen(base + "/api/workbench/context", timeout=15) as response:
    snapshot = json.load(response)["publicCoreSha256"]

payload = {
    "snapshot": snapshot,
    "operationName": "OrganAndPage",
    "query": """
      query OrganAndPage($id: ID!, $text: String!) {
        entity(kind: organ, id: $id) { id title canonicalUri }
        organs(query: $text, limit: 5, offset: 0) {
          total
          items { id title canonicalUri }
        }
      }
    """,
    "variables": {"id": "7PDZ-MDM0-0", "text": "Huy-Aderstedt"},
}
request = Request(
    base + "/api/graphql",
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urlopen(request, timeout=15) as response:
    print(json.dumps(json.load(response), indent=2))
PY
```

Erfolgreiche Antworten enthalten `data` und `extensions`. Unter `extensions` stehen `snapshot` und das Profil `modavis.public-read-only-graphql/v1`. Bewahren Sie Abfrage, Variablen und genaue Kennung des Datenstands zusammen mit dem Ergebnis auf. HTTP 409 zeigt an, dass der angeforderte Datenstand abweicht oder sich während des Abrufs geändert hat. HTTP 503 kann auf eine nicht verfügbare geprüfte Recherchewerkbank hinweisen.

Das Profil erlaubt eine Abfrage mit höchstens vier Feldern auf oberster Ebene. Die Orgelliste liefert 1 bis 50 Kurzeinträge pro Feld und akzeptiert einen Versatz von 0 bis 10.000. Datensatzkennungen und Suchtexte für Orgeln dürfen höchstens 256 Zeichen lang sein. Die HTTP-Anfrage ist auf 32 KiB, das GraphQL-Dokument auf 12.000 Zeichen und 1.000 Parser-Token und die Antwort auf 2 MiB begrenzt. Die Abfragestruktur darf höchstens 250 Syntaxbaumknoten und 14 Ebenen umfassen. Wie für andere öffentliche Lesezugriffe gilt eine Zeitgrenze von zehn Sekunden. Bei Ablauf der Zeit liefert die API HTTP 504 ohne Teilergebnisse. Mutationen, Subskriptionen, Fragmente, Direktiven und Introspektion werden abgelehnt.

<a id="verify-the-examples-locally"></a>
## Beispiele lokal prüfen

Führen Sie im Navigator-Quellverzeichnis die Prüfung mit der Python-Standardbibliothek aus. Verwenden Sie eine lokale Vorschau mit den öffentlichen POD-Beispieldatensätzen und aktivierter Recherchewerkbank. Die Prüfung kontrolliert den Referenzdownload, die Seitennavigation im Katalog, Datensatzexporte, eine vollständige Dispositionsauswahl, eine GraphQL-Antwort und die Ablehnung ungültiger Parameter und Datenstände.

```sh
python3 scripts/check_public_api_examples.py --base http://127.0.0.1:5280
```
