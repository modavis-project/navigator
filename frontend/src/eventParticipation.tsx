import { JsonEvidence } from "./JsonEvidence";
type ParticipationEvidence = {
  resolutionState?: unknown;
  pageUrl?: unknown;
  mdvsId?: unknown;
  sourceWording?: unknown;
  identityEvidence?: unknown;
  sourceNativeEvidence?: unknown;
};

export function eventSourcePresentation(event: { sourceOnly?: boolean; mappingKind?: string | null;
  type: { code?: string | null; mappingKind?: string | null }; retainedRepresentations?: Array<Record<string, unknown>> }) {
  const sourceOnly = event.sourceOnly === true || Boolean(event.type.code?.startsWith("source-only:"))
    || event.mappingKind === "source_only" || event.type.mappingKind === "source_only";
  const contextAssessment = sourceOnly && (event.retainedRepresentations ?? []).some((proof) => {
    if (proof.contract !== "modavis.source-quality-closure/v1" || !proof.assessment || typeof proof.assessment !== "object") return false;
    const status = "status" in proof.assessment ? proof.assessment.status : null;
    return status === "contextual_reference" || status === "conflicting_source_claims";
  });
  return { sourceOnly, contextAssessment };
}

export function ContextualEventSummary() {
  return <section><h3>Source statement</h3><p>The retained statement does not independently establish an event. Its context and any conflicting claims are preserved below.</p></section>;
}

export function ParticipantIdentityNote({ participant }: { participant: ParticipationEvidence }) {
  const state = participant.resolutionState;
  if (state === "unresolved_person_lifetime_conflict") return <> · identity unresolved: event date conflicts with the person’s recorded lifetime</>;
  if (state === "unresolved_native_actor_identifier") return <> · source builder identifier retained; canonical identity unresolved</>;
  if (state === "explicit_unknown") return <> · unidentified by source</>;
  if (state === "unknown_builder") return <> · builder unidentified by source</>;
  if (state === "unresolved_source_mention" || state === "ambiguous_accepted_actor_targets") {
    return <> · identity unresolved{participant.pageUrl && !participant.mdvsId ? " (link opens source evidence)" : ""}</>;
  }
  return null;
}

export function ParticipantSourceEvidence({ participant }: { participant: ParticipationEvidence }) {
  const native = participant.sourceNativeEvidence as { nativeBuilder?: { nativeId?: string; href?: string; name?: string }; sourceRecordId?: string; decision?: string; identityCorrespondence?: string; sourceGenerationNotes?: string[] } | undefined;
  if (native?.nativeBuilder) return <details className="participant-source-evidence"><summary>Source builder identity evidence</summary>
    <p>Source builder: <a href={native.nativeBuilder.href} target="_blank" rel="noreferrer">{native.nativeBuilder.name} · Orgbase {native.nativeBuilder.nativeId}</a>.</p>
    {native.decision === "resolved_source_native_builder_identifier" && <p>This participant is linked through the same retained builder catalogue identifier in verified source records with an accepted canonical target.</p>}
    {native.identityCorrespondence && <p>Several canonical identities refer to this source builder identifier. Their correspondence remains unresolved; no identity merge is asserted.</p>}
    {native.sourceGenerationNotes?.length ? <p>Retained generation qualifier: {native.sourceGenerationNotes.join("; ")}</p> : null}
    <ParticipantIdentityNote participant={participant}/>
    {native.sourceRecordId && <p><a href={"/source/"+encodeURIComponent(native.sourceRecordId)}>Inspect the source record</a></p>}
    <details><summary>Retained prior interpretation and evidence</summary><JsonEvidence value={native} label="Retained participant interpretation"/></details>
  </details>;
  const proof = participant.identityEvidence;
  if (!proof || typeof proof !== "object" || !("fieldBinding" in proof)) return null;
  const binding = proof.fieldBinding;
  if (!binding || typeof binding !== "object" || !("sourceRole" in binding) || !("dateExpression" in binding)) return null;
  const nativeAttribution = "contract" in proof && proof.contract === "modavis.indo-native-attribution/v1";
  const nativeLabel = "nativeFieldLabel" in binding && typeof binding.nativeFieldLabel === "string" ? binding.nativeFieldLabel : null;
  const nativeWording = "nativeFieldWording" in binding && typeof binding.nativeFieldWording === "string" ? binding.nativeFieldWording : null;
  const role = nativeAttribution && typeof binding.sourceRole === "string" ? binding.sourceRole
    : binding.sourceRole === "original_builder" ? "original builder" : binding.sourceRole === "builder" ? "builder" : null;
  if (!role || (!nativeAttribution && typeof binding.dateExpression !== "string")) return null;
  const dateExpression = typeof binding.dateExpression === "string" ? binding.dateExpression : "";
  const anchor = "acceptedNativeAnchor" in proof ? proof.acceptedNativeAnchor : null;
  const canonicalSource = anchor && typeof anchor === "object" && "canonicalSource" in anchor ? anchor.canonicalSource : null;
  const sourceId = canonicalSource && typeof canonicalSource === "object" && "sourceRecordId" in canonicalSource ? canonicalSource.sourceRecordId : null;
  const anchored = Boolean(participant.mdvsId) && anchor !== null && typeof anchor === "object"
    && "contract" in anchor && anchor.contract === "modavis.cross-source-native-actor-anchor/v1";
  return <details className="participant-source-evidence">
    <summary>Participation evidence</summary>
    {nativeAttribution ? <>
      <p>The source records this attribution in its <q>{nativeLabel || role}</q> field for the event <q>{role}</q>{dateExpression ? <> dated <strong>{dateExpression}</strong>.</> : <>. The source supplies no date wording.</>}</p>
      {nativeWording && <blockquote>{nativeWording}</blockquote>}
      {!participant.mdvsId && <p>Canonical identity remains unresolved.</p>}
    </> : <p>The source names this participant in its {role} field for <strong>{dateExpression}</strong>.</p>}
    {typeof participant.sourceWording === "string" && <p>Original wording: <q>{participant.sourceWording}</q></p>}
    {anchored && <p>Linked to the canonical organization using builder, year and opus evidence and an explicit link between the source records.
      {typeof sourceId === "string" && <> <a href={"/source/" + encodeURIComponent(sourceId)}>Inspect the matching source evidence</a>.</>}
    </p>}
    <p className="muted">This field establishes the recorded role in this event. Canonical identity is evaluated separately.</p>
  </details>;
}


type SourceOccurrence = {
  start: number;
  end: number;
  wording: string;
  contextStart: number;
  contextEnd: number;
  contextWording: string;
};

function sourceOccurrences(value: unknown): SourceOccurrence[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is SourceOccurrence => Boolean(item) && typeof item === "object"
    && typeof item.wording === "string" && typeof item.contextWording === "string"
    && Number.isInteger(item.start) && Number.isInteger(item.end)
    && Number.isInteger(item.contextStart) && Number.isInteger(item.contextEnd));
}

export function SourceOccurrenceEvidence({ representations }: { representations?: Array<Record<string, unknown>> }) {
  const proofs = (representations ?? []).filter((proof) => proof.contract === "modavis.source-fragment-occurrences/v1"
    && sourceOccurrences(proof.occurrences).length > 0);
  const assessments = (representations ?? []).filter((proof) => proof.contract === "modavis.source-quality-closure/v1"
    && proof.assessment && typeof proof.assessment === "object");
  if (!proofs.length && !assessments.length) return null;
  return <section className="event-source-panel" aria-label="Source wording in context">
    <h3>Source wording in context</h3>
    {assessments.map((proof, index) => {
      const assessment = proof.assessment as { status?: unknown; reason?: unknown };
      const conflicting = assessment.status === "conflicting_source_claims";
      const contextual = assessment.status === "contextual_reference";
      if (!conflicting && !contextual) return null;
      return <section key={typeof proof.representationId === "string" ? proof.representationId : index} aria-label="Source context assessment">
        <h4>{conflicting ? "Conflicting source statements" : "Contextual source reference"}</h4>
        <p>{conflicting ? "The conflicting source claims remain unresolved. An independently established event is not asserted here." : "The source provides context; it does not independently establish the previously interpreted event."}</p>
        {typeof assessment.reason === "string" && <p>{assessment.reason}</p>}
        {proof.eventCorrespondenceEstablished === false && <p>Correspondence with another event is not established.</p>}
        {Array.isArray(proof.contexts) && <details><summary>Source wording behind this assessment</summary>{proof.contexts.map((wording, contextIndex) => typeof wording === "string" ? <blockquote key={contextIndex} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{wording}</blockquote> : null)}</details>}
        <details><summary>Retained interpretation and assessment evidence</summary><JsonEvidence value={proof} label="Event assessment evidence"/></details>
      </section>;
    })}
    {proofs.map((proof, index) => {
      const occurrences = sourceOccurrences(proof.occurrences);
      const repeated = proof.status === "verified_multiple_fragment_occurrences" || occurrences.length > 1;
      return <div key={typeof proof.representationId === "string" ? proof.representationId : index}>
        {repeated ? <p>This wording occurs {occurrences.length} times in the retained source. Every occurrence is shown; none is selected as the unique event occurrence.</p>
          : <p>The retained wording has one verified occurrence in this source.</p>}
        {proof.fragmentTruncatedAtAbbreviation === true && <p>The earlier fragment ends at an abbreviation. Its surrounding source sentence is retained below.</p>}
        <p className="muted">These excerpts do not establish correspondence with another event or identify a participant.</p>
        {typeof proof.sourceRecordId === "string" && <p><a href={"/source/" + encodeURIComponent(proof.sourceRecordId)}>Inspect the retained source record</a></p>}
        <ol>
          {occurrences.map((occurrence, occurrenceIndex) => <li key={`${occurrence.start}-${occurrence.end}-${occurrenceIndex}`}>
            <p>Occurrence {occurrenceIndex + 1}</p>
            <blockquote style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{occurrence.contextWording}</blockquote>
            <details><summary>Exact fragment and source location</summary>
              <blockquote style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{occurrence.wording}</blockquote>
              {typeof proof.sourcePath === "string" && <p>Source field: <code>{proof.sourcePath}</code></p>}
              <p>Fragment characters {occurrence.start}–{occurrence.end}; context characters {occurrence.contextStart}–{occurrence.contextEnd}. Positions start at zero and exclude the ending position.</p>
            </details>
          </li>)}
        </ol>
      </div>;
    })}
  </section>;
}
