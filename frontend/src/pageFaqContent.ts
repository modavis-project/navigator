/** Public interpretation guidance. Keep record-specific qualifications beside the evidence. */
import type { UiText } from './uiLocale';

type GermanFaqItem = readonly [question: string, answer: string, linkLabel?: string];

const germanItems = {
 sources: [
  'Bestätigen mehrere Quellen eine Angabe unabhängig voneinander?',
  'Die Zahlen beziehen sich auf die erfassten Quelldatensätze oder Quellensammlungen. Sammlungen können Angaben übernehmen, und ihre Beschreibungen können voneinander abweichen. Prüfen Sie die Quellenverweise und vergleichen Sie die konkrete Angabe, ihre Datierung und das gemeinte Instrument, bevor Sie von einer unabhängigen Bestätigung ausgehen.',
 ],
 missing: [
  'Bedeutet eine fehlende Angabe, dass ein Merkmal nicht vorhanden war?',
  'Ein Detail kann in der Quelle fehlen, die Beschreibung kann unvollständig sein oder das Detail ist in dieser Datenversion noch nicht strukturiert erfasst. Ziehen Sie weitere Quellenbeschreibungen und die Originalquellen heran, bevor Sie aus einem leeren Feld Schlüsse ziehen.',
 ],
 dates: [
  'Beschreibt die „Erfasste Disposition“ den heutigen Zustand der Orgel?',
  'Die Bezeichnung verweist auf die Hauptbeschreibung der jeweiligen Quelle. Das Erfassungs- oder Revisionsdatum der Quelle allein reicht nicht aus, um den beschriebenen Instrumentenzustand zu datieren. Prüfen Sie die Angaben zur Datierung, historische Beschreibungen und verknüpfte Ereignisse, bevor Sie daraus auf den heutigen Zustand schließen.',
 ],
 identity: [
  'Warum sind manche Beteiligte oder Orgelbauer nicht verknüpft?',
  'Der Wortlaut der Quelle kann auch bei ungeklärter Identität erhalten bleiben. Ähnliche Namen, gemeinsam genannte Orgeln oder derselbe Familienname reichen für die Zuordnung zur selben Person oder Werkstatt nicht aus. Prüfen Sie die Quelle und gegebenenfalls die Hinweise zur Zuordnung. Auch ohne Warnhinweis kann eine Zuordnung noch unabhängig zu prüfen sein.',
 ],
 citation: [
  'Welchen Link sollte ich zitieren?',
  'Verwenden Sie, soweit vorhanden, den Zitiervorschlag oder den Identifikator des Datensatzes und geben Sie die Datensatzversion an. Bewahren Sie für ein gefiltertes Rechercheergebnis den an den Datenstand gebundenen Link und den zugehörigen Belegexport auf. Seitenadresse, kanonischer Identifikator und Link zur Quelle erfüllen unterschiedliche Zwecke.',
  'Datensatzversionen und Zitierhinweise',
 ],
 export: [
  'Enthält ein Belegexport nur die angezeigte Seite?',
  'Der vollständige Belegexport auf den Seiten zum Quellenwortlaut und in den Recherchewerkzeugen umfasst alle Treffer der gewählten Filter. Die Seiteneinteilung der Anzeige spielt dabei keine Rolle. Die Exportgrenzen stehen am jeweiligen Bedienelement. Überschreitet die Auswahl eine Grenze, wird der Export abgelehnt und nicht stillschweigend gekürzt. Gruppierte Diagrammexporte enthalten zusammengefasste Werte, Vorkommensexporte die zugrunde liegenden Zeilen.',
 ],
 'stop-matching': [
  'Warum kann ein bekanntes Register bei der exakten Suche fehlen?',
  'Auf der Vorkommensseite eines Ausdrucks berücksichtigt die exakte Suche Zahlen und Zusätze. Groß- und Kleinschreibung sowie mehrfache Leerzeichen spielen keine Rolle. Manche Quellen erfassen „Vox Humana 8“ als Namen, obwohl die Tonhöhe separat angegeben ist. Das ergibt keinen exakten Treffer für „Vox Humana“. Wählen Sie „Wortlaut mit dieser Zeichenfolge“, um weitere Treffer zu finden. Prüfen Sie die Treffer, denn darunter kann auch „Vox Humana Echo“ sein. Die Orgelsuche grenzt die aktuelle Treffermenge ein und erweitert den gesuchten Registerwortlaut nicht.',
  'Erfasste Benennungen mit „Vox Humana“ durchsuchen',
 ],
 'term-identity': [
  'Bezeichnen übereinstimmende Namen gleichartige Register oder Instrumente?',
  'Texttreffer bündeln den erfassten Wortlaut für die Suche. Sie belegen keine Übereinstimmung in Bauweise, Klang oder historischer Bedeutung und keine Identität des Bauteils. Berücksichtigen Sie Tonhöhe, Werk, Quellenbeschreibung und Zusätze wie „Echo“. Quellenwortlaut und vorgeschlagene Zuordnungen haben einen anderen Status als Begriffe eines kontrollierten Vokabulars.',
 ],
 'term-counts': [
  'Warum unterscheiden sich die Zahlen für Vorkommen, Quellenbeschreibungen und Orgeln?',
  'Ein Vorkommen ist ein einzelner erfasster Eintrag oder eine Ereignisangabe aus einer Quelle. Zu einer Orgel kann es mehrere Einträge und Quellenbeschreibungen geben. Bei Registern und Werken zeigen die Prozentwerte den Anteil passender Quellenbeschreibungen an allen Beschreibungen derselben Gruppe und Quellenauswahl, die Einträge des betreffenden Typs enthalten. Bei Tätigkeiten bilden dokumentierte Ereigniseinträge die Bezugsgröße. Die Bezugsgröße wird vor der Suche nach dem Ausdruck bestimmt. Quellenbeschreibungen und Orgeln können in mehreren Gruppen vorkommen. Gruppensummen lassen sich daher nicht immer addieren.',
 ],
 snapshots: [
  'Warum sind Recherchelinks so lang, und wie kann ich ein Ergebnis wiederholen?',
  'Der im Link festgehaltene Datenstand bestimmt die verwendeten öffentlichen Daten eindeutig. Bewahren Sie ihn zusammen mit Suchwort, Suchregel und Filtern sowie dem Beleg- oder Summenexport der verwendeten Ansicht auf. Ist der angegebene Datenstand nicht verfügbar, lässt sich die Auswahl mit den verfügbaren Daten nicht reproduzieren. Ohne die Angabe des Datenstands ändert sich die Datengrundlage der Abfrage.',
 ],
 events: [
  'Handelt es sich bei ähnlich formulierten Ereignisangaben um dasselbe Ereignis?',
  'Ein kontrollierter Tätigkeitstyp und der Originalwortlaut beschreiben ein Ereignis auf unterschiedlichen Ebenen. Eine Zuordnung erfordert Angaben zu Datum, Quelle, Beteiligten und Zusammenhang. Ähnliche oder undatierte Einträge können getrennt bleiben, wenn die Belege für eine Zusammenführung nicht ausreichen.',
 ],
 network: [
  'Belegt eine Verbindungslinie zwischen Orgelbauern eine Zusammenarbeit?',
  'Prüfen Sie den gewählten Beziehungstyp. Er kann dieselben Orgeln, eine gemeinsame Beteiligung an einem dokumentierten Ereignis oder frühere und spätere Arbeiten bezeichnen. Angaben zur selben Orgel belegen weder Zusammenarbeit, Anstellung oder Ausbildung noch eine Werkstattnachfolge. Prüfen Sie die zugrunde liegenden Ereignisse und Hinweise zur Zuordnung, bevor Sie eine historische Aussage treffen.',
 ],
 'network-counts': [
  'Warum zeigt das Diagramm weniger Verbindungen als die Gesamtzahl?',
  'Das Diagramm zeigt jeweils eine Seite der Verbindungen zur ausgewählten Person oder Organisation. Die zugehörige Tabelle mit Seitennavigation und der vollständige Netzwerkexport erschließen die gesamte Auswahl. Die Linienstärke gibt die angezeigte Anzahl wieder. Sie sagt nichts über die historische Bedeutung oder mögliche Beziehungen zwischen anderen Knoten aus.',
 ],
 comparison: [
  'Belegt eine Abweichung zwischen Quellenbeschreibungen eine Veränderung der Orgel?',
  'Ein fehlender Eintrag kann auf eine lückenhafte Dokumentation, eine andere Beschreibung oder eine ungeklärte Entsprechung zurückgehen. Vergleichen Sie zunächst Erfassungsumfang, Datierung, Quellenversionen, Werke und Tonhöhen. Ähnliche Registernamen allein belegen weder den Fortbestand noch den Einbau oder Ausbau eines Registers.',
 ],
 precision: [
  'Zeigt eine Kartenmarkierung den genauen Standort der Orgel?',
  'Prüfen Sie die Genauigkeit und Herkunft der Koordinaten. Ein ungefährer Ortspunkt kann bei der regionalen Suche helfen, ohne das Gebäude zu bestimmen. Die Ortsangabe der Quelle, die mit zusätzlichen Angaben erschlossene Ortsidentität und die Koordinatenangabe sind getrennte Belege.',
 ],
 media: [
  'Warum müssen manche Bilder bei der Quelle geöffnet werden?',
  'Viele Medieneinträge verweisen mit einem Herkunftsnachweis auf Dateien bei anderen Anbietern. Die Verfügbarkeit der Datei kann sich ändern. Verwenden Sie den Link zur Quelle und den Herkunftsnachweis am Bild. Ob ein Bild abrufbar ist und ob Sie es nachnutzen dürfen, sind getrennte Fragen.',
 ],
 vocabulary: [
  'Warum enthalten die Vokabularsammlungen unterschiedliche Arten von Einträgen?',
  'Kontrollierte Begriffe behalten ihre Definitionen und Identifikatoren aus dem POD. Terminologievorschläge haben eigene Bearbeitungsstände und Zuordnungsregeln. Der erfasste Quellenwortlaut gibt die Angaben der Anbieter wieder. Schemakategorien beschreiben das Datenmodell. Veröffentlichte Referenzen von MODAVIS, VAO und OMARO haben eigene Versionen und Rechte. Die Zahlen und Bedeutungen der Sammlungen sind getrennt zu betrachten.',
  'Vokabularübersicht öffnen',
 ],
 'vocab-links': [
  'Wie finde ich Datensätze zu einem bestimmten Begriff oder Ausdruck?',
  'Folgen Sie den Beleglinks des Begriffs oder wählen Sie ein Feld für den Quellenwortlaut, etwa Ereignisse, Register, Werke, Trakturen oder Windladen. Bei exakter und weiter gefasster Wortlautsuche gilt jeweils der angezeigte Suchumfang. Eine ähnliche Benennung in der Quelle kann ohne bestätigte Begriffszuordnung vorliegen. Null Treffer besagen, dass die Suche im gewählten Umfang keinen Treffer ergeben hat. Daraus lässt sich kein historisches Fehlen ableiten.',
 ],
 omaro: [
  'Klassifiziert OMARO die Orgeln im POD?',
  'OMARO ist ein eigenständiges Referenzvokabular mit Instrumentennamen, Klassifikationen und Aussagen. Seine Anzeige im Navigator weist den Orgeln im POD keine Klassifikationen zu. Zitieren Sie die angezeigte Begriffs-URI, die Sammlung und den Stand der Referenz.',
 ],
 'omaro-unresolved': [
  'Was bedeutet ein nicht aufgelöster Quellenverweis?',
  'Eine Quelle verweist auf eine Ressource, deren Definition oder Identität in diesem Stand der Referenz nicht geklärt ist. Der Verweis bleibt einsehbar. Eine Definition oder Gleichsetzung wird daraus nicht abgeleitet. Über die Auswahl des Anzeigeumfangs können Sie solche Verweise bei der Untersuchung der Abdeckung einbeziehen.',
 ],
 'wording-match': [
  'Was berücksichtigt die exakte Wortlautsuche?',
  'Die exakte Suche ignoriert Groß- und Kleinschreibung sowie mehrfache Leerzeichen. Zusätzliche Wörter, Zahlen und Satzzeichen bleiben relevant. Nutzen Sie die Suche nach enthaltenem Text für Varianten und prüfen Sie deren Originalwortlaut und Zusammenhang. Ähnlich formulierte Einträge können unterschiedliche Ereignisse oder Begriffe bezeichnen.',
 ],
 'reference-kinds': [
  'Sind Klassen und Eigenschaften eines Datenmodells Vokabularbegriffe?',
  'SKOS-Begriffe, Begriffsschemata, Modellklassen und Eigenschaften werden getrennt gezählt. Beziehungen wie Definitionsbereich, Wertebereich und Zugehörigkeit zu einem Begriffsschema bleiben als Aussagen der Quelle erhalten. Beim Durchsuchen dieser Aussagen werden den Orgeln im POD keine Klassen zugewiesen.',
 ],
 'reference-source': [
  'Warum fehlt eine Definition oder ein Begriffsschema?',
  'Die Ansicht gibt den veröffentlichten Graphen wieder. Fehlende Definitionen, Benennungen und Zuordnungen zu Begriffsschemata bleiben offen. Wird der lokale Teil einer URI als Überschrift verwendet, ist das ausdrücklich gekennzeichnet. Die Dokumentation der Quelle und die unveränderten RDF-Quelldaten bieten weiteren Kontext.',
 ],
 'reference-citation': [
  'Welche Version und welchen Download sollte ich zitieren?',
  'Halten Sie die Sammlungsversion, die Original-URI, die Angaben zur Urheberschaft, die Lizenz und die Prüfsumme der Turtle-Quelldatei fest. Diese Angaben finden Sie in den Details zur Abdeckung. Die Originaldistributionen bewahren die Quelldateien bytegenau. Die JSON-Ansicht stellt die vorhandenen Daten in aufbereiteter Form dar und veröffentlicht keine neue Vokabularversion.',
 ],
 'omaro-evidence': [
  'Belegen Aussagen der Quelle die Gleichwertigkeit von Begriffen?',
  'Prüfen Sie die Beziehung, ihre Quelle und den Stand der Referenz. Ein Name, die Zugehörigkeit zu einer Klassifikation und eine Aussage aus einer Quelle haben jeweils eine eigene Bedeutung. Daraus lässt sich keine weitergehende Identität oder Gleichwertigkeit ableiten. Definitionen werden angezeigt, soweit die Referenz sie enthält.',
 ],
 'regional-country': [
  'Stehen länderspezifische Muster für historische Traditionen?',
  'Die Ländergruppen beruhen auf den Ortsangaben der Quellen in diesem Datenstand. Daraus ergeben sich weder der historische Werkstattstandort noch der Bestimmungsort eines Auftrags oder eine repräsentative Stichprobe einer regionalen Tradition. Prüfen Sie die Abdeckung nach Quellen und die Belege für Ihre historische Deutung.',
 ],
 'coverage-sums': [
  'Kann ich die Gesamtzahlen der Sammlungen addieren?',
  'Sammlungen überschneiden sich, wenn mehrere Quellen dieselbe kanonisch erfasste Orgel beschreiben. Auch Merkmale überschneiden sich. Zu einer Orgel können Ereignisse, Dispositionen und Medien erfasst sein. Verwenden Sie die ausgewiesene Zahl eindeutig gezählter Orgeln. Addierte Quellen- oder Merkmalszahlen können dieselbe Orgel mehrfach enthalten.',
 ],
 'fire-current': [
  'Handelt es sich um eine aktuelle Bewertung der Brandlage oder der Schäden?',
  'Die Auswertung bezieht sich auf einen datierten Stand. Beachten Sie den Beobachtungsstichtag und die Version der Orgeldaten. Die Nähe zur erfassten Grenze eines Brandgebiets belegt weder Schäden oder Zerstörung noch eine aktuelle Gefährdung der Orgel.',
 ],
 'fire-missing': [
  'Liegen nicht angezeigte Orgeln zwangsläufig außerhalb des betroffenen Gebiets?',
  'Die Auswertung hängt von der angegebenen räumlichen Abdeckung und den dafür geeigneten Datensätzen mit Koordinaten ab. Fehlende oder ungenaue Ortsangaben können zum Ausschluss einer Orgel führen. Prüfen Sie die Ausschlüsse, bevor Sie das Fehlen einer Kartenmarkierung deuten.',
 ],
 'pipe-position': [
  'Entspricht eine funktionale Pfeifenposition einer erhaltenen Pfeife?',
  'Eine Position beschreibt eine Funktion innerhalb der dokumentierten Disposition. Sie belegt für sich genommen weder eine beobachtete noch eine erhaltene Pfeife. Prüfen Sie das Bauteil, den Quellenbeleg und einen gegebenenfalls angegebenen Bezug zu einem physischen Objekt.',
 ],
 'stop-totals': [
  'Warum kann die Gesamtzahl von den angezeigten Registerzeilen abweichen?',
  'Eine Gesamtzahl laut Quelle, eine detaillierte Disposition und die Anzahl erfasster Zeilen sind unterschiedliche Angaben. Abweichungen können auch durch alternative Dispositionen, zusammengesetzte oder wiederholte Einträge und unvollständige Registerlisten entstehen. Prüfen Sie die Bezeichnungen und die Quellenzuordnung. Aus einer leeren Registerliste lässt sich die Registerzahl nicht ableiten.',
 ],
 'media-subject': [
  'Zeigt ein Bild zwangsläufig die ausgewählte Disposition?',
  'Prüfen Sie Bildunterschrift, Quelle und eine gegebenenfalls angegebene Datierung. Ein mit einer Orgel oder einem Standort verknüpftes Bild kann einen früheren Zustand, eine andere Perspektive oder Material zum Umfeld zeigen. Die Verknüpfung allein datiert die sichtbaren technischen Details nicht.',
 ],
 rdf: [
  'Belegt gültiges RDF, dass jede Aussage historisch zutrifft?',
  'Die RDF-Validierung prüft Struktur und Identifikatoren. RDF kann auch unsichere, widersprüchliche oder unvollständig extrahierte Quellenaussagen wiedergeben. Prüfen Sie Herkunft, Einschränkungen der Quellenbeschreibung und Originalbelege, um die historische Richtigkeit zu beurteilen.',
 ],
 formats: [
  'Warum unterscheiden sich die Exportprofile?',
  'Die Profile stellen die Daten nach unterschiedlichen Schemata und Konventionen dar. Halten Sie die verwendete Datensatzversion und das gewählte Profil in Ihrer Auswertung fest. Eine andere Darstellung liefert für sich genommen keine zusätzlichen unabhängigen Belege.',
 ],
 'catalog-search': [
  'Warum fehlt eine Orgel in meinen Suchergebnissen?',
  'Prüfen Sie die aktiven Filter und den Suchumfang. Versuchen Sie anschließend eine andere Schreibweise aus den Quellen oder den MODAVIS-Identifikator. Quellenabdeckung und strukturierte Erfassung sind je nach Orgel unterschiedlich. Wenn Sie Orgeln anhand eines Registernamens suchen, nutzen Sie die Registerterminologie und prüfen Sie bei Bedarf auch weiter gefasste Wortlauttreffer.',
  'Erfasste Registernamen durchsuchen',
 ],
 'map-history': [
  'Zeigt eine Verbindungslinie den tatsächlich zurückgelegten historischen Weg?',
  'Die Linie verbindet die dokumentierten Ausgangs- und Zielorte einer Verlegung. Sie ist schematisch und rekonstruiert den zurückgelegten Weg nicht. Datierung, Quelle und Koordinatengenauigkeit sind für jeden Endpunkt gesondert zu beachten.',
 ],
 'actor-scope': [
  'Steht ein Namensdatensatz für eine Person?',
  'Eine Namensform, die Nennung eines Akteurs in einer Quelle und eine kanonisch erfasste Person oder Organisation sind unterschiedliche Datensätze. Die gekennzeichneten Beziehungen zeigen, welche Identität belegt ist. Ein Werkstattname kann einen anderen Tätigkeitsbereich oder Zeitraum abdecken als der Name eines einzelnen Orgelbauers.',
 ],
 'virtual-link': [
  'Belegt ein übereinstimmender Produkt- oder Domname die Zuordnung zu einer Orgel?',
  'Eine bestätigte Zuordnung setzt Belege voraus, die das wiedergegebene Instrument identifizieren. Produktname und Ort können insbesondere nach Umbauten oder bei mehreren Orgeln am selben Standort unzureichend sein. Ungeklärte Beziehungen bleiben ausdrücklich als solche gekennzeichnet.',
 ],
 'virtual-state': [
  'Belegt eine verknüpfte Orgel den Zustand zum Zeitpunkt der Aufnahmen?',
  'Die Beziehung identifiziert das wiedergegebene Instrument, soweit die Zuordnung belegt ist. Prüfen Sie die Beschreibung des Anbieters und die Angaben zur Konfiguration, um den aufgenommenen Zustand, das Aufnahmedatum und die Vollständigkeit zu beurteilen. Aus der Identität der Orgel allein ergeben sich diese Angaben nicht.',
 ],
 'virtual-filters': [
  'Warum ändern die Beziehungsfilter die Trefferliste?',
  'Der Filter für die Verknüpfung mit einem Orgeldatensatz wählt bestätigte Beziehungen zu Orgeln aus. Filter zur Bereitstellung beziehen sich auf das virtuelle Produkt und schränken die Suche unabhängig davon ein. Prüfen Sie alle aktiven Filter, bevor Sie eine leere Trefferliste deuten.',
 ],
 'literature-access': [
  'Enthält ein Literaturdatensatz ein lesbares Dokument?',
  'Ein bibliografischer Nachweis kann auch ohne zugängliches Digitalisat vorliegen. Folgen Sie den gekennzeichneten öffentlichen Leselinks, sofern vorhanden. Sie können eine externe Leseansicht oder ein Dokument öffnen. Der Zugriff beim Anbieter kann sich ändern. Aus der Zugänglichkeit ergeben sich keine Nachnutzungsrechte.',
 ],
 'literature-subject': [
  'Bestätigt eine verknüpfte Publikation alle Angaben zu dieser Orgel?',
  'Die Verknüpfung liefert Kontext für die Recherche. Prüfen Sie die einschlägige Passage, Ausgabe, Seitenzahl und Datierung, um zu bestimmen, welche Aussage die Publikation stützt. Der Literaturverweis allein belegt nicht alle Felder auf der Orgelseite.',
 ],
 'score-assets': [
  'Garantiert ein Notendatensatz, dass eine Ausgabe oder ein Digitalisat verfügbar ist?',
  'Der Datensatz beschreibt die im Katalog erfassten Belege. Folgen Sie den gekennzeichneten Links zum Lesen oder zu Dateien und prüfen Sie Quelle, Ausgabe und Zugangsbedingungen. Aus einem Metadatensatz allein ergibt sich kein Zugriff auf die vollständigen Noten.',
 ],
 'score-relation': [
  'Belegt die Verknüpfung mit einer Orgel den Aufführungsort eines Werks?',
  'Prüfen Sie die angegebene Beziehung und ihre Quelle. Besetzung, Widmung, Bezug zu einem Veranstaltungsort und eine dokumentierte Aufführung sind unterschiedliche Aussagen. Die Verknüpfung allein belegt weder eine bestimmte Aufführung noch eine bestimmte Orgelkonfiguration.',
 ],
 'tuning-name': [
  'Bezeichnen ähnliche Namen dasselbe Stimmungssystem?',
  'Namen und Schreibvarianten erleichtern die Suche. Prüfen Sie den erfassten Wortlaut und die Quellenangaben auf Abwandlungen oder Hinweise zur konkreten Ausführung. Eine übereinstimmende Benennung allein belegt weder identische Intervalle noch eine gemessene Stimmung.',
 ],
 'tuning-current': [
  'Belegt ein erfasstes Stimmungssystem die heutige Stimmung der Orgel?',
  'Die Angabe stammt aus einer Quelle und hat ihren eigenen Zusammenhang. Prüfen Sie die Datierung der Quelle sowie Belege zum Instrumentenzustand oder Messdaten, bevor Sie die Angabe als heutige Beobachtung behandeln.',
 ],
 'resource-scope': [
  'Warum hat diese Ressource einen eigenen Identifikator?',
  'Eine Orgel, eine Quellenbeschreibung und ein Bauteil können unterschiedliche Identifikatoren haben, weil sie unterschiedliche Gegenstände beschreiben. Prüfen Sie die Zuordnung, den Ressourcentyp und die Herkunft. Über die angebotenen Links gelangen Sie zur Orgel oder zur Quellenbeschreibung zurück. Aus der Ressourcenadresse allein folgt kein eigenständiges physisches Objekt.',
 ],
 'resource-validity': [
  'Bestätigt eine gültige semantische Darstellung die Aussage der Quelle?',
  'Die Validierung prüft die Struktur der Darstellung. Historische Richtigkeit, Unsicherheit und widersprüchliche Quellenbelege lassen sich nur anhand der zugrunde liegenden Aussage und ihrer Herkunft beurteilen. Wählen Sie beim Vergleich von Exporten die angegebene Datensatzversion und das entsprechende Profil.',
 ],
} as const satisfies Record<string, GermanFaqItem>;

const germanSets = {
 stops: 'Registerterminologie',
 'source-terms': 'Terminologie der Quellen',
 'published-vocabulary': 'Veröffentlichte Vokabularreferenzen',
 omaro: 'OMARO-Referenz',
 vocabulary: 'Vokabular und Quellenwortlaut',
 networks: 'Netzwerke von Orgelbauern und Werkstätten',
 workbench: 'Recherchewerkzeuge',
 'regional-stops': 'Forschung zu regionalen Registernamen',
 coverage: 'Abdeckung des Orgelkorpus',
 lifecycles: 'Dokumentierte Orgelgeschichte',
 fire: 'Historische Raumanalyse',
 research: 'Einstieg in die Recherche',
 'pipe-position': 'Belege zum Pfeifenwerk',
 specification: 'Dispositionen und Quellenbeschreibungen',
 'organ-history': 'Geschichte und Beteiligte',
 'organ-media': 'Medien und Quellenzugang',
 'organ-export': 'Identifikatoren und Exporte',
 organ: 'Orgeldatensätze',
 catalog: 'Orgelsuche',
 events: 'Ereignisse und Beteiligte',
 places: 'Orte und Karten',
 actors: 'Personen, Organisationen und Namen',
 'virtual-instruments': 'Virtuelle Instrumente',
 literature: 'Literatur und Leselinks',
 scores: 'Noten und zugehörige Dateien',
 temperaments: 'Stimmungssysteme',
 source: 'Quellenbelege',
 resources: 'Semantische Ressourcen und Belege',
 release: 'Datensatzumfang und Zitierhinweise',
} as const;

export type FaqItem = { id: keyof typeof germanItems; question: string; answer: string; link?: { href: string; label: string } };
export type FaqSet = { id: keyof typeof germanSets; label: string; items: FaqItem[] };
const item = (id: FaqItem['id'], question: string, answer: string, href?: string, label?: string): FaqItem => ({ id, question, answer, ...(href && label ? { link: { href, label } } : {}) });

export function localizePageFaq(content: FaqSet | null, t: UiText): FaqSet | null {
 if (!content) return null;
 return {
  ...content,
  label: t(`faq.context.${content.id}`, content.label, germanSets[content.id]),
  items: content.items.map(entry => {
   const german: GermanFaqItem = germanItems[entry.id];
   return {
    ...entry,
    question: t(`faq.${entry.id}.question`, entry.question, german[0]),
    answer: t(`faq.${entry.id}.answer`, entry.answer, german[1]),
    ...(entry.link && german[2] ? {
     link: { ...entry.link, label: t(`faq.${entry.id}.link`, entry.link.label, german[2]) },
    } : {}),
   };
  }),
 };
}
const source = item('sources', 'Do several sources mean independent confirmation?', 'Source counts describe retained source records or collections. Collections may reuse information, and their accounts can disagree. Open the source references and compare the particular claim, date and instrument before treating them as independent confirmation.');
const missing = item('missing', 'Does missing information mean a feature did not exist?', 'No. A source may omit a detail, the available account may be partial, or the detail may not yet be structured in this release. Check other source accounts and their original references before drawing a conclusion from an empty field.');
const dates = item('dates', 'Does “Current source listing” describe the organ today?', 'It identifies the source’s main account. A source capture or revision date does not establish the date of the instrument’s configuration. Check the account’s date qualification, historical descriptions and event links before treating it as a present-day state.');
const identity = item('identity', 'Why are some participants or builders unlinked?', 'The source wording can be retained without a sufficiently established canonical identity. Similar names, shared organs and family names alone do not establish that two mentions refer to the same person or workshop. Follow the source and any attribution notes; an absent warning is not proof that every attribution was independently verified.');
const citation = item('citation', 'Which link should I cite?', 'Use the record’s citation or identifier where available, and record the dataset version. For a filtered research result, keep the snapshot-bound link and its evidence download. A page URL, a canonical entity identifier and a source URL serve different purposes.', '/about/release', 'Dataset versions and citation');
const exportEvidence = item('export', 'Does an evidence download include just this page?', 'On source-term and research pages, the complete evidence download covers the selected filters, independently of display pagination. Export limits are stated beside the control; an oversized selection is rejected rather than silently truncated. Grouped chart downloads contain aggregates, while occurrence downloads contain the supporting rows.');
const stopMatch = item('stop-matching', 'Why can a known stop be missing from an exact search?', 'On a term’s usage page, exact wording ignores case and repeated spaces, but retains numbers and modifiers. Some sources store “Vox Humana 8” as the name even though pitch is also recorded separately, so it does not exactly match “Vox Humana”. Try “Wording containing this text” and check the results: it can also include “Vox Humana Echo”. The organ search narrows the current term selection; it does not broaden the stop wording.', '/vocab/usage/stops?q=Vox+Humana', 'Browse the recorded Vox Humana wordings');
const termIdentity = item('term-identity', 'Do matching names identify equivalent stops or instruments?', 'A text match groups recorded wording for discovery. It does not establish the same construction, sound, historical meaning or physical component. Keep pitch, division, source account and qualifiers such as “Echo” in view. A source wording or candidate mapping is not automatically a governed vocabulary concept.');
const counts = item('term-counts', 'Why do occurrences, accounts and organ counts differ?', 'An occurrence is one retained entry or event assertion. One organ can have several entries and several source accounts. For stops and divisions, percentages compare matching accounts with accounts containing recorded entries of that family in the same group and source scope. Activity charts use documented event records instead. The denominator is measured before term matching. Accounts and organs may appear in several groups, so group totals are not necessarily additive.');
const snapshots = item('snapshots', 'Why are research links long, and how do I repeat a result?', 'The snapshot identifies the exact public data used for the selection. Keep it together with the term, matching rule and filters, and save the evidence or aggregate export for the view you used. A snapshot mismatch means that selection cannot be reproduced on the available inputs; removing the snapshot changes the question’s data context.');
const eventMeaning = item('events', 'Are similarly worded events necessarily the same event?', 'No. A controlled activity type and the original source wording express different levels of description. Date, source, participants and context are needed to establish correspondence. Similar or undated entries may remain separate when the evidence does not justify reconciliation.');
const network = item('network', 'Does a line between builders prove collaboration?', 'Read the selected relationship: shared organs, joint participation in a documented event, or earlier/later work. Shared instruments do not establish collaboration, employment, apprenticeship or workshop succession. Inspect the supporting events and attribution notes before making a historical claim.');
const networkCount = item('network-counts', 'Why does the diagram show fewer connections than the total?', 'The diagram presents a page of connections around the selected actor. The accompanying table, pagination and complete network export provide the wider selection. Line weight represents the displayed count, not historical importance; links between other nodes are not implied.');
const compare = item('comparison', 'Does a difference between accounts establish a change to the organ?', 'A missing entry in one account may reflect incomplete documentation, a different description or an unresolved correspondence. Compare coverage, dates, source revisions, divisions and pitches first. Similar stop names do not by themselves prove physical continuity, addition or removal.');
const precision = item('precision', 'Does a map marker identify the exact organ location?', 'Check the coordinate precision and provenance. An approximate locality point can support regional discovery without identifying a venue. The source-listed place, an enriched place identity and a coordinate assertion are separate pieces of evidence.');
const media = item('media', 'Why must some images be loaded from their source?', 'Many media records are credited references hosted by another provider. A retained reference does not guarantee that the file is still available. Use the source link and credit shown with the image; image availability and permission to reuse it are separate questions.');
const vocab = item('vocabulary', 'Why do the vocabulary collections contain different kinds of terms?', 'Controlled concepts retain their POD definitions and identifiers. Candidate proposals keep their own lifecycle and matching rules. Source wording records what providers actually wrote, while schema categories describe the data model. Published MODAVIS, VAO and OMARO references keep their independent versions and rights. Their counts and meanings remain separate.', '/vocab', 'Open the vocabulary hub');
const vocabLinks = item('vocab-links', 'How do I find records using a particular term?', 'Follow the concept’s evidence links or choose a source-wording field, including events, stops, divisions, actions and windchests. Exact and broader wording searches retain their stated scope. A similar source label need not have an established concept mapping. A zero result means no match under the chosen scope, not that the term never occurred historically.');
const omaro = item('omaro', 'Does OMARO classify the organs in POD?', 'OMARO is a separate reference vocabulary of instrument names, classifications and assertions. Showing it in Navigator does not assign its classifications to POD organs. Use the concept URI, collection and reference snapshot shown on the page when citing it.');
const omaroUnresolved = item('omaro-unresolved', 'What does an unresolved source reference mean?', 'A source refers to a resource whose definition or identity is not established in this reference snapshot. The reference remains inspectable without an inferred definition or an invented equivalence. Use the record-scope control to include these references when investigating coverage.');
const set = (id: FaqSet['id'], label: string, ...items: FaqItem[]): FaqSet => ({ id, label, items });

export function pageFaq(pathname: string, organTab = 'overview'): FaqSet | null {
 const path = pathname.replace(/\/+$/, '') || '/';
 if (path === '/vocab/usage/stops') return set('stops', 'Stop terminology', stopMatch, termIdentity, counts, exportEvidence);
 if (/^\/vocab\/usage\/[a-z][a-z0-9_]*$/.test(path)) return set('source-terms', 'Source terminology', item('wording-match', 'What does exact wording match?', 'Exact lookup ignores case and repeated spaces. Additional words, numbers and punctuation remain significant. Use the broader containing-text option to find variants, then inspect their original wording and context; similar wording is not automatically the same event or concept.'), counts, vocabLinks, snapshots);
 if (path === '/vocab/reference') return set('published-vocabulary', 'Published vocabulary references', item('reference-kinds', 'Are model classes and properties vocabulary concepts?', 'SKOS concepts, schemes, model classes and properties are counted separately. Relationships such as domain, range or scheme membership are retained source statements; browsing them does not classify a POD organ.'), item('reference-source', 'Why is a definition or scheme missing?', 'The reader preserves the published graph. Missing definitions, labels and scheme membership remain unrecorded; a URI local name is explicitly marked when used as a heading. Source documentation and exact RDF evidence are available for further context.'), item('reference-citation', 'Which version and download should I cite?', 'Keep the collection version, original source URI, attribution, license and source Turtle checksum shown in the coverage disclosure. Original distributions retain their source bytes; the JSON reading view is a projection, not a new vocabulary release.'));
 if (path === '/vocab/omaro') return set('omaro', 'OMARO reference', omaro, omaroUnresolved, item('omaro-evidence', 'Do source assertions establish equivalence between concepts?', 'Inspect the relation, source and reference snapshot. A name, classification membership or source assertion has its own meaning and should not be treated as a stronger identity or equivalence claim. Definitions are available only where supplied in the reference evidence.'));
 if (path === '/vocab' || /^\/vocab\/[^/]+(?:\/[^/]+(?:\/[^/]+)?)?$/.test(path)) return set('vocabulary', 'Vocabulary and source wording', vocab, vocabLinks, citation);
 if (path === '/use-cases/builder-workshop-networks') return set('networks', 'Builder and workshop networks', network, networkCount, identity, source);
 if (path === '/use-cases/research-workbench') return set('workbench', 'Research workbench', compare, identity, exportEvidence, snapshots);
 if (path === '/use-cases/regional-organ-stop-names') return set('regional-stops', 'Regional stop-name research', termIdentity, item('regional-country', 'Do country patterns represent historical traditions?', 'The country groups describe source-listed locations in this data snapshot. They do not establish a historical workshop location, a commission’s destination or a representative sample of a regional tradition. Check coverage by source and the evidence for any historical interpretation.'), missing, snapshots);
 if (path === '/use-cases/organ-corpus-coverage') return set('coverage', 'Corpus coverage', source, missing, item('coverage-sums', 'Can I add the collection totals?', 'Collection memberships overlap when several sources describe the same canonical organ. Features also overlap: one organ may have events, specifications and media. Use the explicitly labelled distinct-organ total rather than adding source or feature counts.'));
 if (path === '/use-cases/documented-organ-lifecycles') return set('lifecycles', 'Documented histories', dates, eventMeaning, source);
 if (path === '/use-cases/dalmatia-pipe-organs-fire-vulnerability') return set('fire', 'Historical spatial analysis', item('fire-current', 'Is this a current fire or damage assessment?', 'No. This is a dated analytical snapshot. Read its observation cutoff and organ-data version. Proximity to an observed fire perimeter does not establish damage, destruction or current risk at an organ.'), precision, item('fire-missing', 'Are unshown organs necessarily outside the affected area?', 'The analysis depends on its stated spatial coverage and eligible coordinate-backed records. Missing or approximate locations can prevent an organ from entering the analysis. Review those exclusions before interpreting an absent point.'));
 if (path === '/use-cases') return set('research', 'Research starting points', source, missing, snapshots);
 if (/^\/organs\/[^/]+\/components\/[^/]+\/pipe-positions\/[^/]+$/.test(path)) return set('pipe-position', 'Pipework evidence', item('pipe-position', 'Is a functional pipe position a surviving physical pipe?', 'A position describes a function within the documented specification. It does not by itself establish an observed or surviving pipe. Inspect the component, source evidence and any stated physical-object link.'), compare, citation);
 if (/^\/organs\/[^/]+$/.test(path)) {
  if (organTab === 'specification') return set('specification', 'Specifications and source accounts', dates, item('stop-totals', 'Why can totals differ from the displayed stop rows?', 'A source-reported total, a detailed account and a count of delivered rows are different measures. Alternative configurations, compound or repeated entries and partial stoplists can also differ. Read the labels and source attribution; an empty stoplist does not mean zero stops.'), compare, stopMatch);
  if (['history','activities'].includes(organTab)) return set('organ-history', 'History and participants', dates, eventMeaning, identity);
  if (organTab === 'media') return set('organ-media', 'Media and source access', media, item('media-subject', 'Does an image necessarily show the selected configuration?', 'Check its caption, source and any date. An image linked to an organ or venue may show an earlier configuration, another viewpoint or contextual material. The association alone does not date the technical details visible in it.'), citation);
  if (['export','identifiers'].includes(organTab)) return set('organ-export', 'Identifiers and exports', citation, item('rdf', 'Does valid RDF establish that every claim is historically correct?', 'RDF validation checks structure and identifiers. It can faithfully preserve uncertain, conflicting or imperfectly extracted source claims. Consult provenance, account qualifications and the original evidence when assessing historical accuracy.'), item('formats', 'Why do export profiles look different?', 'Profiles express the data using different schemas and conventions. Keep the selected dataset version and profile with your analysis. A change in representation does not itself provide additional independent evidence.'));
  return set('organ', 'Organ records', dates, missing, source, citation);
 }
 if (path === '/organs' || path === '/' || path === '/explore') return set('catalog', 'Finding organs', item('catalog-search', 'Why might an organ be missing from my results?', 'Check the active filters and search scope, then try another source spelling or the MODAVIS identifier. Source coverage and structured fields are uneven. To find organs by a stop name, use the stop terminology browser and inspect broader wording matches where needed.', '/vocab/usage/stops', 'Search recorded stop names'), source, missing);
 if (/^\/events(?:\/[^/]+)?$/.test(path)) return set('events', 'Events and participants', eventMeaning, identity, dates);
 if (path === '/map' || /^\/places(?:\/[^/]+)?$/.test(path) || /^\/entity\/places\/[^/]+$/.test(path)) return set('places', 'Places and maps', precision, item('map-history', 'Does a connecting line show an actual historical route?', 'A relocation connector relates documented endpoints. It is schematic and does not reconstruct a travelled route. The date, source and coordinate precision of each endpoint remain relevant.'), missing);
 if (/^\/(persons|people|organizations|actors|names)(?:\/[^/]+)?$/.test(path) || /^\/entity\/(people|organizations|institutions|buildings|source-actors)\/[^/]+$/.test(path)) return set('actors', 'People, organizations and names', identity, item('actor-scope', 'Does a name record represent a person?', 'A name, a source-specific actor mention and a canonical person or organization are different records. Follow the labelled relationships to see which identity is established. A workshop name may cover a different scope or period from an individual builder.'), network);
 if (/^\/virtual-instruments(?:\/[^/]+)?$/.test(path)) return set('virtual-instruments', 'Virtual instruments', item('virtual-link', 'Does a matching product or cathedral name prove an organ link?', 'No. An accepted link needs evidence identifying the represented instrument. Product name and town alone can be insufficient, especially after rebuilds or when several organs share a venue. Unresolved relationships remain explicitly qualified.'), item('virtual-state', 'Does a linked organ prove the sampled configuration?', 'The relationship identifies the represented organ where established. Check the provider’s description and configuration evidence for the sampled state, recording date and completeness. These do not follow automatically from the organ identity.'), item('virtual-filters', 'Why do the relationship filters change the results?', '“Linked to an organ record” selects accepted organ relationships. Distribution-related filters describe the virtual product and are a separate constraint. Review all active filters before interpreting an empty result.'));
 if (/^\/literature(?:\/[^/]+)?$/.test(path)) return set('literature', 'Literature and reading links', item('literature-access', 'Does a bibliographic record include a readable document?', 'A citation can be present without an accessible scan. Use the labelled public reading links where supplied; they may open an external viewer or document. Access can change at the source, and it does not itself establish reuse permission.'), item('literature-subject', 'Does a linked publication confirm every detail of this organ?', 'The relation supplies research context. Inspect the relevant passage, edition, page and date to determine which claim it supports. A publication reference alone is not evidence for every field on an organ page.'), citation);
 if (/^\/scores(?:\/[^/]+(?:\/assets\/[^/]+)?)?$/.test(path)) return set('scores', 'Scores and score assets', item('score-assets', 'Does a score record guarantee that an edition or scan is available?', 'The record describes the available catalogued evidence. Follow labelled reading or asset links and check the source, edition and access conditions; a metadata record alone does not establish access to the complete score.'), item('score-relation', 'Does an organ association prove where a work was performed?', 'Read the stated relationship and its source. Instrumentation, a dedication, a venue association and a documented performance are different claims. An association alone does not establish a particular performance or organ configuration.'), citation);
 if (/^\/temperaments(?:\/[^/]+)?$/.test(path)) return set('temperaments', 'Tuning systems', item('tuning-name', 'Do similar temperament names establish the same tuning?', 'Names and spelling variants support discovery. Check the retained wording and source details for modifications or a particular implementation. A label match alone does not establish identical intervals or a measured tuning.'), item('tuning-current', 'Does a recorded temperament establish the organ’s tuning today?', 'It is a source claim with its own context. Check the source date and any configuration or measurement evidence before treating it as a current observation.'), citation);
 if (/^\/source\/[^/]+$/.test(path)) return set('source', 'Source evidence', source, missing, citation);
 if (path === '/resources') return set('resources', 'Semantic resources and evidence', citation, item('resource-scope', 'Why does this resource have its own identifier?', 'An organ, a source account and a component can have different identifiers because they represent different subjects. Read the owner, resource type and provenance, then use the supplied links to return to the organ or account. A resource URL does not by itself establish a separate physical object.'), item('resource-validity', 'Does a valid semantic representation verify the source claim?', 'It verifies the representation’s structure. Historical accuracy, uncertainty and conflicting source evidence still require examination of the underlying claim and provenance. Select the stated dataset version and profile when comparing exports.'));
 if (path === '/about/release') return set('release', 'Dataset scope and citation', citation, source, missing);
 return null;
}
