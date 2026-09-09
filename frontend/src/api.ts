export type ViewMode = "surface" | "depth";

export interface Release11Summary {
  available: boolean;
  status: string;
  candidate?: {
    contractVersion: string;
    createdAt: string;
    manifestSha256: string;
    sourceFingerprint: string;
  };
  assertions?: {
    total: number;
    byFamily: Record<string, number>;
    sourceRecords: number;
  };
  links?: {
    total: number;
    selected: number;
    unresolved: number;
    byKindAndOutcome: Record<string, Record<string, number>>;
    multiplySupportedTargets: number;
    conflictingSubjects: number;
  };
  policy?: {
    uncertainEvidenceRemainsVisible: boolean;
    underqualifiedActorExactAliasCanonicalLinksWithheld: boolean;
    publicationState: string;
  };
}

export interface Release11EvidenceResponse {
  available: boolean;
  assertions: Array<{
    requestId: string;
    sourceRecordId: string;
    source: string;
    family: string;
    evidence: string;
    language?: string | null;
    normalizedValue: Record<string, unknown>;
  }>;
  links: Array<{
    packetId: string;
    sourceRecordId: string;
    source: string;
    kind: string;
    relationRole: string;
    retrievalBand: string;
    outcome: "selected" | "abstain";
    selectedCandidateId?: string | null;
    targetUrl?: string | null;
    reasonCode: string;
    evidence: Record<string, unknown>;
    supportingSourceCount: number;
    conflictingTargetCount: number;
  }>;
  counts: { assertions: number; links: number };
  limit: number;
  offset: number;
}

export interface SourceRecordSummary {
  id: string;
  title: string;
  recordLabel?: string | null;
  summary?: string | null;
  source: { id: string; name: string; url?: string | null };
  type: string;
  status: string;
  schema: { key?: string | null; version?: string | null; hash?: string | null };
  primaryIdentifier: { scheme?: string | null; value?: string | null };
  counts: { documents: number; media: number; entityRefs: number; events: number };
  technicalSupportCounts?: {
    attachedDocuments: number;
    mediaReferences: number;
    extractorReferences: number;
    processingEvents: number;
  };
  supportSummary?: {
    entityCount: number;
    historicalEventCount: number;
    relatedEntityCount: number;
  };
  evidenceRole?: { label: string; summary: string };
  supportedEntities?: SourceSupportedEntity[];
  lastSeenAt?: string | null;
  publicAtAGlance?: PublicAtAGlanceItem[];
  trustSignals?: TrustSignal[];
  publicNotes?: string[];
}

export interface SourceSupportedEntity {
  id?: string | null;
  mdvsId?: string | null;
  kind: string;
  kindLabel?: string | null;
  title: string;
  summary?: string | null;
  pageUrl?: string | null;
  catalogUrl?: string | null;
  apiUrl?: string | null;
  facts?: Array<{ label: string; value: string | number }>;
  specification?: {
    manuals?: string | number | null;
    divisions?: string | number | null;
    stops?: string | number | null;
    ranks?: string | number | null;
    manualSummary?: string | number | null;
  };
  counts?: {
    historicalEvents?: number;
    relatedEntities?: number;
    media?: number;
  };
}

export interface EvidencePreview {
  documents: Array<{
    id?: string | null;
    title: string;
    kind?: string | null;
    contentType?: string | null;
    url?: string | null;
    sizeBytes?: number | null;
    retrievedAt?: string | null;
  }>;
  media: Array<{
    id?: string | null;
    title: string;
    kind?: string | null;
    url?: string | null;
    fileName?: string | null;
    status?: string | null;
    thumbnailUrl?: string | null;
    hasByteBridge?: boolean;
  }>;
}

export interface SourceRecordDetail extends SourceRecordSummary {
  evidencePreview?: EvidencePreview;
  normalizedDossiers?: Array<{
    id?: string | null;
    title?: string | null;
    summary?: string | null;
    status?: string | null;
    reviewState?: string | null;
    primaryKind?: string | null;
    startedAt?: string | null;
    endedAt?: string | null;
    candidateCounts?: {
      entities?: number;
      assertions?: number;
      relations?: number;
      matches?: number;
    };
  }>;
  raw?: Record<string, unknown>;
  documents?: Record<string, unknown>[];
  documentItems?: Record<string, unknown>[];
  documentJobs?: Record<string, unknown>[];
  documentEvents?: Record<string, unknown>[];
  media?: Record<string, unknown>[];
  mediaBridge?: Record<string, unknown>;
  entityRefs?: Record<string, unknown>[];
  events?: Record<string, unknown>[];
  schemaContract?: Record<string, unknown> | null;
  normalizerSessions?: Record<string, unknown>[];
}

export interface FileEvidenceDetail {
  id: string;
  title: string;
  summary?: string | null;
  owner: string;
  status: string;
  sourceRecordIds: string[];
  sourceRecords: SourceRecordSummary[];
  file: {
    id: string;
    filename?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    checksum?: string | null;
    byteState: string;
    storageOwner: string;
    mediaFileId?: string | null;
    bitstreamId?: string | null;
    accessLocations: string[];
  };
  counts: {
    documents: number;
    documentItems: number;
    media: number;
    processingJobs: number;
    processingEvents: number;
    sourceRecords: number;
  };
  documents: Record<string, unknown>[];
  documentItems: Record<string, unknown>[];
  media: Record<string, unknown>[];
  processingHistory: Record<string, unknown>[];
  paradataEvents: Record<string, unknown>[];
  raw?: Record<string, unknown>;
}

export interface FileEvidenceSummary {
  id: string;
  title: string;
  kind: string;
  kindLabel?: string | null;
  status: string;
  byteState?: string | null;
  mimeType?: string | null;
  checksum?: string | null;
  sizeBytes?: number | null;
  accessUrl?: string | null;
  sourceRecordId?: string | null;
  sourceLabel?: string | null;
  sourceStatus?: string | null;
  sourcePrimaryId?: string | null;
  filePageUrl?: string | null;
  sourcePageUrl?: string | null;
  depthAvailable?: boolean;
}

export interface FileEvidenceList {
  mode: ViewMode;
  items: FileEvidenceSummary[];
  total: number;
  limit: number;
  offset: number;
  facets: {
    kinds: Array<{ kind: string; label: string; count: number }>;
  };
}

export interface SourceRecordList {
  mode: ViewMode;
  items: SourceRecordSummary[];
  total: number;
  limit: number;
  offset: number;
  facets: {
    schemas: Array<{ schema_key: string | null; schema_version: string | null; count: number }>;
    statuses: Array<{ current_status: string; count: number }>;
  };
}

export interface DigitalScoreSummary {
  scoreId: string;
  sourceRecordId: string;
  title: string;
  normalizedTitle?: string | null;
  composer?: string | null;
  catalogNumber?: string | null;
  instrumentation?: string | null;
  workKey?: string | null;
  collection: { key?: string | null; displayName?: string | null };
  license: { name?: string | null; url?: string | null };
  sourceUrl?: string | null;
  retrievedAt?: string | null;
  formats: string[];
  flags: {
    hasMusicxml: boolean;
    hasMidi: boolean;
    hasPdf: boolean;
    hasLilypond: boolean;
    hasArchive: boolean;
    hasSymbolicScore: boolean;
  };
  assetCounts: { total: number; downloaded: number; failed: number; blocked: number };
  credentialRequired: boolean;
  assetHealth: string;
  qualityWarnings: string[];
  evidence?: { strength: string; label: string; description: string };
  evidenceStrength?: string | null;
  evidenceBasis?: string | null;
  ambitusStatus: string;
  ambitusProjectionReady: boolean;
  ambitus: AmbitusAnalysis;
  schema: { key?: string | null; version?: string | null; artifactUri?: string | null };
  sourceRecordStatus: string;
  lastSeenAt?: string | null;
  urls?: { score?: string; source?: string; api?: string };
  depthAvailable?: boolean;
}

export interface AmbitusPartRange {
  partKey: string;
  partName: string;
  partIndex: number;
  soundingMinMidi: number;
  soundingMaxMidi: number;
  soundingMinPitch: string;
  soundingMaxPitch: string;
  writtenMinMidi: number;
  writtenMaxMidi: number;
  writtenMinPitch: string;
  writtenMaxPitch: string;
  noteCount: number;
  staffKeys: string[];
  channels: number[];
  assignment: "manual" | "pedal" | "unknown" | string;
  assignmentConfidence?: number | null;
  metadata: Record<string, unknown>;
}

export interface AmbitusAnalysis {
  status: string;
  analysisId?: string | null;
  assetId?: string | null;
  assetFormat?: string | null;
  inputSha256?: string | null;
  computedAt?: string | null;
  pitchBasis?: string | null;
  globalMinMidi?: number | null;
  globalMaxMidi?: number | null;
  globalMinPitch?: string | null;
  globalMaxPitch?: string | null;
  spanSemitones?: number | null;
  noteCount: number;
  parts: AmbitusPartRange[];
  warnings: string[];
  errors: string[];
  metadata: Record<string, unknown>;
  projectionReady: boolean;
}

export interface DigitalScoreAsset {
  assetId: string;
  scoreId: string;
  sourceRecordId: string;
  format?: string | null;
  role?: string | null;
  label?: string | null;
  fileName?: string | null;
  contentType?: string | null;
  downloadStatus?: string | null;
  downloadError?: string | null;
  contentSha256?: string | null;
  contentSizeBytes?: number | null;
  url?: string | null;
  normalizedUrl?: string | null;
  resolvedUrl?: string | null;
  downloadedPath?: string | null;
  localPath?: string | null;
  alternateUrls?: unknown[];
  sourceFileId?: string | null;
  archiveUrl?: string | null;
  archiveMemberPath?: string | null;
  position: number;
  urls?: { asset?: string; api?: string; midi?: string | null };
  depthAvailable?: boolean;
}

export interface DigitalScoreDetail extends DigitalScoreSummary {
  evidenceLabel: string;
  assets: DigitalScoreAsset[];
  collectionDetails?: {
    key: string;
    name: string;
    description: string;
    homepageUrl: string;
    scoreCount: number;
    evidenceNote: string;
    licenseNote: string;
  } | null;
  relatedEditions?: DigitalScoreSummary[];
  sections: {
    overview: Record<string, unknown>;
    projection: {
      enabled: boolean;
      status: string;
      ambitusProjectionReady: boolean;
      message: string;
    };
    ambitus: AmbitusAnalysis;
    midi: DigitalScoreAsset[];
  };
  raw?: Record<string, unknown>;
}

export interface DigitalScoreAssetDetail extends DigitalScoreAsset {
  parentScore: {
    scoreId: string;
    title?: string | null;
    composer?: string | null;
    collection?: { key?: string | null; displayName?: string | null };
    assetHealth?: string | null;
    ambitusStatus?: string | null;
    url?: string | null;
  };
  raw?: Record<string, unknown>;
}

export interface MidiAssetDetail extends DigitalScoreAssetDetail {
  midiSummary: {
    status: string;
    duration?: string | null;
    tempoMap: unknown[];
    trackCount?: number | null;
    channelCount?: number | null;
    trackNames: string[];
    channelLabels: string[];
    noteCount?: number | null;
    globalPitchRange?: string | null;
    manualPedalClassification?: string | null;
    warnings: string[];
  };
}

export interface DigitalScoreReadModelStatus {
  ok?: boolean;
  available?: boolean;
  table?: string;
  assetTable?: string;
  rowCount: number;
  assetRowCount?: number;
  sourceRecordCount?: number;
  schemaContractAvailable?: boolean;
  freshnessState?: string;
  staleReasons?: string[];
  isFresh?: boolean;
  guidance?: string;
  insertedRows?: number;
  insertedAssetRows?: number;
  durationMs?: number;
}

export interface DigitalScoreList {
  mode: ViewMode;
  items: DigitalScoreSummary[];
  total: number;
  limit: number;
  offset: number;
  facets: {
    collections: Array<{ collection_key: string; collection_display_name: string; count: number }>;
    formats: Array<{ format: string; count: number }>;
    assetHealth: Array<{ asset_health: string; count: number }>;
    ambitus: Array<{ ambitus_status: string; count: number }>;
    evidence?: Array<{ evidence_strength: string; count: number }>;
    analysis?: Array<{ analysis_status: string; count: number }>;
    licenses: Array<{ license_name: string; count: number }>;
  };
  readModel?: DigitalScoreReadModelStatus;
}

export interface LiteratureSummary {
  canonicalUrl?: string;
  identifierUri?: string;
  packetId?: string | null;
  candidatePublicationId?: string | null;
  title: string;
  publicationYear?: number | null;
  publicationType?: string | null;
  language?: string | null;
  venue?: string | null;
  volume?: string | null;
  issue?: string | null;
  publisher?: string | null;
  pages?: string | null;
  sourceUrl?: string | null;
  authors: string[];
  externalIds: Record<string, string>;
  reviewFlags: string[];
  parserStatus: string;
  sourceRecordId?: string | null;
  literatureId: string;
  source: { key?: string | null; name?: string | null };
  reviewStatus: string;
  identifierSchemes: string[];
  url?: string | null;
  collection?: { key?: string | null; name?: string | null; fullName?: string | null } | null;
  containerType?: string | null;
  place?: string | null;
  classificationConfidence?: string | null;
  digitized?: boolean;
  iiifManifestUrl?: string | null;
  publicAccessLinks?: Array<{ url: string; label: string; kind: string; provider?: string | null; verifiedAt: string; access: string }>;
  mdvsId?: string | null;
  publicProjection?: boolean;
  depthAvailable?: boolean;
}

export interface LiteratureDetail extends LiteratureSummary {
  mode?: ViewMode;
  citationText?: string | null;
  publicationDetails?: string | null;
  notes?: string | null;
  rawHtml?: string | null;
  normalizerLineage?: {
    packetFormat?: string | null;
    packetId?: string | null;
    candidatePublicationId?: string | null;
    sourceRecordId?: string | null;
    literatureId?: string | null;
    canonicalWritesAllowed?: boolean;
    requiresReview?: boolean;
    publicProjection?: boolean;
  };
  parserEvidence?: Record<string, unknown>;
  structuringLineage?: Record<string, unknown>;
  gdoEvidence?: Record<string, unknown>;
  packet?: Record<string, unknown>;
  classificationMethod?: string | null;
  container?: {
    type?: string | null;
    title?: string | null;
    volume?: string | null;
    issue?: string | null;
    place?: string | null;
    publisherOrInstitution?: string | null;
    editor?: string | null;
    citation?: string | null;
  };
  relatedContainers?: Array<{
    type?: string | null;
    title?: string | null;
    volume?: string | null;
    issue?: string | null;
    year?: number | null;
  }>;
  locator?: {
    type?: string | null;
    manifestUrl?: string | null;
    startPage?: string | null;
    endPage?: string | null;
    canvasStart?: number | null;
    canvasEnd?: number | null;
    basis?: string | null;
    exclusionReason?: string | null;
  };
  provenance?: Record<string, unknown>;
}

export interface LiteratureFacets {
  years: Array<{ year: string; count: number }>;
  publicationTypes: Array<{ publicationType: string; count: number }>;
  authors: Array<{ author: string; count: number }>;
  venues: Array<{ venue: string; count: number }>;
  reviewFlags: Array<{ reviewFlag: string; count: number }>;
  parserStatuses: Array<{ parserStatus: string; count: number }>;
  sources: Array<{ source: string; count: number }>;
  identifierSchemes: Array<{ scheme: string; count: number }>;
  collections?: Array<{ collection: string; name: string; fullName?: string | null; count: number }>;
  containerTypes?: Array<{ containerType: string; count: number }>;
  confidences?: Array<{ confidence: string; count: number }>;
  yearRange?: { minimum?: number | null; maximum?: number | null };
  digitized?: { available: number; unavailable: number };
}

export interface LiteratureList {
  mode: ViewMode;
  items: LiteratureSummary[];
  total: number;
  limit: number;
  offset: number;
  sort: string;
  query: string;
  filters: Record<string, unknown>;
  facets: LiteratureFacets;
  source?: {
    module?: string;
    jobType?: string;
    cached?: boolean;
    cacheTtlSeconds?: number;
    rowCount?: number;
  };
}

export interface LiteratureStatus {
  status?: string;
  parser_required?: boolean;
  fallback_packet_generation?: boolean;
  structuring_backend?: string;
  primary_structuring_backend?: string;
  external_parser?: string;
  slm_gateway?: Record<string, unknown>;
  gateway_contract?: Record<string, unknown>;
  grobid?: Record<string, unknown>;
  schemaVersion?: string;
  collections?: Array<{
    key: string;
    name: string;
    fullName?: string | null;
    description?: string | null;
    homepageUrl?: string | null;
    publicationCount: number;
    yearMin?: number | null;
    yearMax?: number | null;
    digitizedCount: number;
    normalizationProfile?: string | null;
    sourceArtifactSha256?: string | null;
    importedAt?: string | null;
  }>;
}

export interface IconographySummary {
  id: string;
  sourceRecordId?: string | null;
  source: string;
  sourceName?: string | null;
  modality: "iconography";
  recordType: string;
  ridimId?: string | null;
  title: string;
  creator?: string | null;
  creators: string[];
  dateLabel?: string | null;
  dateStart?: number | null;
  dateEnd?: number | null;
  century?: string | null;
  objectType?: string | null;
  category?: string | null;
  description?: string | null;
  holding: {
    collection?: string | null;
    itemLocation?: string | null;
    department?: string | null;
    objectNumber?: string | null;
    ridimSiglum?: string | null;
  };
  artwork: {
    dimensions?: string | null;
    materials: string[];
    technique: string[];
    sourceUrl?: string | null;
  };
  iconography: {
    instruments: string[];
    normalizedInstrumentTerms: string[];
    organIconographyType: string;
    hasOrganTerm: boolean;
    subjects: string[];
    iconclass: string[];
  };
  media: {
    thumbnailUrl?: string | null;
    hasImage: boolean;
    imageCount: number;
    images?: Record<string, unknown>[];
  };
  links: {
    sourceRecord?: string | null;
    canonicalRecord?: string | null;
  };
  match: {
    organEntityCandidateCount: number;
    bestConfidence?: number | string | null;
    status?: string | null;
  };
  status: string;
  schema: { key?: string | null; version?: string | null };
  counts: { documents: number; media: number; entityRefs: number; events: number };
  lastSeenAt?: string | null;
  sourceMetadata?: {
    recordId?: string | null;
    lastUpdate?: string | null;
    retrievedAt?: string | null;
    schemaName?: string | null;
    schemaKey?: string | null;
    schemaVersion?: string | null;
  };
  quality?: {
    completeness?: Record<string, boolean | null | undefined>;
    schema_valid?: boolean | null;
    schemaValid?: boolean | null;
    [key: string]: unknown;
  };
  identifiers?: Record<string, unknown>[];
  urls?: { iconography?: string | null; source?: string | null; api?: string | null };
  depthAvailable?: boolean;
}

export interface IconographyDetail extends IconographySummary {
  evidenceLabel?: string | null;
  evidenceGuardrails?: string[];
  sections?: Record<string, unknown>;
  raw?: Record<string, unknown>;
}

export interface IconographyFacetItem {
  value: string;
  label: string;
  count: number;
  [key: string]: string | number;
}

export interface IconographyFacets {
  instruments: IconographyFacetItem[];
  normalizedInstruments: IconographyFacetItem[];
  iconographyTypes: IconographyFacetItem[];
  objectTypes: IconographyFacetItem[];
  categories: IconographyFacetItem[];
  creators: IconographyFacetItem[];
  centuries: IconographyFacetItem[];
  collections: IconographyFacetItem[];
  itemLocations: IconographyFacetItem[];
  subjects: IconographyFacetItem[];
  iconclass: IconographyFacetItem[];
  media: IconographyFacetItem[];
}

export interface IconographyList {
  mode: ViewMode;
  items: IconographySummary[];
  total: number;
  limit: number;
  offset: number;
  query: string;
  filters: Record<string, unknown>;
  facets: IconographyFacets;
  source?: {
    schemaKey?: string;
    sourceKey?: string;
    rowCount?: number;
  };
}

export interface TuningFacetItem {
  value: string;
  label: string;
  count: number;
  groupKey?: string;
  [key: string]: string | number | undefined;
}

export interface TuningSystemSummary {
  id: string;
  tuningId?: string | null;
  entityId?: string | null;
  sourceRecordId?: string | null;
  label?: string | null;
  title: string;
  groupKey?: string | null;
  groupTitle?: string | null;
  groupLabel?: string | null;
  groupMemberships?: Array<{ groupKey?: string | null; groupTitle?: string | null; label?: string | null }>;
  precision: { isPreciseVariant: boolean; label: string; variant?: string | null };
  toneOrder: string[];
  centValues: number[];
  centstr?: string | null;
  centVectorPreview?: string | null;
  commentary: {
    available: boolean;
    url?: string | null;
    description?: string | null;
    authorNote?: string | null;
    sourceNote?: string | null;
    literatureText?: string | null;
    literatureEntries?: string[];
  };
  literatureCount: number;
  source: { key?: string | null; name?: string | null; url?: string | null; retrievedAt?: string | null };
  sourceUrl?: string | null;
  commentaryUrl?: string | null;
  status?: string | null;
  schema?: { key?: string | null; version?: string | null; name?: string | null; artifactUri?: string | null };
  counts: { documents: number; entityRefs: number; events: number; literature: number; links: number };
  lastSeenAt?: string | null;
  urls?: { temperament?: string | null; source?: string | null; api?: string | null };
  depthAvailable?: boolean;
  publicProjection?: boolean;
}

export interface TuningSystemDetail extends TuningSystemSummary {
  evidenceLabel?: string | null;
  centReference?: Record<string, unknown>;
  toneRows: Array<{ index: number; tone: string; cent?: number | null; absoluteCent?: number | null; relativeToA?: number | null }>;
  derivedIntervals: {
    calculationBasis?: string | null;
    precisionVariant?: string | null;
    absoluteCents: Array<{ tone?: string | null; cents?: number | null }>;
    fifths: Array<{ from?: string | null; to?: string | null; cents?: number | null }>;
    majorThirds: Array<{ from?: string | null; to?: string | null; cents?: number | null }>;
    relativeToA: Array<{ tone?: string | null; cents?: number | null }>;
  };
  commentarySections: Array<{ id: string; label: string; text: string }>;
  literature: Array<{ entityId?: string | null; citationText?: string | null; sourceUrl?: string | null; sourcePath?: string | null; sourcePageIsProvenance?: boolean; raw?: Record<string, unknown> }>;
  links: Array<{ entityId?: string | null; url?: string | null; label?: string | null; kind?: string | null; sourcePath?: string | null; raw?: Record<string, unknown> }>;
  provenance?: Record<string, unknown>;
  quality?: Record<string, unknown>;
  identifiers?: Record<string, unknown>[];
  documents?: Array<Record<string, unknown>>;
  entityRefs?: Array<Record<string, unknown>>;
  literatureRefs?: Array<Record<string, unknown>>;
  linkRefs?: Array<Record<string, unknown>>;
  events?: Array<Record<string, unknown>>;
  sourceSnapshot?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
  raw?: Record<string, unknown>;
}

export interface TemperamentSearchInterpretation {
  originalQuery: string;
  queries: string[];
  kind: "normalized" | "related";
}

export interface TuningSystemList {
  mode: ViewMode;
  items: TuningSystemSummary[];
  total: number;
  limit: number;
  offset: number;
  query?: string;
  searchInterpretation?: TemperamentSearchInterpretation | null;
  filters?: Record<string, unknown>;
  facets: {
    groups: TuningFacetItem[];
    precision: TuningFacetItem[];
    commentary: TuningFacetItem[];
  };
  source?: { rowCount?: number; schemaKey?: string; sourceKey?: string; publicProjection?: boolean };
}

export interface TuningSystemOrganAssertion {
  source: string;
  sourceRecordId?: string | null;
  sourceUrl?: string | null;
  sourceValue?: string | null;
  matchKind: "exact_variant" | "family_wording";
}

export interface TuningSystemOrganItem {
  mdvsId: string;
  title: string;
  url: string;
  country: string;
  location?: string | null;
  matchKind: "exact_variant" | "family_wording";
  assertions: TuningSystemOrganAssertion[];
}

export interface TuningSystemOrganCountryGroup {
  country: string;
  count: number;
  items: TuningSystemOrganItem[];
}

export interface TuningSystemOrganEvidenceGroup {
  key: "exact_variant" | "family_wording";
  label: string;
  guidance: string;
  total: number;
  countries: TuningSystemOrganCountryGroup[];
}

export interface TuningSystemOrganLinks {
  temperament: { id?: string | null; label?: string | null; title?: string | null };
  items: TuningSystemOrganItem[];
  groups: TuningSystemOrganEvidenceGroup[];
  total: number;
  exactVariantCount: number;
  familyWordingCount: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  evidenceBoundary: string;
  publicProjection?: boolean;
}

export interface NormalizedDossierSummary {
  id: string;
  sourceRecordId: string;
  source: { id?: string | null; name: string; url?: string | null };
  title: string;
  summary: string;
  status: string;
  reviewState: string;
  evidenceState?: { code: "source-backed" | "provisional" | "uncertain" | "canonical" | "rejected" | string; label: string; summary: string };
  counts: { entities: number; assertions: number; relations: number; matches: number; decisions: number };
  primaryIdentifier: { scheme?: string | null; value?: string | null };
  startedAt?: string | null;
  endedAt?: string | null;
  topEntities: Record<string, unknown>[];
  keyClaims: Record<string, unknown>[];
  evidencePreview?: EvidencePreview;
  publicAtAGlance?: PublicAtAGlanceItem[];
  publicEvidenceBridge?: Record<string, unknown>[];
  sourceComparison?: SourceComparisonRow[];
  provenanceTrail: Record<string, unknown>[];
  trustSignals?: TrustSignal[];
  publicNotes?: string[];
}

export interface SourceComparisonRow {
  area: string;
  sourceLabel?: string;
  sourceOwner?: string;
  sourceAvailable: number;
  normalizedLabel?: string;
  normalizedOwner?: string;
  normalizedAvailable: number;
  status?: string;
  interpretation: string;
}

export interface TrustSignal {
  label: string;
  owner?: string;
  tone?: "ready" | "attention" | "neutral" | string;
  status: string;
  summary: string;
}

export interface PublicAtAGlanceItem {
  label: string;
  value: string;
  summary?: string;
  tone?: "ready" | "attention" | "neutral" | string;
}

export interface NormalizedDossierDetail extends NormalizedDossierSummary {
  entities?: Record<string, unknown>[];
  assertions?: Record<string, unknown>[];
  relations?: Record<string, unknown>[];
  matches?: Record<string, unknown>[];
  reviewDecisions?: Record<string, unknown>[];
  canonicalStatus?: Record<string, unknown>;
  evidencePacket?: Record<string, unknown>;
  promotionPlan?: Record<string, unknown>;
  mediaBridge?: Record<string, unknown>;
  provenanceTree?: Record<string, unknown>[];
  raw?: Record<string, unknown>;
}

export interface NormalizedDossierList {
  mode: ViewMode;
  items: NormalizedDossierSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface DiscoveryResult {
  kind: "source_record" | "normalized_dossier";
  targetId: string;
  sourceRecordId?: string;
  title: string;
  summary: string;
  source: { id?: string | null; name: string; url?: string | null };
  status: string;
  reviewState?: string;
  primaryIdentifier: { scheme?: string | null; value?: string | null };
  counts: Record<string, number>;
  badges: string[];
  publicAtAGlance?: PublicAtAGlanceItem[];
  trustSignals?: TrustSignal[];
  publicNotes?: string[];
  depthAvailable?: boolean;
}

export interface DiscoveryResponse {
  mode: ViewMode;
  query: string;
  items: DiscoveryResult[];
  total: number;
  limit: number;
}

export interface ResolutionResponse {
  mode: ViewMode;
  query: string;
  resolved: (DiscoveryResult & {
    match?: {
      field?: string;
      value?: string;
      label?: string;
    };
  }) | null;
}

export interface FrameworkContracts {
  database: string;
  host: string;
  port: number;
  schemas: Array<{ schema: string; present: boolean }>;
  summary: { required: number; ready: number; degraded: number; missing: number };
  contracts: Array<{
    component: string;
    schema: string;
    table: string;
    qualifiedName: string;
    purpose: string;
    status: "ready" | "degraded" | "missing";
    schemaPresent: boolean;
    tablePresent: boolean;
    requiredColumns: string[];
    missingColumns: string[];
    rowCount?: number | null;
  }>;
}

export interface VocabularyScheme {
  recordKind?: "governed_scheme" | "schema_categories";
  categoryCount?: number;
  mappingEvidenceState?: string;
  snapshot?: { metadataUrl: string; downloadBase: string };
  id?: number | null;
  mdvsId?: string | null;
  code: string;
  name?: string | null;
  description?: string | null;
  version?: string | null;
  conceptCount?: number;
  mappingCount?: number | null;
  governanceStatusId?: number | null;
  validFrom?: string | null;
  validTo?: string | null;
}

export interface VocabularyConcept {
  recordKind?: "governed_concept" | "schema_category";
  mappingEvidenceState?: string;
  mappingEvidenceScope?: string;
  publicEventUsage?: { scope: string; occurrenceCount: number; groupCount: number; groupsLimited: boolean; groups: Array<{ sourceKey: string; sourceWording: string; mappingKind: string; occurrenceCount: number; sourceRecordCount: number; eventUrls: string[] }> };
  publicProjection?: boolean;
  datasetVersion?: string;
  id?: number | null;
  mdvsId?: string | null;
  code: string;
  preferredLabel?: string | null;
  definition?: string | null;
  parentId?: number | null;
  sortOrder?: number | null;
  validFrom?: string | null;
  validTo?: string | null;
  statusId?: number | null;
  status?: {
    id?: number | null;
    code?: string | null;
    label?: string | null;
    description?: string | null;
  } | null;
  scheme?: { code?: string | null; name?: string | null; version?: string | null };
  labels?: VocabularyConceptLabel[];
  sourceMappingCount?: number | null;
  externalMappingCount?: number | null;
  sourceTermMappings?: VocabularyMapping[];
  externalMappings?: Record<string, unknown>[];
  reverseLinkedGroups?: Array<{
    itemKind?: string | null;
    sourceGroup?: string | null;
    itemCount?: number;
    sourceRecordCount?: number;
    subjectCount?: number;
  }>;
  reverseLinkedGroupTotal?: number;
  reverseLinkedGroupsLimited?: boolean;
}

export interface VocabularyConceptLabel {
  id?: number | string | null;
  label?: string | null;
  languageId?: number | null;
  languageCode?: string | null;
  languageName?: string | null;
  languageEndonym?: string | null;
  languageQa?: VocabularyLanguageQa | null;
  labelTypeId?: number | null;
  scriptId?: number | null;
}

export interface VocabularyLanguageQa {
  detectionId?: string | null;
  detectionKey?: string | null;
  subjectTable?: string | null;
  subjectId?: string | null;
  subjectField?: string | null;
  sourcePath?: string | null;
  sourceRecordId?: string | null;
  inputText?: string | null;
  inputTextSha256?: string | null;
  normalizedInputSha256?: string | null;
  storedLanguageCode?: string | null;
  storedLanguageId?: number | null;
  detectedLanguageCode?: string | null;
  confidence?: number | null;
  margin?: number | null;
  candidates?: Array<{ language_code?: string | null; languageCode?: string | null; confidence?: number | null }>;
  detector?: Record<string, unknown>;
  detectedAt?: string | null;
  qaStatus?: "suggestion" | "conflict" | "consistent" | "uncertain" | "not_applicable" | string | null;
  detectionStatus?: "confident" | "uncertain" | "not_applicable" | string | null;
  flags?: string[];
  navigatorLabel?: string | null;
  suggestedLanguageCode?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface VocabularyLanguageInlineDetectionItem {
  subject_table?: string;
  subject_id?: string | number;
  subject_field?: string;
  source_path?: string;
  source_record_id?: string | number | null;
  text?: string | null;
  input_text?: string | null;
  language_code?: string | null;
  stored_language_code?: string | null;
  language_id?: number | null;
  stored_language_id?: number | null;
}

export interface VocabularyLanguageInlineDetectionResponse {
  status: string;
  executed?: boolean;
  item_count?: number;
  summary?: Record<string, unknown>;
  items: Array<VocabularyLanguageInlineDetectionItem & { languageQa?: VocabularyLanguageQa | null }>;
}

export interface VocabularyLanguage {
  id?: number | null;
  mdvsId?: string | null;
  name?: string | null;
  endonym?: string | null;
  isLiving?: boolean | null;
  scope?: string | null;
  iso6391?: string | null;
  iso6392?: string | null;
  bcp47Tag?: string | null;
  languageCode?: string | null;
  citations?: Array<{ label?: string | null; authority?: string | null; code?: string | null; url?: string | null }>;
  usage?: {
    conceptLabelCount?: number | null;
    sourceTermCount?: number | null;
    schemeCodes?: string[];
    sourceKeys?: string[];
  };
}

export interface VocabularyLanguageRegistryResponse extends VocabularyListResponse<VocabularyLanguage> {
  governance?: {
    owner?: string | null;
    registryVersion?: string | null;
    initiatorSchemaVersion?: string | null;
    registryPath?: string | null;
    seedPath?: string | null;
    seedGenerator?: string | null;
    sourceNote?: string | null;
    citationPolicy?: string | null;
    versioningRule?: string | null;
    proposalWorkflow?: string | null;
    authorityLinks?: Array<{ label?: string | null; url?: string | null }>;
  };
  proposalGuidance?: {
    status?: string | null;
    owner?: string | null;
    canPersistFromNavigator?: boolean | null;
    guidance?: string | null;
    requiredFields?: string[];
    recommendedSources?: string[];
  };
}

export interface VocabularyLanguageRegistryProposalPlan {
  ok: boolean;
  canApplyToInitiator?: boolean;
  executed?: boolean;
  persisted?: boolean;
  blockers?: string[];
  warnings?: string[];
  error?: string | null;
  language?: {
    id?: number | null;
    name?: string | null;
    endonym?: string | null;
    is_living?: boolean | null;
    scope?: string | null;
    iso_639_1?: string | null;
    iso_639_2?: string | null;
    bcp47_tag?: string | null;
    sources?: string[];
  };
  duplicateLanguage?: VocabularyLanguage | null;
  proposalDraft?: {
    format?: string | null;
    registryPath?: string | null;
    yaml?: string | null;
    rationale?: string | null;
    actorId?: string | null;
    commands?: string[];
  };
  proposal?: VocabularyLanguageRegistryProposal | null;
  governance?: VocabularyLanguageRegistryResponse["governance"];
  proposalGuidance?: VocabularyLanguageRegistryResponse["proposalGuidance"];
}

export interface VocabularyLanguageRegistryProposal {
  proposalId?: string | null;
  status?: string | null;
  languageCode?: string | null;
  name?: string | null;
  endonym?: string | null;
  scope?: string | null;
  iso6391?: string | null;
  iso6392?: string | null;
  bcp47Tag?: string | null;
  isLiving?: boolean | null;
  sources?: string[];
  rationale?: string | null;
  actorId?: string | null;
  actorMetadata?: Record<string, unknown>;
  blockers?: string[];
  warnings?: string[];
  proposalDraft?: VocabularyLanguageRegistryProposalPlan["proposalDraft"];
  reviewCount?: number;
  latestReview?: Record<string, unknown> | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface VocabularyLanguageRegistryProposalReviewResult {
  ok: boolean;
  executed?: boolean;
  statusCode?: number;
  proposal?: VocabularyLanguageRegistryProposal | null;
  review?: {
    reviewId?: string | null;
    proposalId?: string | null;
    fromStatus?: string | null;
    toStatus?: string | null;
    decision?: string | null;
    rationale?: string | null;
    actorId?: string | null;
    actorType?: string | null;
    authProvider?: string | null;
    externalSubject?: string | null;
    agentName?: string | null;
    modelName?: string | null;
    confidence?: number | null;
    humanConfirmed?: boolean;
    authorityValidation?: Record<string, unknown>;
    evidence?: Record<string, unknown>;
    createdAt?: string | null;
  } | null;
  transition?: {
    canExecute?: boolean;
    decision?: string;
    fromStatus?: string;
    toStatus?: string;
    actorType?: string;
    humanConfirmed?: boolean;
    authorityValidationOk?: boolean;
    blockers?: string[];
    warnings?: string[];
    guidance?: string;
  };
  blockers?: string[];
  warnings?: string[];
  error?: string | null;
}

export interface VocabularyLanguageRegistryProposalListResponse extends VocabularyListResponse<VocabularyLanguageRegistryProposal> {
  governance?: VocabularyLanguageRegistryResponse["governance"];
  proposalGuidance?: VocabularyLanguageRegistryResponse["proposalGuidance"];
}

export interface VocabularyConceptLabelLanguagePlan {
  ok: boolean;
  canExecute?: boolean;
  executed?: boolean;
  blockers?: string[];
  warnings?: string[];
  label?: VocabularyConceptLabel & {
    conceptId?: number | null;
    conceptCode?: string | null;
    schemeId?: number | null;
    schemeCode?: string | null;
    language?: VocabularyLanguage | null;
  };
  concept?: VocabularyConcept;
  targetLanguage?: VocabularyLanguage | null;
  request?: Record<string, unknown>;
  changeLog?: Record<string, unknown>;
  permission?: {
    permission?: string;
    aliases?: string[];
    allowed?: boolean;
    actorId?: string | null;
  };
  error?: string | null;
  detail?: string | null;
}

export interface VocabularySourceTerm {
  id?: number | null;
  mdvsId?: string | null;
  sourceKey?: string | null;
  sourceTable?: string | null;
  sourceField?: string | null;
  rawTerm?: string | null;
  normalizedTerm?: string | null;
  languageCode?: string | null;
  sourceLanguageCode?: string | null;
  language?: VocabularyLanguage | null;
  languageQa?: VocabularyLanguageQa | null;
  termClass?: string | null;
  scopeNote?: string | null;
  statusId?: number | null;
  mappingCount?: number;
  occurrenceCount?: number;
  mappingStatuses?: string[];
  vocabularyDecision?: {
    decisionId?: string | null;
    terminalOutcome?: string | null;
    decisionMethod?: string | null;
    mappingRationale?: string | null;
    decisionSha256?: string | null;
    conflict?: boolean;
    targetVocabulary?: {
      conceptId?: number | null;
      conceptMdvsId?: string | null;
      conceptCode?: string | null;
      schemeCode?: string | null;
    } | null;
    effects?: Record<string, unknown> | null;
  } | null;
  refinement?: {
    terminalOutcome?: string | null;
    mappingKind?: string | null;
    preferredLabel?: string | null;
    sourceWording?: string | null;
    languageTag?: string | null;
    scriptCodes?: string[];
    transliterations?: string[];
    searchAliases?: string[];
    decisionSha256?: string | null;
  } | null;
  metadata?: Record<string, unknown>;
  mappings?: VocabularyMapping[];
  occurrences?: VocabularyOccurrence[];
  publicUrls?: {
    sourceTerm?: string | null;
  };
  api?: {
    self?: string | null;
    occurrences?: string | null;
  };
}

export interface VocabularyMapping {
  id?: number | null;
  mdvsId?: string | null;
  mappingKind?: string | null;
  reviewStatus?: string | null;
  confidence?: number | null;
  version?: string | null;
  scopeNote?: string | null;
  sourceTerm?: VocabularySourceTerm;
  concept?: Pick<VocabularyConcept, "id" | "mdvsId" | "code" | "definition" | "scheme">;
  context?: Pick<VocabularyContext, "id" | "mdvsId" | "code" | "domainCode" | "reviewStatus"> | null;
}

export interface VocabularyContext {
  id?: number | null;
  mdvsId?: string | null;
  code?: string | null;
  domainCode?: string | null;
  sourceKey?: string | null;
  sourceTable?: string | null;
  sourceField?: string | null;
  sourceCategory?: string | null;
  recordType?: string | null;
  entityType?: string | null;
  languageCode?: string | null;
  sourceLanguageCode?: string | null;
  language?: VocabularyLanguage | null;
  reviewStatus?: string | null;
  scopeNote?: string | null;
  mappingCount?: number;
}

export interface VocabularyOccurrence {
  id?: number | null;
  mdvsId?: string | null;
  sourceKey?: string | null;
  sourceRecordKey?: string | null;
  sourceRecordId?: string | null;
  sourcePageUrl?: string | null;
  eventPageUrl?: string | null;
  sourceTable?: string | null;
  sourceField?: string | null;
  sourceCategory?: string | null;
  recordType?: string | null;
  entityType?: string | null;
  languageCode?: string | null;
  sourceLanguageCode?: string | null;
  language?: VocabularyLanguage | null;
  languageQa?: VocabularyLanguageQa | null;
  observedValue?: string | null;
  sourceTerm?: VocabularySourceTerm;
  context?: Record<string, unknown>;
}

export interface VocabularySourceTermReviewItem {
  id?: string | number | null;
  sourceTerm: VocabularySourceTerm;
  reviewState?: string | null;
  reviewCriticality?: string | null;
  reviewReason?: string | null;
  suggestedNextAction?: string | null;
  assignmentCount?: number;
  mappingCount?: number;
  occurrenceCount?: number;
  conceptCount?: number;
  candidateMappings?: VocabularyMapping[];
  occurrenceSamples?: VocabularyOccurrence[];
  publicUrls?: {
    sourceTerm?: string | null;
  };
  api?: {
    self?: string | null;
  };
}

export interface VocabularyReleaseSnapshot {
  mdvsId?: string | null;
  schemeId?: number | null;
  schemeMdvsId?: string | null;
  schemeCode?: string | null;
  schemeName?: string | null;
  schemeVersion?: string | null;
  vocabularyHash?: string | null;
  expectedVocabularyHash?: string | null;
  currentVocabularyHash?: string | null;
  freshnessState?: string | null;
  staleReason?: string | null;
  conceptCount?: number;
  mappingCount?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface VocabularyReleaseFreshness {
  status?: string | null;
  isCurrent?: boolean;
  checkedAt?: string | null;
  staleReasons?: string[];
  snapshotCount?: number;
  staleSnapshotCount?: number;
  snapshots?: VocabularyReleaseSnapshot[];
  changeCountSinceRelease?: number;
  latestChangeAt?: string | null;
  guidance?: string | null;
}

export interface VocabularyRelease {
  id?: number | null;
  mdvsId?: string | null;
  versionLabel?: string | null;
  doi?: string | null;
  issuedAt?: string | null;
  schemaVersion?: string | null;
  vocabularyVersion?: string | null;
  dataHash?: string | null;
  citationText?: string | null;
  statusId?: number | null;
  vocabularySnapshotCount?: number;
  vocabularySnapshots?: VocabularyReleaseSnapshot[];
  freshness?: VocabularyReleaseFreshness;
  artifactSummary?: {
    artifactCount?: number;
    storedCount?: number;
    unstoredCount?: number;
    providerCount?: number;
    artifactKinds?: string[];
    storageStatus?: string | null;
    artifacts?: VocabularyReleaseArtifactSummary[];
  };
  identifierSummary?: VocabularyReleaseIdentifierSummary;
  currentIdentifiers?: VocabularyReleaseCurrentIdentifiers;
  identifiers?: VocabularyReleaseIdentifier[];
  citation?: {
    doi?: string | null;
    text?: string | null;
    latestUrl?: string | null;
    versionedUrl?: string | null;
  };
  publicUrls?: {
    release?: string | null;
    releaseByMdvs?: string | null;
  };
  exports?: {
    skosTurtle?: string | null;
    jsonLd?: string | null;
    csvArchive?: string | null;
    artifactManifest?: string | null;
  };
}

export interface VocabularyReleaseIdentifier {
  id?: number | string | null;
  mdvsId?: string | null;
  releaseId?: number | string | null;
  type?: string | null;
  label?: string | null;
  value?: string | null;
  uri?: string | null;
  provider?: string | null;
  providerRecordId?: string | null;
  status?: string | null;
  isPrimary?: boolean;
  scope?: string | null;
  isLatest?: boolean;
  metadata?: Record<string, unknown>;
  registeredAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface VocabularyReleaseIdentifierSummary {
  identifierCount?: number;
  handleCount?: number;
  registeredCount?: number;
  identifierTypes?: string[];
  identifiers?: VocabularyReleaseIdentifier[];
  currentIdentifiers?: VocabularyReleaseCurrentIdentifiers;
  storageStatus?: string | null;
}

export interface VocabularyReleaseCurrentIdentifiers {
  versionDoi?: VocabularyReleaseIdentifier | null;
  conceptDoi?: VocabularyReleaseIdentifier | null;
  dois?: VocabularyReleaseIdentifier[];
}

export interface VocabularySourceTermDetailResponse {
  sourceTerm: VocabularySourceTerm;
}

export interface VocabularySourceTermReviewQueueResponse extends VocabularyListResponse<VocabularySourceTermReviewItem> {
  reviewStates?: Record<string, number>;
  guidance?: string;
}

export interface VocabularyQaQueueItem extends Partial<VocabularySourceTermReviewItem> {
  itemType?: "unresolved_language" | "source_term_review" | string;
  label?: string | null;
  area?: string | null;
  sourceKey?: string | null;
  languageCode?: string | null;
  detectedLanguageCode?: string | null;
  languageQa?: VocabularyLanguageQa | null;
  count?: number;
  samples?: Array<Record<string, unknown>>;
  proposalDraft?: {
    name?: string | null;
    endonym?: string | null;
    scope?: string | null;
    iso6391?: string | null;
    iso6392?: string | null;
    bcp47Tag?: string | null;
    sources?: string[];
    rationale?: string | null;
  };
  actions?: Array<{
    id?: string | null;
    label?: string | null;
    method?: string | null;
    href?: string | null;
  }>;
}

export interface VocabularyQaQueueResponse extends VocabularyListResponse<VocabularyQaQueueItem> {
  summary?: {
    actionableCount?: number;
    unresolvedLanguageCount?: number;
    unresolvedLanguageGroups?: number;
    sourceTermReviewCount?: number;
    byType?: Record<string, number>;
    byCriticality?: Record<string, number>;
    sourceTermReviewStates?: Record<string, number>;
  };
  guidance?: string;
}

export interface VocabularyReleaseArtifactSummary {
  artifactKind?: string | null;
  filename?: string | null;
  byteSize?: number | null;
  sha256?: string | null;
  storageState?: string | null;
  storageProvider?: string | null;
  storageUri?: string | null;
}

export interface VocabularyChangeLogItem {
  id?: number | string | null;
  mdvsId?: string | null;
  changeType?: string | null;
  changeSummary?: string | null;
  rationale?: string | null;
  changedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  rowVersion?: number | null;
  rowHash?: string | null;
  subjectType?: string | null;
  subject?: {
    id?: number | string | null;
    mdvsId?: string | null;
    label?: string | null;
    code?: string | null;
    publicUrl?: string | null;
    [key: string]: unknown;
  };
  scheme?: { id?: number | null; mdvsId?: string | null; code?: string | null; name?: string | null; version?: string | null } | null;
  release?: { id?: number | null; mdvsId?: string | null; versionLabel?: string | null; citationText?: string | null; publicUrl?: string | null } | null;
  changedBy?: { mdvsId?: string | null; label?: string | null } | null;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface VocabularyChangeLogResponse extends VocabularyListResponse<VocabularyChangeLogItem> {
  changeTypes?: Record<string, number>;
  guidance?: string;
}

export interface VocabularySourceTermMappingReviewRequest {
  source_term_id: string;
  concept_id: string;
  mapping_context_id: string;
  mapping_kind?: string;
  review_status?: string;
  confidence?: number | null;
  version?: string;
  scope_note?: string;
  rationale: string;
}

export interface VocabularyExistingMappingReviewRequest {
  review_status: string;
  confidence?: number | null;
  scope_note?: string;
  rationale: string;
}

export interface VocabularyConceptProposalRequest {
  source_term_id: string;
  scheme_code?: string;
  concept_code: string;
  preferred_label: string;
  english_label?: string;
  definition: string;
  parent_concept_id?: string;
  mapping_context_id: string;
  mapping_kind?: string;
  mapping_confidence?: number | null;
  rationale: string;
}

export interface VocabularyConceptReviewRequest {
  target_status: string;
  rationale: string;
}

export interface VocabularySourceTermMappingReviewPlan {
  ok: boolean;
  canExecute?: boolean;
  executed?: boolean;
  blockers?: string[];
  warnings?: string[];
  request?: Record<string, unknown>;
  sourceTerm?: VocabularySourceTerm | null;
  concept?: VocabularyConcept | null;
  context?: VocabularyContext | null;
  existingMapping?: VocabularyMapping | null;
  conflictingMappings?: VocabularyMapping[];
  mapping?: VocabularyMapping;
  changeLog?: VocabularyChangeLogItem;
  guidance?: string;
  permission?: {
    permission?: string;
    aliases?: string[];
    allowed?: boolean;
    actorId?: string | null;
  };
  error?: string | null;
  detail?: string | null;
}

export interface VocabularyConceptProposalPlan extends Omit<VocabularySourceTermMappingReviewPlan, "changeLog"> {
  scheme?: Record<string, unknown> | null;
  parentConcept?: VocabularyConcept | null;
  existingConcept?: VocabularyConcept | null;
  duplicateLabelConcepts?: VocabularyConcept[];
  changeLog?: VocabularyChangeLogItem[] | VocabularyChangeLogItem;
}

export interface VocabularyConceptReviewPlan extends Omit<VocabularySourceTermMappingReviewPlan, "sourceTerm" | "context" | "existingMapping" | "conflictingMappings" | "mapping"> {
  targetStatus?: {
    id?: number | null;
    mdvsId?: string | null;
    code?: string | null;
    label?: string | null;
    description?: string | null;
    alias?: string | null;
  } | null;
  sourceMappingStatuses?: string[];
  mdvsReadiness?: Array<Record<string, unknown>>;
}

export interface VocabularyReleaseStorageCheck {
  ok: boolean;
  status?: string | null;
  artifactCount?: number;
  problemCount?: number;
  staleArtifactCount?: number;
  repairAvailable?: boolean;
  repairEndpoint?: string | null;
  exporterCheck?: {
    status?: string | null;
    blockers?: Array<Record<string, unknown>>;
  };
  checks?: Array<{
    artifactKind?: string | null;
    filename?: string | null;
    status?: string | null;
    filePresent?: boolean;
    byteSizeMatches?: boolean;
    sha256Matches?: boolean;
    expectedByteSize?: number | null;
    actualByteSize?: number | null;
    generatedByteSize?: number | null;
    expectedSha256?: string | null;
    actualSha256?: string | null;
    generatedSha256?: string | null;
    generatedBytesMatchStoredMetadata?: boolean | null;
    generatedSha256MatchesStoredMetadata?: boolean | null;
    exporterDriftDetected?: boolean;
    exporterCheckStatus?: string | null;
    exporterCheckBlocker?: Record<string, unknown> | null;
    staleReason?: string | null;
    repairAction?: string | null;
    storageProvider?: string | null;
    storageUri?: string | null;
  }>;
}

export interface VocabularyReleaseQualityCheck {
  ok: boolean;
  conforms?: boolean;
  status?: string | null;
  release?: {
    versionLabel?: string | null;
    mdvsId?: string | null;
    dataHash?: string | null;
  };
  summary?: {
    snapshotCount?: number;
    conceptCount?: number;
    sourceTermMappingCount?: number;
    checkCount?: number;
    errorCount?: number;
    warningCount?: number;
  };
  checks?: Array<{
    id?: string | null;
    label?: string | null;
    status?: string | null;
    issueCount?: number | null;
    warningCount?: number | null;
    conceptCount?: number | null;
    tripleCount?: number | null;
    report?: string | null;
  }>;
  issues?: Array<Record<string, unknown>>;
  warnings?: Array<Record<string, unknown>>;
  gate?: {
    canPublish?: boolean;
    blocker?: string | null;
    guidance?: string | null;
  };
  error?: string | null;
  detail?: string | null;
}

export interface VocabularyReleaseIdentifierPlan {
  ok: boolean;
  canRegister?: boolean;
  blockers?: string[];
  warnings?: string[];
  recommendedIdentifierTypes?: string[];
  providers?: {
    governance?: {
      approved?: boolean;
      requiredEnv?: string | null;
    };
    datacite?: {
      kind?: string | null;
      mode?: string | null;
      ready?: boolean;
      execution?: string | null;
      guidance?: string | null;
      missing?: string[];
      doiPrefix?: string | null;
    };
    handle?: {
      kind?: string | null;
      mode?: string | null;
      ready?: boolean;
      execution?: string | null;
      guidance?: string | null;
      missing?: string[];
      prefix?: string | null;
    };
  };
  identifierPersistence?: Record<string, unknown>;
  existingIdentifiers?: VocabularyReleaseIdentifier[];
  registration?: {
    doi?: {
      canRegister?: boolean;
      blockers?: string[];
      provider?: string | null;
      mode?: string | null;
      proposedIdentifier?: string | null;
      metadataValidation?: {
        valid?: boolean;
        metadataValid?: boolean;
        missing?: string[];
        missingMetadata?: string[];
        missingRegistration?: string[];
        checks?: Record<string, boolean>;
        guidance?: string | null;
        schema?: string | null;
      };
      registrationEndpoint?: string | null;
    };
    handle?: {
      canRegister?: boolean;
      blockers?: string[];
      canRecordAssigned?: boolean;
      recordBlockers?: string[];
      provider?: string | null;
      mode?: string | null;
      proposedIdentifier?: string | null;
      registrationEndpoint?: string | null;
    };
  };
  metadata?: Record<string, unknown>;
  storageCheck?: Record<string, unknown>;
  workflow?: string[];
  executed?: boolean;
  dryRun?: boolean;
  identifier?: string | null;
  identifierType?: string | null;
  provider?: string | null;
  providerRequest?: Record<string, unknown>;
  providerResponse?: Record<string, unknown>;
  error?: string | null;
  detail?: string | null;
}

export interface VocabularyReleasePlan {
  ok: boolean;
  canPublish?: boolean;
  canExecute?: boolean;
  blockers?: string[];
  versionLabel?: string | null;
  schemaVersion?: string | null;
  vocabularyVersion?: string | null;
  doi?: string | null;
  citationText?: string | null;
  dataHash?: string | null;
  hashAlgorithm?: string | null;
  confirmationPhrase?: string | null;
  duplicateVersion?: boolean;
  guidance?: string | null;
  status?: Record<string, unknown>;
  mdvsReadiness?: Array<{
    table: string;
    ready: boolean;
    aliasReady?: boolean;
    tableReady?: boolean;
    requiredFix?: string | null;
  }>;
  snapshots?: Array<{
    schemeId?: number;
    schemeMdvsId?: string | null;
    schemeCode?: string | null;
    schemeName?: string | null;
    schemeVersion?: string | null;
    vocabularyHash?: string | null;
    conceptCount?: number;
    mappingCount?: number;
    payloadSummary?: Record<string, number>;
  }>;
  permission?: {
    permission?: string;
    aliases?: string[];
    allowed?: boolean;
    actorId?: string | null;
  };
  executed?: boolean;
  release?: VocabularyRelease;
  insertedSnapshots?: VocabularyReleaseSnapshot[];
  postActionChecks?: string[];
  error?: string;
  detail?: string;
}

export interface VocabularyReleasePlanRequest {
  version_label: string;
  vocabulary_version?: string;
  schema_version?: string;
  citation_text?: string;
  doi?: string;
  scheme_codes?: string[];
}

export interface VocabularyReleasePublishRequest extends VocabularyReleasePlanRequest {
  confirmation_phrase: string;
}

export interface VocabularyOverview {
  status: string;
  mode: string;
  counts: Record<string, number>;
  sourceTermCoverage?: { total?: number; mapped?: number; unmapped?: number };
  mappingReviewStatus: Record<string, number>;
  contextReviewStatus: Record<string, number>;
  schemes: VocabularyScheme[];
  publication?: {
    status?: string;
    latestRelease?: VocabularyRelease | null;
    freshness?: VocabularyReleaseFreshness | null;
    guidance?: string;
  };
  guidance?: string;
}

export interface VocabularyListResponse<T> {
  status: string;
  items: T[];
  total: number;
  limit?: number;
  offset?: number;
  filters?: Record<string, unknown>;
}

export interface VocabularyConceptDetailResponse {
  concept: VocabularyConcept;
}

export interface ProcessorWorkbench {
  hub: {
    health: SafeResult;
    modules: SafeResult;
    workItems: SafeResult;
    policy: SafeResult;
    runs: SafeResult;
  };
  database: SafeResult<{
    actors: Record<string, unknown>[];
    permissionGrants: Record<string, unknown>[];
    recentRuns: Record<string, unknown>[];
    authorizationEvents: Record<string, unknown>[];
  }>;
}

export interface ProcessorActorPermissionCheck {
  activeGrantCount?: number;
  allowed: boolean;
  aliases?: string[];
  error?: string | null;
  grantCount?: number;
  grants?: Record<string, unknown>[];
  ok: boolean;
  latestAuthorizationEvent?: Record<string, unknown> | null;
  matchedPermissions?: string[];
  permission: string;
  recentAuthorizationEvents?: Record<string, unknown>[];
}

export interface ProcessorActorPermissionsResponse {
  actor?: Record<string, unknown> | null;
  actorId: string;
  ok: boolean;
  permissions: ProcessorActorPermissionCheck[];
}

export interface ProcessorRunInspection {
  run: SafeResult;
  logs: SafeResult;
  events: SafeResult;
}

export interface ProcessorPublicModelSummary {
  model_id: string;
  object_id?: string | null;
  source_record_id?: string | null;
  batch_id?: string | null;
  quality_score?: number | null;
  quality_label?: string | null;
  is_low_confidence?: boolean;
  viewer_type?: string | null;
  artifact_count?: number;
  updated_at?: string | null;
  paradata_complete?: boolean;
  public_url?: string | null;
  api_url?: string | null;
}

export interface ProcessorPublicModelDiscovery {
  status: string;
  surface?: string;
  count?: number;
  total?: number;
  filters?: Record<string, unknown>;
  models: ProcessorPublicModelSummary[];
}

export interface ProcessorPublicModelViewer {
  viewer_type?: string | null;
  storage_backend?: string | null;
  model_url?: string | null;
  model_viewer_src?: string | null;
  model_proxy_url?: string | null;
  stable_processor_artifact_url?: string | null;
  public_web_ready?: boolean;
  public_web_blockers?: string[];
  serving_strategy?: string | null;
  requires_drive_sharing?: boolean;
  drive_sharing?: Record<string, unknown> | null;
}

export interface ProcessorPublicModelBundle {
  status: string;
  model_id: string;
  audience?: string;
  viewer: ProcessorPublicModelViewer;
  model?: Record<string, unknown>;
  blockers?: string[];
}

export interface AggregatorWorkbench {
  service: {
    ok: boolean;
    statusCode?: number;
    url: string;
    error?: string;
  };
  database: SafeResult<{
    counts: Record<string, number>;
    sources: Record<string, unknown>[];
    sourceTargets: Record<string, unknown>[];
    sourceProposals: Record<string, unknown>[];
    workflowRequests: Record<string, unknown>[];
    documents: Record<string, unknown>[];
    documentJobs: Record<string, unknown>[];
    documentEvents: Record<string, unknown>[];
    runs: Record<string, unknown>[];
    runItems: Record<string, unknown>[];
    approvalPolicies: Record<string, unknown>[];
    notifications: Record<string, unknown>[];
  }>;
}

export interface AdminOperationsSummary {
  service: {
    ok: boolean;
    statusCode?: number;
    url: string;
    error?: string;
  };
  summary: SafeResult<{
    ok: boolean;
    generatedAt?: string;
    target?: { organPages?: number };
    catalogReadModel?: CatalogReadModelStatus;
    aggregator: {
      counts: Record<string, number>;
      runs: {
        activeCount: number;
        failedStatusCount: number;
        requestedCount: number;
        completedCount: number;
        failedCount: number;
        latest?: Record<string, unknown> | null;
      };
      runItems: { failedRecentCount: number };
      documentJobs: { activeCount: number; failedCount: number };
      workflowRequests: { openCount: number };
      notifications: { openCount: number };
    };
  }>;
}

export interface ProcessorJobRequest {
  job_type: string;
  payload: Record<string, unknown>;
}

export interface ImagesegAnnotationTarget {
  runId?: string | null;
  mediaReferenceId?: string | null;
  imageIdentifier?: string | null;
  organId?: string | null;
  includeImageDataUrl?: boolean;
}

export interface ImagesegSegment {
  segment_id: string;
  mask_index?: number | null;
  polygon_norm: unknown;
  polygon_px?: unknown;
  bbox_xywh?: number[] | null;
  area_px?: number | null;
  predicted_iou?: number | null;
  stability_score?: number | null;
  class_label?: string | null;
  class_confidence?: number | null;
  class_source?: string | null;
  segment_status?: string | null;
}

export interface ImagesegAnnotationView {
  status: string;
  contract_version?: string | null;
  run_id?: string | null;
  image?: {
    image_identifier?: string | null;
    media_reference_id?: string | null;
    source_record_id?: string | null;
    raw_document_id?: string | null;
    image_uri?: string | null;
    display_url?: string | null;
    content_sha256?: string | null;
    width?: number | null;
    height?: number | null;
    data_url_available?: boolean;
    local_path_available?: boolean;
  };
  segment_count?: number;
  coordinate_space?: Record<string, unknown>;
  hover_contract?: Record<string, unknown>;
  segments: ImagesegSegment[];
  hit_test_segment_ids?: string[];
  render_segment_ids?: string[];
  model?: Record<string, unknown>;
}

export interface ImagesegSegmentAnnotation {
  annotationId?: string | null;
  segmentId: string;
  runId?: string | null;
  mediaReferenceId?: string | null;
  imageIdentifier?: string | null;
  organId?: string | null;
  label?: string | null;
  comment?: string | null;
  status?: string | null;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ImagesegLabelSuggestion {
  label: string;
  count?: number;
  scopeScore?: number;
  latestAt?: string | null;
}

export interface ImagesegAnnotationAuditEntry {
  auditId?: string | null;
  annotationId?: string | null;
  segmentId?: string | null;
  action?: string | null;
  actorId?: string | null;
  previous?: Record<string, unknown>;
  current?: Record<string, unknown>;
  createdAt?: string | null;
}

export interface ImagesegViewState {
  maskOpacity?: number;
  outlineOnly?: boolean;
  masksVisible?: boolean;
  isolateSelected?: boolean;
  dimNonSelected?: boolean;
  segmentSort?: string;
  zoom?: number;
  pan?: { x: number; y: number };
  selectedSegmentId?: string | null;
}

export interface ImagesegViewStateRecord {
  targetKey?: string | null;
  state?: ImagesegViewState;
  actorId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ImagesegSegmentAnnotationSaveRequest {
  segmentId: string;
  runId?: string | null;
  mediaReferenceId?: string | null;
  imageIdentifier?: string | null;
  organId?: string | null;
  label?: string | null;
  comment?: string | null;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface NavigatorActor {
  actorId: string;
  authProvider?: string;
  subject?: string;
}

export interface SourceProposalRequest {
  candidate_url?: string;
  candidate_title?: string;
  candidate_type: string;
  source_key?: string;
  note?: string;
}

export interface SourceProposalResponse {
  proposal?: Record<string, unknown> | null;
  workflowRequest?: Record<string, unknown> | null;
  notification?: Record<string, unknown> | null;
  duplicate?: boolean;
  duplicateKind?: string;
}

export interface SafeResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  statusCode?: number;
  processor?: unknown;
}

export interface OrganCard {
  id: string;
  mdvsId: string;
  targetMdvsId?: string | null;
  pageUrl?: string | null;
  catalogReference?: string | null;
  catalogState?: "linked" | "provisional" | string;
  orgelseiteId?: string | null;
  canonicalProjectionAllowed?: boolean;
  publicationAllowed?: boolean;
  title: string;
  transliterations?: Array<{
    value: string;
    sourceText?: string | null;
    fieldPath?: string | null;
    system?: string | null;
    status?: string | null;
  }>;
  summary?: string | null;
  location?: string | null;
  coordinates?: { lat: number; lon: number } | null;
  country?: string | null;
  locationReadiness?: {
    state: "coordinates" | "needs_georeferencing" | "missing" | string;
    label: string;
    georeferenceStatus: string;
    hasTextLocation: boolean;
    hasStructuredLocation: boolean;
    hasCoordinates: boolean;
    coordinatePrecision?: string | null;
    coordinateFallback?: boolean;
    coordinateUncertaintyRadiusM?: number | null;
    coordinateSource?: string | null;
    country?: string | null;
    sourceObservationStatus?: string | null;
    effectiveObservationStatus?: string | null;
    qualificationOutcome?: string | null;
    qualificationReason?: string | null;
    sourceAssertionPreserved?: boolean;
    georeferencingPriority?: number | null;
    georeferencingPriorityLabel?: string | null;
    georeferencingPriorityReasons?: string[];
    structuredLocationFieldCount?: number | null;
  };
  georeferencingQueuePlan?: {
    status: string;
    label: string;
    sourceRecordId?: string | null;
    queryText?: string | null;
    country?: string | null;
    priority?: number | null;
    priorityLabel?: string | null;
    priorityReasons?: string[];
    nextAction?: string | null;
    candidateStatus?: string | null;
    canonicalPlaceStatus?: string | null;
    route?: string | null;
    reviewGates?: Array<{ id: string; label: string; status: string }>;
    guidance?: string | null;
  };
  builder?: string | null;
  builderMdvsId?: string | null;
  builderUrl?: string | null;
  placeMdvsId?: string | null;
  placeUrl?: string | null;
  dateLabel?: string | null;
  status: string;
  certainty: string;
  sourceCount: number;
  sourceLabel?: string | null;
  mediaCount: number;
  documentCount: number;
  heroImage?: string | null;
  specification: Record<string, unknown>;
  updatedAt?: string | null;
}

export interface PublicProfileItem {
  label?: string | null;
  value?: string | null;
  type?: string | null;
  criticality?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown>;
  direction?: string | null;
  evidenceSummary?: string | null;
  relatedActionLabel?: string | null;
  relatedEntityState?: string | null;
  relatedDomainKind?: string | null;
  relatedLabel?: string | null;
  relatedMdvsId?: string | null;
  relatedStatusLabel?: string | null;
  relatedUrl?: string | null;
  relationType?: string | null;
  sourceRecordId?: string | null;
  statement?: string | null;
}

export interface PublicProfileSection {
  key?: string | null;
  title?: string | null;
  summary?: string | null;
  emptyState?: string | null;
  items?: PublicProfileItem[];
}

export interface PublicProfile {
  summary?: string | null;
  sections?: PublicProfileSection[];
}

export interface ActorRelationshipPreviewItem {
  id?: string | null;
  label?: string | null;
  statement?: string | null;
  relatedLabel?: string | null;
  relatedMdvsId?: string | null;
  relatedUrl?: string | null;
  relatedEntityState?: string | null;
  relatedStatusLabel?: string | null;
  relatedActionLabel?: string | null;
  relationType?: string | null;
  direction?: string | null;
  sourceRecordId?: string | null;
  evidenceSummary?: string | null;
}

export interface ActorRelationshipPreview {
  status?: string | null;
  summary?: string | null;
  center?: { id?: string | null; label?: string | null; mdvsId?: string | null; kind?: string | null; state?: string | null };
  lanes?: Array<{
    key?: string | null;
    title?: string | null;
    summary?: string | null;
    items?: ActorRelationshipPreviewItem[];
    count?: number;
    emptyState?: string | null;
  }>;
  nodes?: Array<{ id?: string | null; label?: string | null; mdvsId?: string | null; kind?: string | null; state?: string | null; url?: string | null }>;
  edges?: Array<{ id?: string | null; from?: string | null; to?: string | null; label?: string | null; lane?: string | null; sourceRecordId?: string | null }>;
  relationshipCount?: number;
}

export interface EvidenceLinkPayload {
  id: string;
  label: string;
  kind: "source" | "file" | "media" | "api" | "external" | string;
  detail?: string | null;
  href?: string | null;
  sourceRecordId?: string | null;
  fileId?: string | null;
  payload?: Record<string, unknown>;
}

export interface EvidenceTargetPayload {
  id: string;
  kind: "fact" | "component" | "relationship" | "related_entity" | "media" | "source" | "file" | "identifier" | string;
  title: string;
  value?: string | null;
  status?: string | null;
  summary?: string | null;
  citationUrl?: string | null;
  targetShape?: Record<string, unknown>;
  sourceLinks?: EvidenceLinkPayload[];
  fileLinks?: EvidenceLinkPayload[];
  normalizerEvidence?: NormalizerFactEvidence[];
  provenance?: Array<{ stage?: string | null; owner?: string | null; id?: string | null; status?: string | null }>;
}

export interface OrganFact {
  key: string;
  label: string;
  value: string;
  certainty: string;
  trustState: string;
  publicationState?: string;
  publicationLabel?: string;
  publicationDescription?: string;
  canonicalState?: string;
  sourceCount: number;
  sources: OrganSource[];
  normalizerEvidence?: NormalizerFactEvidence[];
  communityContributionCount?: number;
  communityContributions?: CommunityFactContribution[];
  canContribute: boolean;
  canDispute: boolean;
  evidenceTarget?: EvidenceTargetPayload;
  entityReference?: {
    label?: string | null;
    preferredUrl?: string | null;
    entityState?: string | null;
    entityStateLabel?: string | null;
    candidateEntityId?: string | null;
    canonicalMdvsId?: string | null;
  };
}

export interface CommunityFactContribution {
  id?: string | null;
  type?: string | null;
  title?: string | null;
  value?: unknown;
  comment?: string | null;
  evidenceTarget?: Record<string, unknown> | null;
  evidenceTargetKind?: string | null;
  evidenceTargetStatus?: string | null;
  reviewState?: string | null;
  lifecycleState?: string | null;
  lifecycleLabel?: string | null;
  lifecycleDescription?: string | null;
  visibilityState?: string | null;
  evidenceUrl?: string | null;
  attachment?: ContributionAttachment;
  submittedAt?: string | null;
}

export interface NormalizerFactEvidence {
  id?: string | null;
  candidateKind?: string | null;
  sessionId?: string | null;
  sourceRecordId?: string | null;
  predicateCode?: string | null;
  label: string;
  value: string;
  rawValue?: string | null;
  sourcePath?: string | null;
  matchReason?: string | null;
  confidence?: number | null;
  reviewStatus?: string | null;
  promotionState?: string | null;
  reviewAction?: string | null;
  reviewDecisionOptions?: NormalizerReviewDecisionOption[];
  createdAt?: string | null;
  subjectCandidateId?: string | null;
  objectCandidateId?: string | null;
  provenanceChain?: Array<{ stage?: string | null; owner?: string | null; id?: string | null; status?: string | null }>;
}

export interface NormalizerReviewDecisionOption {
  id: string;
  label: string;
  module: string;
  jobType: string;
  owner: string;
  permission?: string | null;
  permissionLabel?: string | null;
  mutates: boolean;
  requiresActor: boolean;
  enabled: boolean;
  status?: string | null;
  candidateKind?: string | null;
  confirmationRequired?: boolean;
  confirmation?: ProcessorActionConfirmation;
  payloadTemplate?: Record<string, unknown>;
  requestPreview?: ProcessorRequestPreview;
}

export interface OrganSource {
  id: string;
  title: string;
  source: string;
  status: string;
  schemaKey?: string | null;
  schemaVersion?: string | null;
  schemaHash?: string | null;
  payloadHash?: string | null;
  url?: string | null;
  statusDetail?: string | null;
}

export interface OrganTechnicalAssertion {
  source: string;
  sourceRecordId?: string | null;
  sourceUrl?: string | null;
  sourcePath: string;
  value?: string | null;
  rawValue?: string | null;
  text?: string | null;
  extraction?: "structured_source_field" | "bounded_labeled_source_text" | string;
  concept?: {
    id: string;
    label: string;
    matchKind: string;
  } | null;
}

export interface OrganParityTechnicalFact {
  qualificationGuidance?: string;
  aggregateQualification?: { status: string; headlineEligible: boolean };
  summaryEvidence?: { interpretation: string; scope: string; accountWording?: string; evidence: { path: string; start: number; end: number; wording: string }[] } | null;
  id: string;
  family: string;
  label: string;
  displayValue: string;
  normalizedNumber?: number | null;
  sourceWording: string;
  source: string;
  sourceRecordId: string;
  sourceUrl?: string | null;
  sourcePath: string;
  evidenceSha256: string;
  supportState: string;
  conflictState: string;
  comparison?: string | null;
  capturedComponentCount?: number | null;
  conceptCode?: string | null;
  mappingKind?: string | null;
  refinementOutcome?: string | null;
  evidenceKind: "functional_derived" | "source_assertion" | string;
  functionalPositionStatement?: boolean;
}

export interface OrganTechnicalEvidence {
  descriptions: OrganTechnicalAssertion[];
  descriptionSourceCount: number;
  pitch: {
    preferredValue?: string | null;
    status: "unavailable" | "single_source" | "agreement" | "sources_differ" | string;
    assertions: OrganTechnicalAssertion[];
  };
  temperament: {
    preferredValue?: string | null;
    concept?: { id: string; label: string; matchKind: string } | null;
    status: "unavailable" | "single_source" | "agreement" | "sources_differ" | string;
    assertions: OrganTechnicalAssertion[];
    catalogRelation: {
      catalogSource: string;
      catalogSourceKey: string;
      catalogRecordCount: number;
      matchingRecordCount?: number;
      browseUrl: string;
      targetUrl?: string | null;
      exactRecordId?: string | null;
      exactRecordUrl?: string | null;
      state: "exact_record" | "candidate_set" | "controlled_concept_only" | "source_wording_only" | string;
      guidance: string;
      searchInterpretation?: TemperamentSearchInterpretation | null;
    };
  };
  facts?: OrganParityTechnicalFact[];
  factCount?: number;
  materialConflictCount?: number;
  wordingVariantCount?: number;
  functionalPipePositionCount?: number;
}

export interface ConfigurationChronologyEvidence {
  contract?: string;
  configurationDateState: string;
  transferAccountState?: string;
  recoveredAccountIds?: string[];
  accountQualification?: string;
  accountSourceFacts?: Array<{ family: string; label: string; wording: string; value: string; normalizedNumber?: number | null; additiveToOrganTotal: boolean; sourceReported: boolean }>;
  unresolvedStoplistRowCount?: number;
  completenessEstablished?: boolean;
  sourceBlocks?: Array<{ sourceSelector: string; htmlSha256: string }>;

  claims: Array<{ wording: string; expression: string; sourcePath: string; year?: number | null; qualification?: string; status?: string }>;
  sourceObservations: Array<{ kind: string; expression: string; datesConfiguration: boolean }>;
  sourceDateQualification?: { interpretation: string; sourceHeading: string; relativeYearBindingEstablished: boolean };
  sourceRelativeContext?: { temporalRelation: string; boundaryYear: number; sourceHeading: string };
  eventAssociations: Array<{ eventId: string; relation: string; causalRelationshipEstablished: boolean; temporalRelation?: string; boundaryYear?: number }>;
  eventAssociationState: string;
}

export interface SpecificationDescription {
  chronology?: ConfigurationChronologyEvidence | null;
  id: string;
  kind: "main" | "alternative";
  periodLabel: string;
  sourceHeading: string;
  timeKind: string;
  timeRelation: string;
  sortYear: number | null;
  subjectKind: "record_context" | "earlier_instrument";
  realization: "reported" | "proposed";
  coverage: string;
  stateId: string | null;
  revision: string;
  sourceRevision: string;
  sourcePaths: string[];
  normalizationProfile: string;
  stopCount: number;
  componentCount: number;
  source: { id: string; source: string; url?: string | null };
}

export interface DescriptionEntry {
  id: string;
  kind: string;
  label: string;
  pitch: string | null;
  wording: string;
  wordingKind: string;
  sourcePaths: string[];
  dates: string[];
  recoveredFromHeading: boolean;
}

export interface SpecificationDescriptionDetail extends SpecificationDescription {
  groups: Array<{ label: string; compass: string | null; entries: DescriptionEntry[] }>;
  technicalFacts: Array<{ id: string; family: string; label: string; value: string; sourcePath?: string; revision?: string;
    qualificationGuidance?: string; summaryEvidence?: OrganParityTechnicalFact["summaryEvidence"] }>;
  otherComponents: Array<{ id: string; kind: string; label: string; sourcePaths: string[] }>;
}

export async function fetchSpecificationDescription(organId: string, description: SpecificationDescription): Promise<SpecificationDescriptionDetail> {
  const result = await getJson<{ description: SpecificationDescriptionDetail }>(
    `/api/organs/${encodeURIComponent(organId)}/specification-descriptions/${encodeURIComponent(description.id)}?revision=${encodeURIComponent(description.revision)}`,
  );
  return result.description;
}

export interface EntityExportManifest {
  contract: string;
  entityKind: string;
  mdvsId: string;
  datasheetUrl: string;
  native: Array<{ key: string; label: string; mediaType: string; extension: string; url: string }>;
  profiles: Array<{ key: string; label: string; url: string; format?: string; mediaType?: string }>;
  sourceDataUrl: string;
  versioned: boolean;
}

export interface OrganDetail extends OrganCard {
  entityType: "organ";
  canonicalUrl: string;
  apiUrl: string;
  loadMode?: "surface" | "depth" | string;
  candidateContext?: { label: string; parentRelease: string } | null;
  deferredSections?: Partial<Record<"specification" | "history" | "activities" | "media" | "related" | "contributions" | "research", string>>;
  loadedSections?: Partial<Record<"specification" | "history" | "media" | "related" | "contributions", boolean>>;
  publicProfile?: PublicProfile;
  facts: OrganFact[];
  quickFacts: OrganFact[];
  identifiers: Array<{
    scheme: string;
    value: string;
    primary: boolean;
    url?: string | null;
    evidenceUrl?: string | null;
    linkLabel?: string | null;
    evidenceTarget?: EvidenceTargetPayload;
  }>;
  specification: {
    summary: Record<string, unknown>;
    rows: Array<{ label: string; value: string; source: OrganSource }>;
    divisions: Record<string, unknown>[];
    stops: Record<string, unknown>[];
    keyboards: Record<string, unknown>[];
    couplers: Record<string, unknown>[];
    accessories: Record<string, unknown>[];
    rawAvailable: boolean;
  };
  pipework?: PipeworkReadModel | null;
  sourceSpecifications?: OrganSourceSpecification[];
  specificationDescriptions?: SpecificationDescription[];
  technicalEvidence?: OrganTechnicalEvidence | null;
  timeline: Record<string, unknown>[];
  activities: Record<string, unknown>[];
  documentedStateSummary?: {
    state: "documented_assertions_available" | "not_documented_in_current_sources" | string;
    scope: "documented_source_assertions_not_present_condition" | string;
    label: string;
    assertionCount: number;
    controlledAssertionCount: number;
    sourceOnlyAssertionCount: number;
    datedAssertionCount: number;
    typeCount: number;
    sourceCount: number;
    firstYear?: number | null;
    lastYear?: number | null;
    yearLabel?: string | null;
    historyAvailable: boolean;
    guidance: string;
  };
  componentHierarchy: Array<{ id: string; label: string; count: number; items: OrganComponent[] }>;
  relatedEntities: RelatedEntity[];
  relatedSummary?: RelatedEntitySummary;
  virtualInstruments?: {
    available: boolean;
    organMdvsId?: string | null;
    total: number;
    linked: number;
    probableSuggestions: number;
    inheritedSubordinateCount: number;
    guidance: string;
    items: Array<{
      id: string;
      title: string;
      producer?: string | null;
      canonicalUrl: string;
      granularity?: string | null;
      relationshipState: "linked" | "probable" | string;
      confidenceTier?: string | null;
      method?: string | null;
      score?: number | null;
      sourceLinks?: Array<{ kind: string; label: string; url: string; sourceKey?: string; nativeIdentifier?: string }>;
    }>;
  };
  media: OrganMedia[];
  derivativeAssets: DerivativeAsset[];
  sources: OrganSource[];
  sourceComparisons?: OrganSourceComparison[];
  eventSourceComparisons?: EventSourceComparison[];
  eventSourceComparisonSummary?: EventSourceComparisonSummary;
  sourceComparisonSummary?: {
    groupCount?: number;
    statusCounts?: Record<string, number>;
    canonicalProjectionAllowed?: boolean;
  };
  contributions: Contribution[];
  researchSummary: Record<string, unknown>;
  citation: Citation;
  export?: EntityExportManifest | null;
}

export interface OrganSourceSpecification {
  id: string;
  source: OrganSource;
  preferred: boolean;
  displayPolicy: "preferred_source_projection" | "independently_attributed_source_alternative" | string;
  specification: OrganDetail["specification"];
  componentHierarchy: OrganDetail["componentHierarchy"];
  pipework?: PipeworkReadModel | null;
  parser?: {
    source?: string | null;
    status?: string | null;
    resourceCount?: number;
    sourceStopCount?: number | null;
    parsedStopCount?: number | null;
    technicalFactCount?: number;
    countDiscrepancy?: boolean;
  };
}

export interface PipeworkQuantity {
  kind: "asserted_physical_pipe_count" | "derived_pipe_position_count" | "resolved_pipe_continuant_count" | "pipe_manifestation_count" | string;
  label: string;
  exactCount?: number | null;
  lowerBound?: number | null;
  upperBound?: number | null;
  stateQualifier: string;
  method: string;
  formula?: string | null;
  inclusions: unknown[];
  exclusions: unknown[];
  assumptions: unknown[];
  sources?: Array<{
    id?: string | null;
    title?: string | null;
    url?: string | null;
  }>;
}

export interface PipeworkReadModel {
  status: "available" | string;
  contractVersion: "modavis.navigator-pipework/v1" | string;
  quantities: PipeworkQuantity[];
  registerQuantities?: RegisterPipeQuantity[];
  registerQuantitySummary?: {
    registerCount: number;
    quantifiedRegisterCount: number;
    nominalEstimateCount: number;
    sourceAssertedCount?: number;
    sharedOrExtendedCount: number;
    referenceablePositionCount?: number;
    nominalPitchAssumptionRegisterCount?: number;
    nonAdditive: true;
  };
  positionCandidates: Array<{
    candidateKey?: string | null;
    rankKey?: string | null;
    actuationNote?: string | null;
    soundingNote?: string | null;
    ordinal?: number | null;
    isMdvsIdentifier: false;
  }>;
  positionCandidateCount: number;
  source?: {
    id?: string | null;
    title?: string | null;
    url?: string | null;
    inputSha256?: string | null;
    derivationSha256?: string | null;
    algorithm?: { name?: string | null; version?: string | null } | null;
  };
  sources?: Array<{
    id?: string | null;
    title?: string | null;
    url?: string | null;
  }>;
  identityPolicy: {
    resolvedPhysicalPipeCount: number;
    aggregateCountsCreateIdentities: false;
    positionCandidatesAreIdentifiers: false;
    bulkIdentityMintingAllowed: false;
  };
  performanceMode: string;
  projectionAllowed: false;
}

export interface RegisterPipeQuantity {
  componentId?: string | null;
  registerLabel?: string | null;
  divisionLabel?: string | null;
  noteCount?: number | null;
  rankCountLower?: number | null;
  rankCountUpper?: number | null;
  functionalPositionLower?: number | null;
  functionalPositionUpper?: number | null;
  nominalPhysicalPipeLower?: number | null;
  nominalPhysicalPipeUpper?: number | null;
  countState: "nominal_register_estimate" | "shared_or_extended_rank" | string;
  method: string;
  formula: string;
  physicalRankIdentityEstablished: false;
  additiveToOrganTotal: false;
  projectionAllowed: false;
  actuationRange?: [number, number] | null;
  functionalPositionReferencesAvailable?: boolean;
  functionalPositionReferenceContract?: string;
  nominalSoundingPitch?: NominalPitchRelation | null;
  explanation: string;
}

export interface NominalPitchRelation {
  contractVersion: "modavis.nominal-stop-pitch/v1" | string;
  status: "assumed_from_stop_designation" | string;
  pitchFeet: {
    numerator: number;
    denominator: number;
    decimal: number;
    display: string;
  };
  frequencyRatioToEightFoot: {
    numerator: number;
    denominator: number;
    decimal: number;
  };
  nearestSemitoneOffset: number;
  centsFromNearestTwelveTetSemitone: number;
  sourceBasis: string;
  frequencyAnalysisConfirmed: false;
  physicalLengthMeasured: false;
  assumption: string;
}

export interface FunctionalPipePositionReference {
  id: string;
  referenceAliases?: string[];
  referenceKind: "derived_functional_pipe_position" | string;
  label: string;
  organId: string;
  componentId: string;
  registerLabel: string;
  divisionLabel?: string | null;
  stateQualifier: string;
  specificationRevisionSha256?: string;
  noteOrdinal: number;
  rankOrdinal: number;
  actuationMidi?: number | null;
  actuationNote?: string | null;
  soundingMidi?: number | null;
  soundingSemitoneNumber?: number | null;
  soundingNote?: string | null;
  soundingPitchStatus?: "assumed_from_stop_designation" | "not_established" | string;
  derivationMethod: string;
  formula: string;
  evidenceStatus: "deterministically_derived" | string;
  physicalPipeIdentityEstablished: false;
  projectionAllowed: false;
  identityMaterial?: Record<string, unknown>;
  canonicalPath?: string;
}

export interface FunctionalPipePositionPage {
  status: "available" | "unavailable" | string;
  reason?: string;
  contractVersion: string;
  organId: string;
  componentId: string;
  specificationRevisionSha256?: string;
  registerLabel?: string;
  divisionLabel?: string | null;
  offset?: number;
  limit?: number;
  total: number;
  items: FunctionalPipePositionReference[];
  selected?: FunctionalPipePositionReference | null;
  nominalPitchRelation?: NominalPitchRelation | null;
  referencePolicy?: {
    referencesAreStable: boolean;
    canonicalReferencesAreRevisionBound?: boolean;
    legacyV1ReferencesResolveToCanonicalV2?: boolean;
    referencesIdentifyFunctionalPositions: boolean;
    referencesIdentifyObservedPhysicalPipes: boolean;
    publicationLinksMayTargetReference: boolean;
    physicalReplacementDoesNotChangePositionReference: boolean;
  };
  projectionAllowed: false;
}

export interface PipePositionMeasurement {
  id: string;
  property: string;
  value?: number | string | null;
  rawValue?: string | null;
  unit?: string | null;
  uncertainty?: number | string | null;
  method?: string | null;
  timeSpanId?: number | null;
  statementId?: number | null;
  sourceFragmentId?: number | null;
  observationActivityId?: number | null;
  evidenceKind: "measured_observation" | string;
}

export interface PipePositionOccupancy {
  id: string;
  physicalPipeMdvsId?: string | null;
  physicalPipeLabel: string;
  physicalPipePageUrl?: string | null;
  pipeManifestationId?: number | null;
  timeSpanId?: number | null;
  statementId?: number | null;
  evidenceStatus?: string | null;
  confidence?: number | string | null;
}

export interface PipePositionRelatedResource {
  id: string;
  entityId?: number | null;
  mdvsId?: string | null;
  title: string;
  kind: "publication" | "entity" | string;
  relation: string;
  pageUrl?: string | null;
  timeSpanId?: number | null;
  statementId?: number | null;
  confidence?: number | string | null;
}

export interface FunctionalPipePositionDetail {
  status: "available" | string;
  contractVersion: "modavis.functional-pipe-position-detail/v1" | string;
  position: FunctionalPipePositionReference;
  organ: {
    id: string;
    mdvsId?: string | null;
    title: string;
    pageUrl: string;
  };
  register: {
    componentId: string;
    label?: string | null;
    divisionLabel?: string | null;
    positionCount?: number | null;
  };
  specificationRevisionSha256?: string | null;
  nominalPitchRelation?: NominalPitchRelation | null;
  persistence: {
    status: "virtual" | "persisted_with_evidence" | string;
    entity?: Record<string, unknown> | null;
    policy: string;
  };
  measurements: PipePositionMeasurement[];
  occupancies: PipePositionOccupancy[];
  relatedResources: PipePositionRelatedResource[];
  displayPolicy: {
    hideEmptyEvidenceSections: boolean;
    nominalPitchIsMeasurement: false;
    frequencyAnalysisMayConfirmNominalPitch: boolean;
    physicalPipeIdentityRequiresItemEvidence: boolean;
  };
  canonicalPath: string;
  projectionAllowed: false;
}

export interface OrganMapContextProject {
  version: string;
  name: string;
  mapView?: Record<string, unknown>;
  basemapStyleUrl?: string;
  layers: Array<{
    id: string;
    name?: string;
    visible?: boolean;
    metadata?: Record<string, unknown>;
  }>;
  metadata: {
    contract: string;
    organMdvsId: string;
    organTitle: string;
    locationLabel?: string | null;
    coordinateState?: string | null;
    currentPlaceCount: number;
    exactCoordinateCount?: number;
    fallbackCoordinateCount?: number;
    relocationCount: number;
    sameBuilderPlaceCount: number;
    sameBuilderExactPlaceCount: number;
    sameBuilderFallbackPlaceCount: number;
    sameBuilderBounded?: boolean;
    builderLabel?: string | null;
    builderOriginAvailable: boolean;
    builderOrigin?: {
      label?: string | null;
      placeMdvsId?: string | null;
      placeUrl?: string | null;
      relationship?: string | null;
      source?: string | null;
      sourceRecordId?: string | null;
    } | null;
    layerIds?: {
      current?: string[];
      relocations?: string[];
      sameBuilder?: string[];
      builderOrigin?: string[];
    };
    bounds?: {
      current?: number[] | null;
      relocations?: number[] | null;
      sameBuilder?: number[] | null;
      builderOrigin?: number[] | null;
    };
    historicalRouteAssertion?: false;
    canonicalMutationAllowed?: false;
  };
}

export interface ActorMapContextProject {
  version: string;
  name: string;
  mapView?: Record<string, unknown>;
  basemapStyleUrl?: string;
  layers: Array<{
    id: string;
    name?: string;
    visible?: boolean;
    metadata?: Record<string, unknown>;
  }>;
  metadata: {
    contract: string;
    actorMdvsId: string;
    actorTitle: string;
    actorCategory?: string | null;
    mappedOrganCount: number;
    mappedFeatureCount: number;
    relationshipCount?: number;
    bounded?: boolean;
    directoryUrl?: string;
    directoryLabel?: string;
    categories: Array<{
      key: string;
      code?: string | null;
      label: string;
      color: string;
      layerId: string;
      mappedOrganCount: number;
      targetOrganCount: number;
      activityCount: number;
      bounds?: number[] | null;
    }>;
    bounds?: number[] | null;
    canonicalMutationAllowed?: false;
    historicalRouteAssertion?: false;
  };
}

export interface OrganSourceComparison {
  source: string;
  orgelseiteId?: string | null;
  sourceRecordId?: string | null;
  label?: string | null;
  evidencePath?: string | null;
  sourceUrl?: string | null;
  baselineSource?: string | null;
  comparisonScope?: string | null;
  canonicalProjectionAllowed: false;
  groups: Array<{
    groupId: string;
    targetMdvsId: string;
    path: string;
    field: string;
    status: string;
    sourceCount: number;
    assertions: Array<{
      source: string;
      sourceRecordId: string;
      sourcePath: string;
      sourceUrl?: string | null;
      evidenceUrl?: string | null;
      value: unknown;
      certainty: string;
    }>;
  }>;
}

export interface EventSourceAssertion {
  assertionId: string;
  source: string;
  sourceRecordId?: string | null;
  sourcePath?: string | null;
  sourceUrl?: string | null;
  evidenceUrl?: string | null;
  value: unknown;
  certainty?: string | null;
  displayed?: boolean;
}

export interface EventSourceComparison {
  groupId: string;
  targetMdvsId?: string | null;
  path: string;
  field: string;
  status: string;
  sourceCount: number;
  assertions: EventSourceAssertion[];
  displayPolicy?: {
    baselineSource: string;
    rule: string;
    description: string;
  };
  canonicalProjectionAllowed: false;
}

export interface EventSourceComparisonSummary {
  status: string;
  groupCount: number;
  conflictingGroupCount: number;
  sourceCount: number;
  baselineSource: string;
  canonicalProjectionAllowed: false;
}

export interface PersistorPublicationStatus {
  ok?: boolean;
  mdvsId: string;
  status?: string;
  publicationState?: Record<string, unknown> | string;
  publicationAuthorized?: boolean;
  canonicalUri?: string | null;
  release?: string;
  readOnly?: boolean;
  currentIdentifiers?: {
    versionDoi?: Record<string, unknown> | null;
    conceptDoi?: Record<string, unknown> | null;
    dois?: Record<string, unknown>[];
  };
  doiSummary?: {
    versionDoi?: Record<string, unknown> | null;
    conceptDoi?: Record<string, unknown> | null;
    datasheetHash?: string | null;
    packageSnapshotHash?: string | null;
    manifestSha256?: string | null;
    congruenceStatus?: string | null;
    citationSnapshot?: Record<string, unknown>;
  };
  citationCongruence?: {
    status?: "matched" | "not_checked" | "mismatch" | "unavailable" | string;
    label?: string | null;
    archivedDatasheetHash?: string | null;
    navigatorDatasheetHash?: string | null;
    datasheetHashMatched?: boolean;
    persistorStatus?: string | null;
    packageSnapshotHash?: string | null;
    manifestSha256?: string | null;
    guidance?: string | null;
    basis?: string | null;
  };
  navigatorDatasheetHash?: string | null;
  identifiers?: Record<string, unknown>[];
  packages?: Record<string, unknown>[];
  files?: Record<string, unknown>[];
  validation?: Record<string, unknown>[];
  resolverTargets?: Record<string, unknown>[];
  citationGuidance?: Record<string, string>;
}

export interface OrganComponent {
  id: string;
  mdvsId?: string | null;
  kind: string;
  label: string;
  detail?: Record<string, unknown>;
  source?: OrganSource;
  sources?: OrganSource[];
  sourceMatches?: Array<{
    source?: string;
    sourceRecordId?: string;
    sourceUrl?: string;
    evidenceUrl?: string;
    matchBasis?: string;
    matchStatus?: string;
    coordinatesImmutable?: boolean;
    canonicalProjectionAllowed?: boolean;
    comparisonFields?: string[];
  }>;
  sourceComparison?: ComponentSourceComparison;
  sourcePath?: string | null;
  sourceEntityId?: string | null;
  trustState?: string | null;
  certainty?: string | null;
  sourceCount?: number;
  normalizerEvidenceCount?: number;
  normalizerEvidence?: NormalizerFactEvidence[];
  componentRelationCount?: number;
  componentRelations?: ComponentRelation[];
  canContribute?: boolean;
  canDispute?: boolean;
  evidenceTarget?: EvidenceTargetPayload;
  pipeQuantity?: RegisterPipeQuantity;
}

export interface ComponentSourceAssertion {
  assertionId: string;
  source: string;
  sourceRecordId?: string | null;
  sourceUrl?: string | null;
  evidenceUrl?: string | null;
  rawValue?: string | null;
  displayValue?: string | null;
  normalizedValue?: string | null;
  sourcePath?: string | null;
  displayed: boolean;
}

export interface ComponentComparisonValueGroup {
  normalizedValue?: string | null;
  displayValue?: string | null;
  sources: string[];
  assertionCount: number;
  displayed: boolean;
}

export interface ComponentFieldComparison {
  field: string;
  label: string;
  status: "conflicting" | "variant" | "corroborated" | string;
  variantKind?: "equivalent_notation" | "name_variant" | "division_name" | "source_wording" | string;
  displayedAssertionId: string;
  displayedSource: string;
  displayedValue?: string | null;
  sourceCount: number;
  assertions: ComponentSourceAssertion[];
  valueGroups: ComponentComparisonValueGroup[];
  canonicalProjectionAllowed: boolean;
}

export interface ComponentSourceComparison {
  componentId?: string | null;
  displayPolicy: {
    baselineSource: string;
    baselineAvailable: boolean;
    rule: string;
    description: string;
  };
  status: "conflicting" | "variant" | "corroborated" | string;
  conflictingFieldCount: number;
  variantFieldCount: number;
  corroboratedFieldCount: number;
  fields: ComponentFieldComparison[];
  canonicalProjectionAllowed: boolean;
}

export interface ComponentRelation {
  id?: string | null;
  relationshipType?: string | null;
  relationshipLabel?: string | null;
  targetComponentId?: string | null;
  targetLabel?: string | null;
  targetKind?: string | null;
  targetSourcePath?: string | null;
  targetGroup?: string | null;
  sourceField?: string | null;
  sourceValue?: string | null;
  sourcePath?: string | null;
  matchStatus?: string | null;
  candidateTargetCount?: number;
  navigationTarget?: boolean;
}

export interface RelatedEntity {
  id: string;
  label: string;
  kind: string;
  relationship: string;
  entityCategory?: string | null;
  entityGroupId?: string | null;
  entityPageUrl?: string | null;
  entityPageState?: string | null;
  entityPageLabel?: string | null;
  entityPageGuidance?: string | null;
  canonicalResolution?: CanonicalEntityResolution | null;
  candidateEntityId?: string | null;
  mdvsId?: string | null;
  source?: OrganSource;
  sourcePath?: string | null;
  evidenceType?: string | null;
  publicationState?: string | null;
  confidence?: number | null;
  reviewStatus?: string | null;
  matchStatus?: string | null;
  sessionId?: string | null;
  sourceRecordId?: string | null;
  summary?: string | null;
  activities?: string[];
  dates?: string[];
  relations?: Array<{
    id?: string | null;
    type?: string | null;
    label?: string | null;
    direction?: string | null;
    otherCandidateId?: string | null;
    sourcePath?: string | null;
    confidence?: number | null;
    reviewStatus?: string | null;
  }>;
  provenanceChain?: Array<{ stage?: string | null; owner?: string | null; id?: string | null; status?: string | null }>;
  evidenceTarget?: EvidenceTargetPayload;
}

export interface RelatedEntitySummary {
  total: number;
  sourceBacked: number;
  normalizerCandidates: number;
  relationCount: number;
  kinds?: Array<{ state: string; count: number }>;
  relationTypes?: Array<{ state: string; count: number }>;
}

export interface OrganMedia {
  id: string;
  mediaReferenceId?: string | null;
  imageIdentifier?: string | null;
  segmentationRunId?: string | null;
  title: string;
  kind: string;
  url?: string | null;
  thumbnailUrl?: string | null;
  status: string;
  deliveryState?: "user_requested_remote_preview" | "user_requested_privacy_embed" | "link_only" | "metadata_only" | "remote_embed_permitted" | string;
  source?: string | null;
  sourceUrl?: string | null;
  sourceCredit?: string | null;
  copyrightNotice?: string | null;
  dates?: string[];
  filename?: string | null;
  sourceRecordId: string;
  sourcePath?: string | null;
  hasByteBridge?: boolean;
  mediaFileId?: string | null;
  bitstreamId?: string | null;
  contentHash?: string | null;
  annotationAvailable?: boolean;
  evidenceTarget?: EvidenceTargetPayload;
}

export interface DerivativeAsset {
  id: string;
  label: string;
  assetType?: string | null;
  status: string;
  readinessState?: string | null;
  requiredAction?: string | null;
  inputCount: number;
  processorReady?: boolean;
  available?: boolean;
  inputKinds?: string[];
  inputProvenance?: Array<{
    id?: string | null;
    sourceRecordId?: string | null;
    sourcePath?: string | null;
    hasByteBridge?: boolean;
    contentHash?: string | null;
  }>;
}

export interface Contribution {
  id: string;
  targetType: string;
  targetId: string;
  targetMdvsId?: string | null;
  type: string;
  title: string;
  claim: Record<string, unknown>;
  evidenceTarget?: Record<string, unknown> | null;
  evidenceTargetKind?: string | null;
  evidenceTargetTitle?: string | null;
  evidenceTargetStatus?: string | null;
  comment?: string | null;
  evidenceUrl?: string | null;
  evidenceTitle?: string | null;
  license?: string | null;
  attachment?: ContributionAttachment;
  attachmentState?: string | null;
  attachmentLabel?: string | null;
  actorId?: string | null;
  visibilityState: string;
  reviewState: string;
  lifecycleState?: string | null;
  lifecycleLabel?: string | null;
  lifecycleDescription?: string | null;
  lifecycle?: ContributionLifecycle;
  routing?: Record<string, unknown>;
  workflowRequestId?: string | null;
  workflowStatus?: string | null;
  notificationId?: string | null;
  notificationStatus?: string | null;
  submittedAt?: string | null;
  decisionReason?: string | null;
}

export type NavigatorRole = "registered" | "moderator" | "admin" | "reviewer";

export interface NavigatorAccount {
  accountId: string;
  email: string;
  username?: string | null;
  displayName?: string | null;
  affiliation?: string | null;
  status?: string | null;
  roles: NavigatorRole[];
  preferences?: {
    showEvidenceDetails?: boolean;
    [key: string]: unknown;
  };
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface AuthSession {
  authenticated: boolean;
  account: NavigatorAccount | null;
  csrfToken?: string | null;
  expiresAt?: string | null;
}

export interface AuthChallenge {
  ok: boolean;
  authenticated: false;
  requiresVerification?: boolean;
  requiresMfa?: boolean;
  challengeId: string;
  email: string;
  expiresAt?: string | null;
  retryAfterSeconds?: number;
}

export interface SavedItem {
  savedItemId: string;
  itemType: string;
  itemId: string;
  label?: string | null;
  url?: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface UserNotification {
  notificationId: string;
  notificationType: string;
  title: string;
  body?: string | null;
  status: string;
  relatedUrl?: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: string | null;
  readAt?: string | null;
}

export interface AccountListResponse {
  items: NavigatorAccount[];
  total: number;
}

export interface ModerationSummary {
  counts: Record<string, number>;
  contributions: Contribution[];
}

export interface ContributionAttachment {
  type: string;
  label: string;
  state: string;
  stateLabel?: string | null;
  url?: string | null;
  title?: string | null;
  license?: string | null;
  candidateType?: string | null;
  owner?: string | null;
  route?: string | null;
  nextAction?: string | null;
  requiresByteRegistration?: boolean;
  processorReady?: boolean;
  processorReadinessLabel?: string | null;
}

export interface ContributionLifecycle {
  state: string;
  label: string;
  description: string;
  owner: string;
  nextAction: string;
  visibilityState: string;
  reviewState: string;
  proposalStatus?: string | null;
  workflowStatus?: string | null;
  notificationStatus?: string | null;
  workflowRequestId?: string | null;
  notificationId?: string | null;
  hasEvidenceUrl: boolean;
  hasAttachment?: boolean;
  hasStructuredClaim: boolean;
  hasComment: boolean;
  stages: Array<{ state: string; label: string; status: string }>;
}

export interface Citation {
  bibtex?: string;
  entityType: string;
  mdvsId: string;
  title: string;
  canonicalUrl: string;
  apiUrl: string;
  latestCitationUrl?: string | null;
  snapshotCitationUrl?: string | null;
  accessDate: string;
  lastUpdated?: string | null;
  rowVersion?: string | number | null;
  rowHash?: string | null;
  sourceHashes: string[];
  schemaVersions: Array<{ schemaKey?: string | null; schemaVersion?: string | null; schemaHash?: string | null }>;
  reviewState?: string | null;
  provenanceContext: Record<string, unknown>;
  versioning?: {
    status?: string | null;
    latestUrl?: string | null;
    snapshotUrl?: string | null;
    citeLatestLabel?: string | null;
    citeThisVersionLabel?: string | null;
    versionedSnapshotsAvailable?: boolean;
    immutableSnapshotsAvailable?: boolean;
    currentProjectionStable?: boolean;
    durability?: string | null;
    guidance?: string | null;
  };
  snapshotRequest?: {
    requestedSnapshotId?: string | null;
    currentSnapshotId?: string | null;
    matched?: boolean;
    status?: string | null;
    guidance?: string | null;
  };
  snapshot?: CitationSnapshot;
  recommendedCitation: string;
}

export interface CitationSnapshot {
  id: string;
  hash: string;
  kind: string;
  label: string;
  citationUrl?: string | null;
  generatedAt?: string | null;
  stable: boolean;
  versionedSnapshotsAvailable: boolean;
  durability?: string | null;
  citeLabel?: string | null;
  basis?: {
    sourceRecordCount?: number;
    sourceHashCount?: number;
    schemaVersionCount?: number;
    factCount?: number;
    sourceBackedFactCount?: number;
  };
}

export interface DocumentationReleaseNotice {
  id: string | number;
  type: "correction" | "superseded" | "deprecated" | "withdrawn" | string;
  text: string;
  replacementReleaseId?: number | null;
  replacementVersion?: string | null;
  createdAt?: string | null;
  createdBy?: string | null;
}

export interface DocumentationIdentifier {
  id?: number | string | null;
  mdvsId?: string | null;
  type: string;
  value: string;
  uri?: string | null;
  provider?: string | null;
  status?: string | null;
  primary?: boolean;
  registeredAt?: string | null;
}

export interface DocumentationArtifact {
  id?: number | string | null;
  mdvsId?: string | null;
  kind: string;
  format: string;
  filename: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
  storageProvider?: string | null;
  storageUri?: string | null;
  publicUrl?: string | null;
}

export interface DocumentationCitation {
  entityType: "documentation_page" | "documentation_release" | string;
  mdvsId?: string | null;
  title: string;
  creator: string;
  publisher: string;
  version: string;
  issuedAt: string;
  canonicalUrl: string;
  versionedUrl: string;
  doi?: string | null;
  licenseSpdx?: string | null;
  licenseUrl?: string | null;
  contentSha256?: string | null;
  corpusSha256?: string | null;
  recommendedCitation: string;
  stable: boolean;
  immutable: boolean;
}

export interface DocumentationRelease {
  id?: number | string | null;
  mdvsId?: string | null;
  versionLabel: string;
  title: string;
  issuedAt: string;
  corpusSha256: string;
  citationText?: string | null;
  creator: string;
  publisher: string;
  licenseSpdx: string;
  licenseUrl?: string | null;
  pageCount?: number | null;
  artifactCount?: number | null;
  pageUrl: string;
  artifacts?: DocumentationArtifact[];
  identifiers?: DocumentationIdentifier[];
  relations?: Array<{ type: string; targetType: string; targetIdentifier: string; targetUri?: string | null }>;
  notices?: DocumentationReleaseNotice[];
  citation?: DocumentationCitation;
}

export interface DocumentationPageSummary {
  mdvsId?: string | null;
  slug: string;
  title: string;
  summary?: string | null;
  category: string;
  audience: string;
  language?: string | null;
  ownerComponent?: string | null;
  contentSha256: string;
  related?: Array<{ kind?: string; value?: string }>;
  url: string;
  versionedUrl: string;
  releaseVersion: string;
}

export interface DocumentationPage extends DocumentationPageSummary {
  entityType: "documentation_page";
  canonicalKey: string;
  authors: Array<{ name: string }>;
  repositoryKey: string;
  sourcePath: string;
  sourceCommit: string;
  lastVerified?: string | null;
  markdown?: string | null;
  html: string;
  headings: Array<{ level: number; label: string; id: string }>;
  release: DocumentationRelease;
  notices: DocumentationReleaseNotice[];
  navigation?: {
    previous?: { slug: string; title: string; url: string } | null;
    next?: { slug: string; title: string; url: string } | null;
  };
  citation: DocumentationCitation;
}

export interface DocumentationHub {
  ok: boolean;
  status: string;
  latestRelease?: DocumentationRelease | null;
  counts: { pages: number; releases: number };
  categories: Array<{ value: string; count: number }>;
  audiences: Array<{ value: string; count: number }>;
  components: Array<{ value: string; count: number }>;
  featured: DocumentationPageSummary[];
  citationPolicy?: string | null;
}

export interface DocumentationPageList {
  ok: boolean;
  status: string;
  release?: DocumentationRelease;
  query?: string;
  items: DocumentationPageSummary[];
  total: number;
  limit?: number;
  offset?: number;
  hasMore?: boolean;
  facets?: Record<"categories" | "audiences" | "components" | "languages", Array<{ value: string; count: number }>>;
}

export type InternalDocumentationProfile = "internal" | "local-restricted";

export interface InternalDocumentationRelease {
  profile: InternalDocumentationProfile;
  versionLabel: string;
  title: string;
  issuedAt: string;
  corpusSha256: string;
  citationText?: string | null;
  creator?: string | null;
  publisher?: string | null;
  licenseSpdx?: string | null;
  pageCount: number;
}

export interface InternalDocumentationResource {
  key: string;
  title?: string | null;
  description?: string | null;
  kind?: string | null;
  pathAlias?: string | null;
  visibility?: string | null;
  lifecycle?: string | null;
  handling?: string | null;
  [key: string]: unknown;
}

export interface InternalDocumentationContentReview {
  status: string;
  outcome?: string | null;
  reviewedAt?: string | null;
  basis?: string | null;
  runtimeVerification?: string | null;
}

export interface InternalDocumentationReference {
  canonicalKey: string;
  title: string;
  summary?: string | null;
  repositoryKey?: string | null;
  authority?: string | null;
  lifecycle?: string | null;
  contentReview?: InternalDocumentationContentReview | null;
  url: string;
}

export interface InternalDocumentationTaskRoute {
  key: string;
  title: string;
  description?: string | null;
  repositoryKeys: string[];
  entrypoints: InternalDocumentationReference[];
  broaderProfileAvailable?: boolean;
}

export interface InternalDocumentationInformationBasis {
  key?: string | null;
  title?: string | null;
  path: string;
  landing?: InternalDocumentationReference | null;
  schemaVersion?: string | null;
  sourceSha256?: string | null;
  schemaSha256?: string | null;
  projectedSha256?: string | null;
  contentReview?: InternalDocumentationContentReview | null;
  domains?: string[];
  broaderProfileAvailable?: boolean;
}

export interface InternalDocumentationRelation {
  kind: string;
  value?: string | null;
  targetCanonicalKey?: string | null;
}

export interface InternalDocumentationResolvedRelation extends InternalDocumentationRelation {
  canonicalKey?: string | null;
  title: string;
  authority?: string | null;
  lifecycle?: string | null;
  url: string;
}

export interface InternalDocumentationPageSummary {
  slug: string;
  title: string;
  summary?: string | null;
  category?: string | null;
  audience?: string | null;
  language?: string | null;
  ownerComponent?: string | null;
  contentSha256: string;
  sortOrder?: number | null;
  visibility: string;
  sensitivity?: string[];
  authority: string;
  lifecycle: string;
  kind: string;
  environments?: string[];
  profiles?: InternalDocumentationProfile[];
  agentAccess?: string | null;
  humanAccess?: string | null;
  profile: InternalDocumentationProfile;
  releaseVersion: string;
  url: string;
  versionedUrl: string;
  taskTags: string[];
  contentReview?: InternalDocumentationContentReview | null;
  related?: InternalDocumentationRelation[];
  resolvedRelated?: InternalDocumentationResolvedRelation[];
}

export interface InternalDocumentationPage extends InternalDocumentationPageSummary {
  canonicalKey?: string | null;
  authors: Array<{ name: string }>;
  repositoryKey: string;
  sourcePath: string;
  sourceCommit: string;
  sourceState: string;
  lastVerified?: string | null;
  headings: Array<{ level: number; label: string; id: string }>;
  markdown: string;
  html: string;
  text: string;
  release: InternalDocumentationRelease;
}

export type InternalDocumentationFacets = Record<
  "categories" | "audiences" | "components" | "languages" | "kinds" | "authorities" | "lifecycles" | "taskTags" | "reviewStatuses",
  Array<{ value: string; count: number }>
>;

export interface InternalDocumentationHub {
  profile: InternalDocumentationProfile;
  access?: Record<string, unknown> | null;
  latestRelease: InternalDocumentationRelease;
  counts: { pages: number; resources: number };
  facets: InternalDocumentationFacets;
  resources: InternalDocumentationResource[];
  linkWarnings: Array<Record<string, unknown>>;
  agentIndex?: Record<string, unknown> | null;
  readFirst: InternalDocumentationReference[];
  taskRoutes: InternalDocumentationTaskRoute[];
  informationBasis?: InternalDocumentationInformationBasis | null;
}

export interface InternalDocumentationPageList {
  profile: InternalDocumentationProfile;
  items: InternalDocumentationPageSummary[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  facets: InternalDocumentationFacets;
}

export interface DocumentationReleasePlan {
  ok: boolean;
  status?: string;
  planId?: string;
  confirmationPhrase?: string;
  release?: DocumentationRelease;
  pageCount?: number;
  archiveSha256?: string;
  byteSize?: number;
  changes?: { added: string[]; changed: string[]; removed: string[] };
  previewPages?: Array<{ slug: string; title: string; change: "added" | "changed" | string }>;
  canPublish?: boolean;
  warnings?: string[];
  error?: string;
  detail?: string;
}

export interface ExploreResponse {
  query: string;
  counts: { organs: number; sourceEvidence: number; unreviewedContributions: number; georeferencingBacklog?: number };
  featuredOrgans: OrganCard[];
  recentOrgans: OrganCard[];
  mapItems: Array<{ id: string; mdvsId: string; title: string; location?: string | null; coordinates?: { lat: number; lon: number } | null; certainty?: string | null }>;
  georeferencingItems?: OrganCard[];
  georeferencingQueue?: {
    limit: number;
    offset: number;
    visible: number;
    total: number;
    unfilteredTotal?: number;
    hasPrevious?: boolean;
    hasMore: boolean;
    previousOffset?: number;
    nextOffset?: number;
    nextLimit?: number;
    filters?: {
      priorityLabel?: string;
      status?: string;
      country?: string;
    };
    availableFilters?: {
      priorities?: Array<{ value: string; label: string; count: number }>;
      statuses?: Array<{ value: string; label: string; count: number }>;
      countries?: Array<{ value: string; label: string; count: number }>;
    };
  };
  filters: Array<{ id: string; label: string; available: boolean }>;
}

export interface CanonicalEntityResolution {
  status?: string | null;
  label?: string | null;
  entityState?: string | null;
  entityStateLabel?: string | null;
  entityStateDescription?: string | null;
  canonicalEntityId?: string | number | null;
  mdvsId?: string | null;
  canonicalLabel?: string | null;
  canonicalUrl?: string | null;
  apiUrl?: string | null;
  guidance?: string | null;
  identityAssertion?: boolean | null;
  matchRule?: string | null;
  sourceActorRouteId?: string | null;
  sourceActorUrl?: string | null;
}

export interface EntitySearchResult {
  kind: "organ" | "candidate_entity" | string;
  entityType?: string;
  entityState?: string | null;
  entityStateLabel?: string | null;
  entityStateDescription?: string | null;
  searchGroup?: string | null;
  searchGroupLabel?: string | null;
  searchRank?: number | null;
  globalSearchRank?: number | null;
  targetId: string;
  mdvsId?: string | null;
  title: string;
  summary?: string | null;
  url?: string | null;
  targetOrganId?: string | null;
  targetOrganMdvsId?: string | null;
  targetOrganTitle?: string | null;
  sourceRecordId?: string | null;
  sessionId?: string | null;
  sourcePath?: string | null;
  confidence?: number | null;
  reviewStatus?: string | null;
  matchStatus?: string | null;
  badges?: string[];
  canonicalResolution?: CanonicalEntityResolution | null;
  match?: {
    field?: string | null;
    value?: string | null;
    label?: string | null;
  };
}

export interface EntitySearchResponse {
  query: string;
  items: EntitySearchResult[];
  groups?: Array<{
    id: string;
    label: string;
    rank?: number | null;
    total?: number;
    items: EntitySearchResult[];
  }>;
  total: number;
  limit: number;
  counts?: {
    organs?: number;
    canonicalActors?: number;
    candidateEntities?: number;
    vmiCandidates?: number;
  };
}

export interface CandidateEntitySample {
  candidateId?: string | null;
  sourceRecordId?: string | null;
  sessionId?: string | null;
  organId?: string | null;
  organMdvsId?: string | null;
  organTitle?: string | null;
  sourcePath?: string | null;
  confidence?: number | null;
  reviewStatus?: string | null;
  matchStatus?: string | null;
}

export interface PersonSummary {
  id: string;
  kind: "canonical_person" | "source_mentioned_person" | string;
  publicationState: "canonical" | "source_mentioned" | string;
  publicationStateLabel: string;
  entityClass?: string | null;
  entityClassLabel?: string | null;
  title: string;
  label: string;
  mdvsId?: string | null;
  canonicalUrl?: string | null;
  detailUrl?: string | null;
  candidateUrl?: string | null;
  apiUrl?: string | null;
  summary?: string | null;
  lifeDate?: string | null;
  sourceKeys: string[];
  sourceLabels: string[];
  sourceRecordCount: number;
  candidateCount: number;
  occurrenceCount: number;
  associatedOrganCount?: number | null;
  aliases?: string[];
  dates?: Array<Record<string, unknown>>;
  sampleOrgans?: CandidateEntitySample[];
  sourcePaths?: string[];
  evidenceSummary?: string | null;
  reviewStates?: Array<{ state: string; count: number }>;
  matchStates?: Array<{ state: string; count: number }>;
  roleTags: string[];
  identifiers?: Array<{ scheme?: string | null; value?: string | null; url?: string | null }>;
  badges?: string[];
  updatedAt?: string | null;
}

export interface PersonListResponse {
  query: string;
  items: PersonSummary[];
  total: number;
  limit: number;
  offset: number;
  page: {
    loaded: number;
    hasMore: boolean;
    nextOffset?: number | null;
    previousOffset?: number | null;
  };
  filters: {
    source?: string;
    publicationState?: string;
    role?: string;
    entityClass?: string;
    sort?: string;
  };
  facets: {
    sources: Array<{ source: string; label: string; count: number }>;
    publicationStates: Array<{ state: string; label: string; count: number }>;
    roles: Array<{ role: string; label: string; count: number }>;
    entityClasses: Array<{ class: string; label: string; count: number }>;
    sortOptions: Array<{ value: string; label: string }>;
  };
  counts: {
    canonical: number;
    sourceMentioned: number;
    musixplora: number;
  };
  coverage?: {
    publicationStates: Array<{ state: string; label: string; count: number }>;
    sources: Array<{ source: string; label: string; count: number }>;
    entityClasses: Array<{ class: string; label: string; count: number }>;
    topSources: Array<{ source: string; label: string; count: number }>;
    completeness?: {
      status?: string;
      candidateRowLimit?: number;
      candidateRowsScanned?: number;
      guidance?: string;
    };
  };
  source?: string;
}

export interface CandidateEntityGroup {
  id: string;
  kind: "candidate_entity_group" | string;
  category: string;
  entityType: string;
  entityState?: string | null;
  entityStateLabel?: string | null;
  entityStateDescription?: string | null;
  label: string;
  title: string;
  summary?: string | null;
  occurrenceCount: number;
  sourceRecordCount: number;
  associatedOrganCount?: number | null;
  confidence?: number | null;
  reviewStates?: Array<{ state: string; count: number }>;
  matchStates?: Array<{ state: string; count: number }>;
  countries?: Array<{ country: string; count: number }>;
  locationReadinessStates?: Array<{ state: string; label: string; count: number }>;
  georeferencingPriority?: number | null;
  georeferencingPriorityLabel?: string | null;
  georeferencingContext?: CandidatePlaceGeoreferencingContext | null;
  sampleOrgans: CandidateEntitySample[];
  badges?: string[];
  candidateIds?: string[];
  candidateProfile?: CandidateEntityProfile;
  canonicalResolution?: CanonicalEntityResolution | null;
  canonicalUrl?: string | null;
}

export interface CandidateEntityDetail extends CandidateEntityGroup {
  detailStatus?: string | null;
  evidenceMode?: {
    status?: string | null;
    label?: string | null;
    description?: string | null;
    basis?: {
      candidateIds?: string[];
      reviewStates?: Array<{ state: string; count: number }>;
      sessionIds?: string[];
    };
  } | null;
  sourceVariants?: Array<{
    id: string;
    label?: string | null;
    candidateId?: string | null;
    sourceRecordId?: string | null;
    sourcePath?: string | null;
    organId?: string | null;
    organMdvsId?: string | null;
    organTitle?: string | null;
    reviewStatus?: string | null;
    matchStatus?: string | null;
    summary?: string | null;
  }>;
  conflictSummary?: {
    status?: string | null;
    label?: string | null;
    variantCount?: number | null;
    signalCount?: number | null;
    signals?: string[];
    guidance?: string | null;
    canonicalDecision?: string | null;
  } | null;
  canonicalPromotion?: {
    status?: string | null;
    label?: string | null;
    processorReference?: string | null;
    canonicalEntityId?: string | null;
    canonicalUrl?: string | null;
    canonicalMdvsId?: string | null;
    canonicalLabel?: string | null;
    latestProjectionUrl?: string | null;
    candidateCount?: number | null;
    processorHandoff?: {
      status?: string | null;
      module?: string | null;
      jobType?: string | null;
      endpoint?: string | null;
      requiresActor?: boolean | null;
      permission?: string | null;
      sessionIds?: string[];
      payloadTemplate?: Record<string, unknown>;
      idempotencyPolicy?: string | null;
    };
    guidance?: string | null;
  } | null;
  classificationPlan?: {
    status?: string | null;
    label?: string | null;
    owner?: string | null;
    scope?: string | null;
    navigatorAction?: string | null;
    evidenceMode?: string | null;
    eligible?: boolean | null;
    eligibilityReason?: string | null;
    requiresSlm?: boolean | null;
    deterministicClassification?: {
      matched?: boolean | null;
      class?: string | null;
      confidence?: number | null;
      matchedTerms?: string[];
      rule?: string | null;
      basis?: string | null;
    } | null;
    workItemId?: string | null;
    dedupeNameKey?: string | null;
    dedupePolicy?: string | null;
    occurrenceCount?: number | null;
    sourceRecordCount?: number | null;
    associatedOrganCount?: number | null;
    sourcePaths?: string[];
    processorJob?: {
      module?: string | null;
      jobType?: string | null;
      executionMode?: string | null;
      dedupeKey?: string | null;
      requiresActor?: boolean | null;
    };
    persistence?: {
      status?: string | null;
      table?: string | null;
      persistEndpoint?: string | null;
      receiptsEndpoint?: string | null;
      systemOfRecord?: string | null;
      navigatorRole?: string | null;
    };
    promptContract?: Record<string, unknown>;
  } | null;
  classificationEvidence?: {
    status?: string | null;
    owner?: string | null;
    classificationId?: string | null;
    dedupeNameKey?: string | null;
    total?: number | null;
    counts?: {
      ingestedReceipts?: number;
      slmClassifications?: number;
    };
    latestEvent?: BuilderNameClassificationParadataEvent | null;
    items?: BuilderNameClassificationParadataEvent[];
    truthBoundary?: string | null;
    guidance?: string | null;
    error?: string | null;
  } | null;
  moderationActions?: {
    status?: string | null;
    owner?: string | null;
    candidateCount?: number | null;
    visibleCandidateIds?: string[];
    reviewBatch?: {
      status?: string | null;
      endpoint?: string | null;
      method?: string | null;
      requiresActor?: boolean | null;
      permission?: string | null;
      payloadTemplate?: Record<string, unknown>;
      confirmationPolicy?: string | null;
    };
    splitMerge?: {
      status?: string | null;
      actions?: string[];
      owner?: string | null;
      guidance?: string | null;
    };
    canonicalRoute?: string | null;
  } | null;
  georeferencingActionPlan?: {
    status?: string | null;
    owner?: string | null;
    sourceVariantCount?: number | null;
    packetCount?: number | null;
    endpoint?: string | null;
    jobType?: string | null;
    requiresActor?: boolean | null;
    permission?: string | null;
    payloadTemplate?: Record<string, unknown>;
    guidance?: string | null;
  } | null;
  canonicalBoundary?: {
    status?: string | null;
    label?: string | null;
    isCanonical?: boolean | null;
    canonicalEntityId?: string | null;
    canonicalUrl?: string | null;
    canonicalMdvsId?: string | null;
    canonicalLabel?: string | null;
    latestProjectionUrl?: string | null;
    reviewOwner?: string | null;
    promotionOwner?: string | null;
    mergePolicy?: string | null;
    candidateCount?: number | null;
    sourceRecordCount?: number | null;
    reviewStates?: Array<{ state: string; count: number }>;
    matchStates?: Array<{ state: string; count: number }>;
    guidance?: string | null;
  };
  canonicalResolution?: CanonicalEntityResolution | null;
  associatedOrgans?: Array<{
    id?: string | null;
    mdvsId?: string | null;
    title?: string | null;
    sourceRecordId?: string | null;
    sourcePath?: string | null;
    reviewStatus?: string | null;
    matchStatus?: string | null;
    canonicalUrl?: string | null;
    apiUrl?: string | null;
  }>;
  sourceRecords?: SourceRecordSummary[];
  fileLinks?: Array<{
    id: string;
    title?: string | null;
    kind?: string | null;
    sourceRecordId?: string | null;
    url?: string | null;
    filePageUrl?: string | null;
  }>;
  relationshipPreview?: CandidateEntityProfile["relationshipPreview"];
  citation?: {
    entityType?: string | null;
    entityId?: string | null;
    label?: string | null;
    latestUrl?: string | null;
    apiUrl?: string | null;
    accessDate?: string | null;
    recommendedCitation?: string | null;
    sourceRecordCount?: number | null;
    occurrenceCount?: number | null;
    candidateCount?: number | null;
    candidateIds?: string[];
    snapshot?: {
      id?: string | null;
      status?: string | null;
      kind?: string | null;
      stable?: boolean | null;
      immutable?: boolean | null;
      basis?: {
        candidateCount?: number | null;
        sourceRecordCount?: number | null;
        occurrenceCount?: number | null;
      };
    };
    versioning?: {
      status?: string | null;
      latestUrl?: string | null;
      snapshotUrl?: string | null;
      immutableSnapshotAvailable?: boolean | null;
      guidance?: string | null;
    };
    provenanceContext?: {
      owner?: string | null;
      canonicalBoundary?: string | null;
      sourceRecordIds?: string[];
      candidateIds?: string[];
      sessionIds?: string[];
      sourcePaths?: string[];
      reviewStates?: Array<{ state: string; count: number }>;
      matchStates?: Array<{ state: string; count: number }>;
    };
    guidance?: string | null;
  };
  identityResolution?: {
    resolvedAliasCount: number;
    authority: string;
    differentAuthorityIdentifiersRemainDistinct: boolean;
    releaseVersion?: string | null;
    projectionId?: string | null;
    decisionPolicyId?: string | null;
  };
}

export interface ActorCollectionPage<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  query: string;
  actorMdvsId: string;
}

export interface CanonicalActorDetail {
  eventEvidence?: {
    eventCount: number;
    sourceRecordCount: number;
    combinedSourceRecordCount: number | null;
    directoryUrl: string;
    apiUrl: string;
    scope: string;
  } | null;
  collectionDelivery?: {
    mode: "paginated";
    scope?: string;
    pageSize: number;
    mentionsUrl: string;
    relationshipsUrl: string;
    sourceCollections: Array<{ source: string; count: number }>;
  };
  id: string;
  mdvsId: string;
  resolvedFromMdvsId?: string | null;
  coreEntityId: number;
  kind: "canonical_actor" | string;
  category: "people" | string;
  title: string;
  label: string;
  entityType: string;
  entityTypeCode?: string | null;
  entityTypeLabel?: string | null;
  classification?: string | null;
  classificationConfidence?: number | null;
  classificationEventType?: string | null;
  status?: string | null;
  statusId?: number | null;
  canonicalUrl: string;
  apiUrl: string;
  export?: EntityExportManifest | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  profile?: {
    names?: Array<Record<string, unknown>>;
    preferredNames?: Array<Record<string, unknown>>;
    variantNames?: Array<Record<string, unknown>>;
    dates?: Array<Record<string, unknown>>;
    identifiers?: Array<Record<string, unknown>>;
    statusItems?: Array<Record<string, unknown>>;
    properties?: Array<Record<string, unknown>>;
    sourceSnapshots?: Array<Record<string, unknown>>;
    coordinates?: { lat: number; lon: number } | null;
    hierarchy?: {
      country?: string | null;
      town?: string | null;
    } | null;
    sourceHierarchy?: PlaceComponentAssertion[];
    providerHierarchy?: PlaceComponentAssertion[];
    administrativeHierarchy?: Array<{
      role: string;
      name: string;
      placeId?: string | null;
      placeKind?: string | null;
      sameAsPriorLevel?: boolean;
    }>;
    structuredAddress?: {
      house_number?: string | null;
      road?: string | null;
      postcode?: string | null;
    } | null;
    structuredAddresses?: {
      source?: PlaceComponentAssertion[];
      provider?: PlaceComponentAssertion[];
    };
    providerNames?: string[];
    qualifiedNameVariants?: Array<{
      name: string;
      nameKind: string;
      language?: string | null;
      evidenceLayer?: string;
      sourceRef?: string;
    }>;
    structuredPlaceEvidence?: {
      provider?: string | null;
      providerRelease?: string | null;
      providerResultId?: string | null;
      evidenceKind?: string | null;
      historicalNamesAvailable?: boolean;
      languageQualifiedNamesAvailable?: boolean;
      terminalOutcome?: string | null;
      decisionSha256?: string | null;
      coordinateState?: string | null;
      coordinateOutcome?: string | null;
      coordinateDecisionSha256?: string | null;
      providerBindingCount?: number;
      physicalPlaceCount?: number;
      sourceAssertionCount?: number;
      providerAssertionCount?: number;
      qualifiedNameCount?: number;
    } | null;
    placeKind?: string | null;
  };
  publicProfile?: {
    status?: string | null;
    summary?: string | null;
    factCount?: number;
    evidenceCount?: number;
    relationshipCount?: number;
    relationshipPreview?: ActorRelationshipPreview;
    sections?: Array<{
      key?: string | null;
      title?: string | null;
      summary?: string | null;
      emptyState?: string | null;
      items?: Array<{
        label?: string | null;
        value?: string | null;
        type?: string | null;
        url?: string | null;
        criticality?: string | null;
        source?: string | null;
        metadata?: Record<string, unknown>;
        statement?: string | null;
        relatedLabel?: string | null;
        relatedMdvsId?: string | null;
        relatedUrl?: string | null;
        relatedEntityState?: string | null;
        relatedStatusLabel?: string | null;
        relatedActionLabel?: string | null;
        relationType?: string | null;
        direction?: string | null;
        confidence?: number | string | null;
        sourceRecordId?: string | null;
        evidenceSummary?: string | null;
      }>;
    }>;
  };
  vocabularyEvidence?: {
    status?: string | null;
    items?: Array<{
      id?: string | number | null;
      sourceRecordId?: string | null;
      sourceKey?: string | null;
      sourceTable?: string | null;
      sourceField?: string | null;
      sourceCategory?: string | null;
      recordType?: string | null;
      entityType?: string | null;
      languageCode?: string | null;
      observedValue?: string | null;
      observedAt?: string | null;
      reviewState?: string | null;
      conceptCount?: number;
      context?: Record<string, unknown>;
      sourceTerm?: VocabularySourceTerm;
      mappings?: VocabularyMapping[];
      citation?: {
        vocabularyRelease?: VocabularyRelease | null;
        guidance?: string | null;
      };
    }>;
    total?: number;
    reviewStates?: Record<string, number>;
    warnings?: Array<{
      id?: string | null;
      label?: string | null;
      criticality?: string | null;
      count?: number;
      reviewState?: string | null;
      guidance?: string | null;
    }>;
    warningSummary?: {
      hasWarnings?: boolean;
      warningCount?: number;
      highestCriticality?: string | null;
      byCriticality?: Record<string, number>;
      byReviewState?: Record<string, number>;
      unresolvedLanguageCount?: number;
    };
    sourceRecordIds?: string[];
    excludedSourceRecords?: Array<{ sourceRecordId?: string | null; sourcePath?: string | null; reason?: string | null }>;
    latestRelease?: VocabularyRelease | null;
    guidance?: string | null;
  };
  relationships?: Array<{
    id?: number | string | null;
    direction?: string | null;
    relationType?: string | null;
    relationLabel?: string | null;
    label?: string | null;
    relationship?: string | null;
    kind?: string | null;
    mdvsId?: string | null;
    entityPageUrl?: string | null;
    relatedLabel?: string | null;
    relatedMdvsId?: string | null;
    relatedCoreEntityId?: number | string | null;
    relatedUrl?: string | null;
    relatedEntityState?: string | null;
    relatedDomainKind?: string | null;
    relatedStatusLabel?: string | null;
    relatedActionLabel?: string | null;
    relatedGeography?: {
      label?: string | null;
      city?: string | null;
      region?: string | null;
      country?: string | null;
    } | null;
    confidence?: number | string | null;
    sourceRelationCategory?: string | null;
    sourceRoleCode?: string | null;
    sourceRoleLabel?: string | null;
    sourceGeneration?: number | null;
    sourceGenerationLabel?: string | null;
    relationCorrectionState?: string | null;
    relationCorrectionEvidenceSha256?: string | null;
    sourceRecordId?: string | null;
    sourceReferenceId?: string | null;
    evidenceSummary?: string | null;
    sessionId?: string | null;
    candidateRelationId?: string | null;
    sourcePath?: string | null;
  }>;
  candidateSupport: Array<{
    candidateId?: string | null;
    sessionId?: string | null;
    sourceRecordId?: string | null;
    sourcePath?: string | null;
    label?: string | null;
    reviewStatus?: string | null;
    matchStatus?: string | null;
    promotionStatus?: string | null;
    updatedAt?: string | null;
    sourceId?: string | null;
    sourceUrl?: string | null;
    sourceStatus?: string | null;
    primaryIdentifier?: { scheme?: string | null; value?: string | null } | null;
    normalized?: Record<string, unknown>;
    sourceData?: Record<string, unknown>;
  }>;
  candidateSupportCount: number;
  labelInterpretations?: Array<{ originalLabel: string; normalizedLabel: string; referenceWording: string; sourceRecordId: string; sourceRevisionSha256: string; rawSnapshotSha256: string }>;
  identityAliases?: Array<{
    mdvsId: string;
    label: string;
    authorityMusiXploraId?: string | null;
    sharedEvidenceCount: number;
  }>;
  identityProjection?: {
    releaseVersion?: string | null;
    projectionId?: string | null;
    decisionPolicyId?: string | null;
    aliasSetSha256?: string | null;
    evidenceSetSha256?: string | null;
    differentAuthorityIdentifiersRemainDistinct?: boolean;
  } | null;
  sourceRecords: Array<{
    id: string;
    sourceId?: string | null;
    primaryIdentifier?: { scheme?: string | null; value?: string | null } | null;
    status?: string | null;
    url?: string | null;
    candidateCount?: number;
  }>;
  sourceRecordCount: number;
  sourceFamilyCount?: number;
  sourceMentions?: Array<{
    sourceRecordId: string;
    sourceFamily: string;
    sourceIdentifier?: string | null;
    sourcePageUrl?: string | null;
    originalSourceUrl?: string | null;
    relationshipCount: number;
    relatedItems: Array<{
      label?: string | null;
      url?: string | null;
      kind?: string | null;
      relationship?: string | null;
    }>;
  }>;
  canonicalResolution?: CanonicalEntityResolution | null;
  guidance?: string | null;
  promotionState?: string | null;
}

export interface StructuredNameDetail {
  id: string;
  mdvsId: string;
  kind: "structured_name" | string;
  title: string;
  canonicalUrl: string;
  apiUrl: string;
  export?: EntityExportManifest | null;
  type: {
    mdvsId: string;
    code: string;
    name: string;
    description?: string | null;
    parent?: { mdvsId: string; code: string; name: string } | null;
  };
  forms: {
    display?: string | null;
    canonical?: string | null;
    fullOverride?: string | null;
    abbreviation?: string | null;
    romanization?: string | null;
    transliteration?: string | null;
    ipaPronunciation?: string | null;
  };
  components: Array<{ key: string; label: string; value: string }>;
  displayOrder?: string | null;
  verificationScore?: number | null;
  isNative?: boolean | null;
  language?: {
    mdvsId: string;
    name: string;
    endonym: string;
    iso6391?: string | null;
    iso6392?: string | null;
    bcp47?: string | null;
  } | null;
  script?: { mdvsId: string; name: string; endonym?: string | null } | null;
  temporality?: {
    mdvsId: string;
    rawExpression?: string | null;
    start?: string | null;
    startYear?: number | null;
    end?: string | null;
    endYear?: number | null;
  } | null;
  variants: Array<{
    mdvsId: string;
    value: string;
    type: { mdvsId: string; code: string; name: string };
    language?: StructuredNameDetail["language"];
  }>;
  relatedEntities: Array<{
    mdvsId: string;
    label: string;
    kind: string;
    pageUrl?: string | null;
    typeCode?: string | null;
    typeName?: string | null;
  }>;
  createdAt?: string | null;
  updatedAt?: string | null;
  releaseVersion?: string | null;
  guidance?: string | null;
}

export interface PlaceComponentAssertion {
  role: string;
  value: string;
  evidenceLayer?: "source" | "provider" | string;
  componentClass?: "hierarchy" | "address" | "source_metadata" | string;
  language?: string | null;
  sourceRef?: string;
  providerResultId?: string | null;
  evidenceSha256?: string;
}

export interface CandidatePlaceGeoreferencingContext {
  status: string;
  label: string;
  sourceCount: number;
  sourceRecordIds?: string[];
  priority?: number | null;
  priorityLabel?: string | null;
  countries?: Array<{ country: string; count: number }>;
  locationReadinessStates?: Array<{ state: string; label: string; count: number }>;
  packets?: Array<{
    packetId?: string | null;
    sourceRecordId?: string | null;
    organId?: string | null;
    organMdvsId?: string | null;
    organTitle?: string | null;
    queryText?: string | null;
    status?: string | null;
    priority?: number | null;
    priorityLabel?: string | null;
    country?: string | null;
    route?: string | null;
    nextAction?: string | null;
    reviewConstraint?: string | null;
  }>;
  route?: string | null;
  nextAction?: string | null;
  canonicalPlaceStatus?: string | null;
  guidance?: string | null;
}

export interface CandidateEntityProfile {
  status: string;
  statusLabel: string;
  canonicalStatus: string;
  canonicalStatusLabel: string;
  entityState?: string | null;
  entityStateLabel?: string | null;
  entityType?: string | null;
  label?: string | null;
  aliases: string[];
  aliasCount: number;
  candidateIds: string[];
  sourceRecordIds: string[];
  sessionIds: string[];
  sourcePaths: string[];
  reviewStates: Array<{ state: string; count: number }>;
  matchStates: Array<{ state: string; count: number }>;
  sampleOrgans: CandidateEntitySample[];
  relationshipPreview?: Array<{
    id: string;
    relationshipType: string;
    relationshipLabel: string;
    subjectLabel?: string | null;
    targetOrganId?: string | null;
    targetOrganMdvsId?: string | null;
    targetOrganTitle?: string | null;
    sourceRecordId?: string | null;
    sourcePath?: string | null;
    candidateId?: string | null;
    evidenceType?: string | null;
    canonicalStatus?: string | null;
    guidance?: string | null;
  }>;
  identityGuidance?: string | null;
  reviewGuidance?: string | null;
  canonicalResolution?: CanonicalEntityResolution | null;
}

export interface CandidateEntityGroupResponse {
  category: string;
  query: string;
  filters?: {
    country?: string;
    locationState?: string;
    reviewState?: string;
    matchState?: string;
    sort?: string;
  };
  facets?: {
    countries?: Array<{ country: string; count: number }>;
    reviewStates?: Array<{ state: string; count: number }>;
    matchStates?: Array<{ state: string; count: number }>;
    locationReadinessStates?: Array<{ state: string; label: string; count: number }>;
    sortOptions?: Array<{ value: string; label: string }>;
  };
  items: CandidateEntityGroup[];
  total: number;
  limit: number;
  candidateRows: number;
}

export interface VmiCandidateLink {
  id: string;
  label: string;
  url?: string | null;
  kind?: string | null;
  sourcePath?: string | null;
  status?: string | null;
}

export interface VmiCandidate {
  id: string;
  kind: "vmi_candidate_group" | string;
  status: string;
  statusLabel?: string | null;
  canonicalStatus?: string | null;
  canonicalStatusLabel?: string | null;
  entityState?: string | null;
  entityStateLabel?: string | null;
  title: string;
  summary?: string | null;
  organId?: string | null;
  organMdvsId?: string | null;
  organTitle?: string | null;
  sourceRecordId?: string | null;
  sourceLabel?: string | null;
  linkCount: number;
  links: VmiCandidateLink[];
  guidance?: string | null;
}

export interface VmiCandidateResponse {
  query: string;
  items: VmiCandidate[];
  total: number;
  limit: number;
  status: string;
  guidance?: string | null;
}

export interface OrganListResponse {
  items: OrganCard[];
  total: number;
  limit: number;
  offset: number;
  filters?: OrganFilters;
  facets?: OrganFacets;
}

export interface EventSummary {
  sourceOnly?: boolean;
  retainedRepresentations?: Array<Record<string, unknown>>;
  id: string;
  mdvsId: string;
  entityId?: number | null;
  entityMdvsId?: string | null;
  title: string;
  description?: string | null;
  sourceEventType?: string | null;
  sourceEventTerm?: {
    decisionId?: string | null;
    rawTerm?: string | null;
    normalizedTerm?: string | null;
    occurrenceCount?: number;
    terminalOutcome?: string | null;
    targetConceptCode?: string | null;
    conflict?: boolean;
    decisionSha256?: string | null;
    pageUrl?: string | null;
  } | null;
  type: { code?: string | null; name?: string | null; displayName?: string | null; mappingKind?: "controlled" | "source_only" | string; vocabularyUrl?: string | null };
  mappingKind?: "controlled" | "source_only" | string;
  temporalStatus?: {
    code: "future-dated" | "historical" | "undated" | string;
    label: string;
    explanation: string;
  };
  when: { start?: string | null; end?: string | null; rawExpression?: string | null; precision?: string | null; certainty?: string | null };
  subject?: { id: string; mdvsId?: string | null; title: string; pageUrl?: string | null } | null;
  participants?: Array<{ id: string; mdvsId?: string | null; title: string; pageUrl?: string | null; resolutionState?: string | null }>;
  counts: { participants: number; locations: number; sources: number };
  completeness: {
    state: "complete" | "missing_optional" | string;
    required: { identity: boolean; type: boolean; subject: boolean; source: boolean };
    missingOptional: string[];
  };
  movement?: {
    status: "mapped" | "unresolved" | string;
    mapUrl?: string | null;
    classification?: string | null;
    origin?: {
      mdvsId?: string | null;
      title?: string | null;
      pageUrl?: string | null;
      placeRouteId?: string | null;
      temporalRole?: string | null;
      coordinateState?: string | null;
      coordinateEvidence?: string | null;
      coordinatePrecision?: string | null;
      coordinateFallback?: boolean;
    } | null;
    destination?: {
      mdvsId?: string | null;
      title?: string | null;
      pageUrl?: string | null;
      placeRouteId?: string | null;
      temporalRole?: string | null;
      coordinateState?: string | null;
      coordinateEvidence?: string | null;
      coordinatePrecision?: string | null;
      coordinateFallback?: boolean;
    } | null;
    routeGeometryStored?: boolean;
  } | null;
  pageUrl?: string | null;
}

export interface EventTemporalClaim {
  id: string;
  startDate?: string | null;
  endDate?: string | null;
  startYear?: number | null;
  endYear?: number | null;
  rawExpression?: string | null;
  precisionCode?: string | null;
  precisionName?: string | null;
  certaintyCode?: string | null;
  certaintyName?: string | null;
  isPrimary: boolean;
}

export interface EventRelatedEntity {
  resolutionState?: string | null;
  sourceWording?: string | null;
  identityEvidence?: Record<string, unknown> | null;
  id: string;
  mdvsId?: string | null;
  entityMdvsId?: string | null;
  identityMdvsId?: string | null;
  domainMdvsId?: string | null;
  domainKind?: string | null;
  title: string;
  entityType: string;
  pageUrl?: string | null;
  role?: { code?: string | null; name?: string | null };
}

export interface IdentifierResolution {
  mdvsId: string;
  requestedIdentifier?: string | null;
  identityMdvsId?: string | null;
  entityMdvsId?: string | null;
  domainMdvsId?: string | null;
  entityType: string;
  title: string;
  pageUrl?: string | null;
  apiUrl?: string | null;
  citationUrl?: string | null;
  canonicalUri?: string | null;
  stableUri?: string | null;
  resolverUri?: string | null;
  canonicalRoute?: string | null;
  canonicalRouteKind?: string | null;
  publicationState?: "prepared" | "active" | "retired" | "tombstoned" | string;
  validationProfile?: string | null;
  identityTier?: string | null;
  resolutionStatus?: string | null;
  redirectStatus?: number | null;
  representations?: Array<{
    profile: string;
    mediaType: string;
    uri: string;
    state?: string | null;
  }>;
}

export interface RouteAliasResolution {
  alias_kind?: string;
  alias_slug?: string;
  alias_state?: string;
  canonicalRoute?: string;
  canonicalUri?: string;
  httpStatus?: number;
  resolutionStatus?: string;
  canonical?: IdentifierResolution;
}

export interface EventDetail extends EventSummary {
  sourceWording?: string | null;
  temporalClaims: EventTemporalClaim[];
  subjects: EventRelatedEntity[];
  participants: EventRelatedEntity[];
  locations: Array<{ id: string; mdvsId?: string | null; sourceLocationMdvsId?: string | null; placeRouteId?: string | null; title?: string | null; pageUrl?: string | null; entityPageUrl?: string | null; entityPageState?: string | null; terminalCohort?: string | null; coordinateState?: string | null; coordinates?: string | null; isPrimary: boolean; role?: { code?: string | null; name?: string | null } }>;
  sources: Array<{
    id: string;
    sourceRecordId?: string | null;
    mdvsId?: string | null;
    sourceName?: string | null;
    identifier?: string | null;
    title: string;
    captureAvailable?: boolean;
    pageUrl?: string | null;
    uri?: string | null;
    originalSourceUrl?: string | null;
    citation?: string | null;
    firstSeenAt?: string | null;
    lastSeenAt?: string | null;
  }>;
  evidenceReferences: Array<{ id: string; mdvsId: string; sourceResourceMdvsId?: string | null }>;
  externalIdentifiers: Array<{ id: string; mdvsId?: string | null; identifier: string; type_code?: string | null; type_name?: string | null; confidence?: number | null; is_primary?: boolean }>;
  provenance: { summary: string; activities: Array<{ id: string; mdvsId?: string | null; type?: string | null; startedAt?: string | null; endedAt?: string | null; summary?: string | null }> };
  relatedEntities: EventRelatedEntity[];
  urls: { page: string; api: string; citation: string; research: string };
}

export interface EventListResponse {
  items: EventSummary[];
  total: number;
  limit: number;
  offset: number;
  filters: Record<string, unknown>;
  facets?: {
    eventTypes: Array<{ code: string; name: string; displayName?: string; mappingKind?: "controlled" | "source_only" | string; count: number; vocabularyUrl?: string | null }>;
  };
}

export interface ReleaseContext {
  releaseVersion: string;
  releaseState: string;
  publicationAuthorized: boolean;
  publicationLabel: string;
  usageScope?: string;
  readOnly: boolean;
  contentSha256?: string | null;
  guideUrl: string;
  documentationUrl: string;
  documentationPolicy: string;
  title: string;
  summary: string;
  baselineRelease?: string;
  changeFocus: string;
  actorIdentity?: Record<string, number>;
  map?: {
    groups: number;
    entities: number;
    precision: Record<string, number>;
    statement: string;
  };
  limitations: string[];
  countDefinitions: Array<{ label: string; definition: string }>;
  publicHighlights?: string[];
  excludedFromPublicView?: string[];
  dataProfile?: string;
  capabilities?: string[];
}

export interface CanonicalEventResearch {
  event: EventDetail;
  exactMatchSignature: Record<string, unknown>;
  candidates: Record<string, unknown>[];
  assertions: Record<string, unknown>[];
  evidenceFragments: Record<string, unknown>[];
  processingActivities: Record<string, unknown>[];
  reviewDecisions: Record<string, unknown>[];
  processorRuns: Record<string, unknown>[];
  conflicts: Record<string, unknown>[];
  visibility: "staff_only" | string;
}

export interface OrganFilters {
  query?: string;
  country?: string;
  source?: string;
  status?: string;
  locationState?: string;
  mediaState?: string;
  reviewState?: string;
  builder?: string;
  institution?: string;
  yearFrom?: number | string;
  yearTo?: number | string;
  periodBucket?: string;
  minSources?: number | string;
  evidenceState?: string;
  conflictScope?: string;
  specificationState?: string;
  stopCountBucket?: string;
  eventType?: string;
  virtualInstrument?: string;
  historyState?: string;
  mediaKind?: string;
  sort?: string;
}

export interface OrganFacets {
  countries: Array<{ country: string; code?: string | null; count: number }>;
  sources: Array<{ source: string; count: number }>;
  statuses: Array<{ status: string; count: number }>;
  locationStates: Array<{ state: string; label: string; count: number }>;
  mediaStates: Array<{ state: string; label: string; count: number }>;
  reviewStates: Array<{ state: string; label: string; count: number }>;
  builders: Array<{ builder: string; count: number }>;
  institutions: Array<{ institution: string; count: number }>;
  periodBuckets: Array<{ bucket: string; label: string; count: number }>;
  sourceCountBuckets: Array<{ bucket: string; label: string; count: number }>;
  evidenceStates: Array<{ state: string; label: string; count: number }>;
  conflictScopes: Array<{ scope: string; label: string; count: number }>;
  specificationStates: Array<{ state: string; label: string; count: number }>;
  stopCountBuckets: Array<{ bucket: string; label: string; count: number }>;
  eventTypes: Array<{ code: string; label: string; count: number }>;
  historyStates: Array<{ state: string; label: string; count: number }>;
  mediaKinds: Array<{ kind: string; label: string; count: number }>;
}

export interface OrganFacetResponse {
  facets: OrganFacets;
  filters?: OrganFilters;
  generatedAt?: string;
  cached?: boolean;
  cacheTtlSeconds?: number;
  source?: string;
}

export interface CatalogReadModelStatus {
  available: boolean;
  table: string;
  rowCount: number;
  sourceRecordCount?: number;
  oldestRefreshedAt?: string | null;
  newestRefreshedAt?: string | null;
  newestSourceAt?: string | null;
  isFresh?: boolean;
  freshnessState?: string;
  staleReasons?: string[];
  source: string;
  guidance?: string | null;
}

export interface CatalogReadModelRefreshResponse {
  ok?: boolean;
  table?: string;
  insertedRows?: number;
  rowCount?: number;
  sourceRecordCount?: number;
  oldestRefreshedAt?: string | null;
  newestRefreshedAt?: string | null;
  newestSourceAt?: string | null;
  isFresh?: boolean;
  freshnessState?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  error?: string;
  detail?: string;
  permission?: string;
}

export interface ResearchResponse {
  entity: OrganCard;
  citation: Citation;
  processorReadiness?: ProcessorResearchReadiness;
  canonicalOutcome?: CanonicalOutcome;
  georeferencingReadiness?: GeoreferencingResearchReadiness;
  researchEvidenceIndex?: ResearchEvidenceIndex;
  reviewDecisionHistory?: ReviewDecisionHistory;
  contributionResearch?: ContributionResearch;
  componentResearch?: ComponentResearch;
  eventResearch?: EventResearch;
  sourceRecords: Record<string, unknown>[];
  normalizerSessions: Record<string, unknown>[];
  candidateEntities: Record<string, unknown>[];
  candidateAssertions: Record<string, unknown>[];
  candidateRelations: Record<string, unknown>[];
  reviewDecisions: Record<string, unknown>[];
  processorRuns: Record<string, unknown>[];
  processorOperationHistory?: ProcessorOperationHistory;
  documents: Record<string, unknown>[];
  media: Record<string, unknown>[];
  provenance: Record<string, unknown>[];
  raw: Record<string, unknown>;
}

export interface CanonicalOutcome {
  status: string;
  label?: string | null;
  owner?: string | null;
  sourceRecordId?: string | null;
  mdvsId?: string | null;
  sourcePagePolicy?: string | null;
  canonicalPagePolicy?: string | null;
  replacementState?: string | null;
  replacementLabel?: string | null;
  nextAction?: string | null;
  guidance?: string | null;
  candidateSummary?: {
    totalCount?: number;
    entityCount?: number;
    assertionCount?: number;
    relationCount?: number;
    approvedCount?: number;
    pendingCount?: number;
    rejectedCount?: number;
    reviewStates?: Array<{ state: string; label?: string; count: number }>;
    matchStates?: Array<{ state: string; label?: string; count: number }>;
  };
  promotionRun?: {
    runCount?: number;
    latestRunId?: string | null;
    latestStatus?: string | null;
    latestLifecycleState?: string | null;
    latestActorId?: string | null;
    latestRequestedByActorId?: string | null;
    latestAuthorizedActorId?: string | null;
    actorAttributionState?: string | null;
    latestStartedAt?: string | null;
    latestFinishedAt?: string | null;
    hasCompletedPromotion?: boolean;
    hasActivePromotion?: boolean;
    hasFailedPromotion?: boolean;
    resultAvailable?: boolean;
  };
  authorizationEventCount?: number;
  promotionAuditEvidence?: {
    status?: string | null;
    label?: string | null;
    guidance?: string | null;
    runId?: string | null;
    jobType?: string | null;
    runStatus?: string | null;
    actorAttributionState?: string | null;
    actorFields?: Record<string, string | null | undefined>;
    missingActorFields?: string[];
    authorizationEventCount?: number;
    authorizationEvents?: Array<{
      id?: string | null;
      actorId?: string | null;
      permission?: string | null;
      decision?: string | null;
      module?: string | null;
      jobType?: string | null;
      sourceRecordId?: string | null;
      sessionId?: string | null;
      createdAt?: string | null;
    }>;
    expectedProcessorFields?: string[];
    navigatorPolicy?: string | null;
  };
  canonicalReferences?: Array<{
    runId?: string | null;
    targetSchema?: string | null;
    targetTable?: string | null;
    targetId?: string | null;
    sourceCandidateId?: string | null;
    label?: string | null;
    kind?: string | null;
  }>;
  canonicalLinkEvidence?: {
    status?: string | null;
    label?: string | null;
    evidenceLevel?: string | null;
    canonicalReferenceCount?: number;
    candidateRowCount?: number;
    candidateMatchLinked?: boolean;
    guidance?: string | null;
    candidates?: Array<{
      targetSchema?: string | null;
      targetTable?: string | null;
      targetId?: string | null;
      mdvsId?: string | null;
      label?: string | null;
      entityClassId?: number | string | null;
      typeId?: number | string | null;
      statusId?: number | string | null;
      rowVersion?: number | string | null;
      rowHash?: string | null;
      createdAt?: string | null;
      updatedAt?: string | null;
      candidateIds?: string[];
      candidateKinds?: string[];
      runId?: string | null;
      matchBasis?: string | null;
      verificationState?: string | null;
      evidenceLevel?: string | null;
    }>;
  };
  promotedCounts?: Array<{ projection: string; label?: string; count: number }>;
  canonicalSignals?: string[];
  qualityGates?: Array<{ id: string; label: string; status: string; detail?: string | null }>;
}

export interface ReviewDecisionHistory {
  status: string;
  label: string;
  totalCount: number;
  latestDecisionAt?: string | null;
  sessionCount?: number;
  sessionIds?: string[];
  decisionCounts?: Array<{ decision: string; label: string; count: number }>;
  candidateKindCounts?: Array<{ candidateKind: string; label: string; count: number }>;
  reviewerCounts?: Array<{ reviewerId: string; label: string; count: number }>;
  recent?: Array<{
    id?: string | null;
    sessionId?: string | null;
    candidateId?: string | null;
    candidateKind?: string | null;
    decision?: string | null;
    decisionLabel?: string | null;
    reviewerId?: string | null;
    decidedAt?: string | null;
    payloadKeys?: string[];
    sourceTable?: string | null;
  }>;
  recoveryGuidance?: string[];
  ownership?: string | null;
}

export interface ComponentResearch {
  status: string;
  label: string;
  componentCount: number;
  normalizerEvidenceCount: number;
  pendingReviewCount: number;
  reviewedCandidateCount: number;
  groups: ComponentResearchGroup[];
  items: ComponentResearchItem[];
}

export interface ResearchEvidenceIndex {
  status: string;
  label: string;
  organizationMode: string;
  guidance?: string | null;
  sourceCount: number;
  factCount: number;
  candidateCount: number;
  reviewDecisionCount: number;
  processorRunCount: number;
  sectionCounts?: Record<string, number>;
  sourceRows: Array<Record<string, unknown>>;
  factRows: Array<Record<string, unknown>>;
  candidateRows: Array<Record<string, unknown>>;
  reviewRows: Array<Record<string, unknown>>;
  processorRows: Array<Record<string, unknown>>;
}

export interface ContributionResearch {
  status: string;
  label: string;
  guidance?: string | null;
  contributionCount: number;
  attachmentCount: number;
  evidenceUrlCount: number;
  factTargetCount: number;
  byteRegistrationRequiredCount: number;
  processorReadyAttachmentCount: number;
  lifecycleStateCounts: Array<{ state: string; label: string; count: number }>;
  typeCounts: Array<{ state: string; label: string; count: number }>;
  attachmentStateCounts: Array<{ state: string; label: string; count: number }>;
  ownerCounts: Array<{ state: string; label: string; count: number }>;
  items: ContributionResearchItem[];
}

export interface ContributionResearchItem {
  id?: string | null;
  type?: string | null;
  title?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  targetMdvsId?: string | null;
  factKey?: string | null;
  evidenceTarget?: Record<string, unknown> | null;
  evidenceTargetId?: string | null;
  evidenceTargetKind?: string | null;
  evidenceTargetTitle?: string | null;
  evidenceTargetStatus?: string | null;
  evidenceTargetShape?: Record<string, unknown> | null;
  evidenceTargetSourceLinkCount?: number;
  evidenceTargetFileLinkCount?: number;
  claimValue?: unknown;
  comment?: string | null;
  evidenceUrl?: string | null;
  evidenceTitle?: string | null;
  license?: string | null;
  visibilityState?: string | null;
  reviewState?: string | null;
  lifecycleState?: string | null;
  lifecycleLabel?: string | null;
  lifecycleDescription?: string | null;
  lifecycleStages?: Array<{ state?: string | null; label?: string | null; status?: string | null }>;
  owner?: string | null;
  nextAction?: string | null;
  workflowRequestId?: string | null;
  workflowStatus?: string | null;
  notificationId?: string | null;
  notificationStatus?: string | null;
  hasEvidenceUrl?: boolean;
  hasStructuredClaim?: boolean;
  hasComment?: boolean;
  hasAttachment?: boolean;
  attachmentType?: string | null;
  attachmentState?: string | null;
  attachmentLabel?: string | null;
  requiresByteRegistration?: boolean;
  processorReady?: boolean;
  processorReadinessLabel?: string | null;
  route?: string | null;
  reviewAction?: string | null;
  aggregatorHandoff?: {
    owner?: string | null;
    status?: string | null;
    route?: string | null;
    nextAction?: string | null;
    reviewAction?: string | null;
    workflowRequestId?: string | null;
    workflowStatus?: string | null;
    notificationId?: string | null;
    notificationStatus?: string | null;
    processorBoundary?: string | null;
    records?: Array<{ type?: string | null; id?: string | null; status?: string | null; owner?: string | null }>;
  };
}

export interface EventResearch {
  status: string;
  label: string;
  eventCount: number;
  activityCount: number;
  rowCount: number;
  promotionReadyCount: number;
  canonicalStateCounts: Array<{ state: string; label: string; count: number }>;
  eventTypeCounts: Array<{ state: string; label: string; count: number }>;
  dateCertaintyCounts: Array<{ state: string; label: string; count: number }>;
  georeferencingStateCounts: Array<{ state: string; label: string; count: number }>;
  items: EventResearchItem[];
}

export interface EventResearchItem {
  id?: string | null;
  rowKind?: string | null;
  label?: string | null;
  actor?: string | null;
  date?: string | null;
  dates?: string[];
  eventType?: string | null;
  dateCertainty?: string | null;
  dateSource?: string | null;
  place?: string | null;
  sourcePath?: string | null;
  canonicalState?: string | null;
  placeEvidenceState?: string | null;
  georeferencingState?: string | null;
  promotionState?: string | null;
  reviewAction?: string | null;
  provenanceStages?: string[];
  provenanceChain?: Array<Record<string, unknown>>;
}

export interface ComponentResearchGroup {
  id?: string | null;
  label?: string | null;
  componentCount: number;
  normalizerEvidenceCount: number;
}

export interface ComponentResearchItem {
  componentId?: string | null;
  mdvsId?: string | null;
  kind?: string | null;
  group?: string | null;
  groupLabel?: string | null;
  label?: string | null;
  sourcePath?: string | null;
  trustState?: string | null;
  certainty?: string | null;
  sourceCount?: number;
  normalizerEvidenceCount?: number;
  componentRelationCount?: number;
  componentRelations?: ComponentRelation[];
  reviewStatus?: string | null;
  promotionState?: string | null;
  predicateCodes?: string[];
  candidateIds?: string[];
  sessionIds?: string[];
  sourceRecordIds?: string[];
  provenanceChain?: Array<Record<string, unknown>>;
}

export interface ProcessorOperationHistory {
  status: string;
  label: string;
  runCount: number;
  completedCount: number;
  failedCount: number;
  activeCount: number;
  recoveryActionCount?: number;
  authorizationEventCount?: number;
  authorizationAllowedCount?: number;
  authorizationDeniedCount?: number;
  latestAuthorizationAt?: string | null;
  authorizationSummary?: ProcessorOperationAuthorizationSummary;
  latestRunId?: string | null;
  latestJobType?: string | null;
  latestStatus?: string | null;
  byStatus?: Record<string, number>;
  byJobType?: Record<string, number>;
  items: ProcessorOperationHistoryItem[];
}

export interface ProcessorOperationHistoryItem {
  runId?: string | null;
  module?: string | null;
  jobType?: string | null;
  status?: string | null;
  rawStatus?: string | null;
  lifecycleState?: string | null;
  actorId?: string | null;
  sourceRecordId?: string | null;
  sessionId?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  errorMessage?: string | null;
  inspectionUrl?: string | null;
  eventsUrl?: string | null;
  scopeLabel?: string | null;
  authorizationEventCount?: number;
  authorizationEvents?: ProcessorOperationAuthorizationEvent[];
  recoveryActions?: ProcessorOperationRecoveryAction[];
}

export interface ProcessorOperationAuthorizationSummary {
  status: string;
  label: string;
  totalCount: number;
  allowedCount?: number;
  deniedCount?: number;
  latestCreatedAt?: string | null;
  byDecision?: Array<{ decision: string; label: string; count: number }>;
  byPermission?: Array<{ permission: string; label: string; count: number }>;
  byActor?: Array<{ actorId: string; label: string; count: number }>;
  recent?: ProcessorOperationAuthorizationEvent[];
  ownership?: string | null;
}

export interface ProcessorOperationAuthorizationEvent {
  id?: string | null;
  actorId?: string | null;
  permission?: string | null;
  decision?: string | null;
  module?: string | null;
  jobType?: string | null;
  sourceRecordId?: string | null;
  sessionId?: string | null;
  createdAt?: string | null;
}

export interface ProcessorOperationRecoveryAction {
  id: string;
  label: string;
  owner: string;
  method: string;
  endpoint: string;
  permission?: string | null;
  requiresActor: boolean;
  mutates: boolean;
  navigatorExecutable?: boolean;
  status?: string | null;
  payloadTemplate?: Record<string, unknown>;
  requestPreview?: ProcessorRequestPreview;
  guidance?: string | null;
}

export interface ProcessorRequestPreview {
  method?: string | null;
  navigatorEndpoint?: string | null;
  headers?: Record<string, string | null | undefined>;
  body?: Record<string, unknown>;
}

export interface ProcessorResearchReadiness {
  sourceRecordId?: string | null;
  sessionId?: string | null;
  sourceStatus: {
    ok: boolean;
    status: string;
    message?: string;
    nextAction?: string | null;
    ingestorStatus?: string | null;
    normalizerStatus?: string | null;
    latestIngestorSessionId?: string | null;
    latestNormalizerSessionId?: string | null;
  };
  review: {
    ok: boolean;
    status: string;
    message?: string;
    candidateCounts?: Record<string, number>;
    pendingCount?: number;
    approvedCount?: number;
    rejectedCount?: number;
  };
  reviewQueue?: {
    ok: boolean;
    status: string;
    message?: string;
    counts?: Record<string, unknown>;
    items: ProcessorReviewQueueItem[];
  };
  promotion: {
    ok: boolean;
    status: string;
    message?: string;
    canExecute?: boolean;
    fullyReviewed?: boolean;
    needsAttention?: boolean;
    pendingCounts?: Record<string, number>;
    approvedCounts?: Record<string, number>;
    messages?: string[];
    operationCount?: number;
    operations?: ProcessorPromotionOperation[];
    completionPlan?: ProcessorPromotionCompletionPlan;
  };
  actions: ProcessorResearchAction[];
  reviewWorkflowPlan?: ProcessorReviewWorkflowPlan;
  raw?: Record<string, unknown>;
}

export interface ProcessorPromotionCompletionPlan {
  status: string;
  label?: string | null;
  owner?: string | null;
  sessionId?: string | null;
  canExecute?: boolean;
  fullyReviewed?: boolean;
  operationCount?: number;
  pendingCounts?: Record<string, number>;
  approvedCounts?: Record<string, number>;
  messages?: string[];
  nextAction?: string | null;
  ownership?: string | null;
  qualityGates?: ProcessorPromotionQualityGate[];
  postActionChecks?: string[];
  operations?: ProcessorPromotionOperation[];
}

export interface ProcessorPromotionQualityGate {
  id: string;
  label: string;
  status: string;
  detail?: string | null;
}

export interface ProcessorPromotionOperation {
  id: string;
  action?: string | null;
  target?: string | null;
  status?: string | null;
  summary?: string | null;
  payloadKeys?: string[];
}

export interface ProcessorReviewWorkflowPlan {
  status: string;
  label?: string | null;
  nextAction?: string | null;
  guidance?: string | null;
  pendingReviewCount?: number;
  reviewQueueSampleCount?: number;
  promotionReady?: boolean;
  steps: ProcessorReviewWorkflowStep[];
  blockers?: string[];
}

export interface ProcessorReviewWorkflowStep {
  id: string;
  label: string;
  owner?: string | null;
  status: string;
  jobType?: string | null;
  executionMode?: "foreground" | "background" | string | null;
  mutates?: boolean;
  requiresActor?: boolean;
  permission?: string | null;
  permissionLabel?: string | null;
  current?: boolean;
}

export interface GeoreferencingResearchReadiness {
  sourceRecordId?: string | null;
  state: string;
  status: string;
  label: string;
  message?: string;
  nextAction?: string | null;
  location?: string | null;
  country?: string | null;
  coordinates?: { lat: number; lon: number } | null;
  hasCoordinates: boolean;
  hasTextLocation: boolean;
  hasStructuredLocation: boolean;
  priority?: number | null;
  priorityLabel?: string | null;
  priorityReasons?: string[];
  structuredLocationFieldCount?: number | null;
  evidence: Array<{ label: string; value: string; source?: string | null }>;
  evidencePacket?: GeoreferencingEvidencePacket;
  coordinateCandidatePlan?: GeoreferencingCoordinateCandidatePlan;
  spatialWorkflow?: GeoreferencingSpatialWorkflow;
  actions: Array<{
    id: string;
    label: string;
    owner: string;
    status: string;
    enabled: boolean;
    mutates: boolean;
    requiresActor?: boolean;
  }>;
}

export interface GeoreferencingEvidencePacket {
  id: string;
  sourceRecordId?: string | null;
  sourceSystem?: string | null;
  status: string;
  queryText?: string | null;
  queryParts?: string[];
  structuredFields?: Array<{ key: string; label: string; value: string; source?: string | null }>;
  country?: string | null;
  priority?: number | null;
  priorityLabel?: string | null;
  confidenceBasis?: string[];
  coordinateCandidate?: { lat: number; lon: number } | null;
  canonicalPlaceStatus?: string | null;
  reviewConstraint?: string | null;
  geocoderAction?: string | null;
  routes?: Array<{ owner: string; action: string; status: string; mutates: boolean }>;
  provenanceChain?: Array<{ stage?: string | null; owner?: string | null; id?: string | null; status?: string | null }>;
}

export interface GeoreferencingCoordinateCandidatePlan {
  id: string;
  label: string;
  status: string;
  candidateSource?: string | null;
  candidateStatus?: string | null;
  sourceRecordId?: string | null;
  evidencePacketId?: string | null;
  queryText?: string | null;
  country?: string | null;
  priority?: number | null;
  priorityLabel?: string | null;
  confidenceInputs?: string[];
  candidateCoordinate?: { lat: number; lon: number } | null;
  nextAction?: string | null;
  requiresActor?: boolean;
  mutates?: boolean;
  routeOwner?: string | null;
  canonicalPlaceStatus?: string | null;
  promotionBlocker?: string | null;
  guidance?: string | null;
  processorHandoff?: {
    id: string;
    label: string;
    module: string;
    jobType: string;
    owner: string;
    navigatorEndpoint?: string | null;
    permission?: string | null;
    permissionLabel?: string | null;
    requiresActor: boolean;
    mutates: boolean;
    executionMode?: "foreground" | "background" | string | null;
    confirmationRequired?: boolean;
    navigatorExecutable?: boolean;
    enabled: boolean;
    status?: string | null;
    idempotencyKey?: string | null;
    payloadTemplate?: Record<string, unknown>;
    requestPreview?: {
      method?: string | null;
      navigatorEndpoint?: string | null;
      headers?: Record<string, string | null | undefined>;
      body?: Record<string, unknown>;
    };
    reviewConstraint?: string | null;
    confirmation?: ProcessorActionConfirmation;
  };
  qualityGates?: Array<{
    id: string;
    label: string;
    owner: string;
    status: string;
    detail?: string | null;
  }>;
}

export interface GeoreferencingSpatialWorkflow {
  status: string;
  coordinateSource?: string | null;
  geocoderStatus?: string | null;
  coordinateReviewStatus?: string | null;
  canonicalPlaceStatus?: string | null;
  spatialPromotionStatus?: string | null;
  candidateCoordinate?: { lat: number; lon: number } | null;
  sourceRecordId?: string | null;
  priority?: number | null;
  priorityLabel?: string | null;
  stages: Array<{
    id: string;
    label: string;
    owner: string;
    status: string;
    detail?: string | null;
    sourceRecordId?: string | null;
  }>;
}

export interface ProcessorReviewQueueItem {
  candidateId?: string | null;
  candidateKind?: string | null;
  candidateType?: string | null;
  label: string;
  reviewStatus?: string | null;
  matchStatus?: string | null;
  score?: number | null;
  sessionId?: string | null;
  sourceRecordId?: string | null;
  sourceRecord?: {
    id?: string | null;
    title?: string | null;
    source?: { id?: string | null; name?: string | null; url?: string | null };
    status?: string | null;
    primaryIdentifier?: { scheme?: string | null; value?: string | null };
    country?: string | null;
    counts?: Record<string, number>;
  } | null;
  sourceTitle?: string | null;
  sourceName?: string | null;
  country?: string | null;
  sourceUrl?: string | null;
  sourcePath?: string | null;
  actions?: string[];
  decisionOptions?: ProcessorReviewDecisionOption[];
  reviewGuidance?: string | null;
}

export interface AutonomousBootstrapException {
  exceptionId: string;
  kind: "resolution" | "relationship" | "workflow" | "policy" | string;
  status: string;
  assuranceState?: string | null;
  sourceRecordId?: string | null;
  sourceId?: string | null;
  sourcePath?: string | null;
  sourceHash?: string | null;
  observationId?: string | null;
  decisionId?: string | null;
  chosenCandidateId?: string | null;
  policyExecutionId?: string | null;
  policyVersion?: string | null;
  policyHash?: string | null;
  inputFingerprint?: string | null;
  batchShardId?: string | null;
  batchRunId?: string | null;
  shardIndex?: number | null;
  attemptCount?: number | null;
  outputSchemaKey?: string | null;
  outputSchemaVersion?: string | null;
  policyRoute?: {
    kind: "resolution" | "relationship";
    resolutionPolicyId?: string;
    relationshipPolicyId?: string;
    sourceFamily?: string;
    domainKey?: string;
    entityKind?: string;
    predicate?: string;
    blockingSimilarityThreshold?: number;
    linkThreshold?: number;
    minimumMargin?: number;
    blockingLimit?: number;
    resolverVersion?: string;
    featureSetVersion?: string;
    calibrationVersion?: string;
    minimumPrecision?: number;
    classifierVersion?: string;
    precisionEvidence?: {
      artifactRef?: string;
      contentSha256?: string;
      calibrationVersion?: string;
      lowerBound?: number;
    };
  } | null;
  relationshipContext?: {
    contextContract?: string;
    subjectRef?: string;
    predicate?: string;
    objectRef?: string;
    temporalContext?: Record<string, unknown> | null;
    contextSha256?: string;
  };
  reasonCodes: string[];
  createdAt?: string | null;
  owner: string;
  canSupersede: boolean;
}

export interface AutonomousBootstrapDashboard {
  ok: boolean;
  contract: string;
  generatedAt: string;
  visibilityProfile: "internal" | "local-restricted";
  schemaStatus: {
    ready: boolean;
    tables: Record<string, boolean>;
    missingRequired: string[];
    owner: string;
  };
  policy: {
    active: Array<{
      policyId: string;
      policyVersion: string;
      policyHash: string;
      scope: Record<string, unknown>;
      releaseId?: string | null;
      releaseCommits?: Record<string, string>;
      activationScopes?: string[];
      approvedByActorId: string;
      validFrom: string;
      validUntil?: string | null;
    }>;
    activationMode: string;
    runtimeSelfModification: boolean;
    owner: string;
  };
  metrics: {
    activePolicies: number;
    batchRuns: Record<string, number>;
    shards: Record<string, number>;
    policyOutcomes: Record<string, number>;
    visibleExceptions: number;
    recentProjectionReceipts: number;
  };
  runs: Array<{
    batchRunId: string;
    sourceProfileId?: string | null;
    policyVersion: string;
    codeRevision: string;
    inputFingerprint: string;
    visibility?: "internal" | "local-restricted";
    state: string;
    shardCount: number;
    importedShardCount: number;
    attentionShardCount: number;
    createdAt: string;
    updatedAt: string;
  }>;
  exceptionQueue: AutonomousBootstrapException[];
  recentProjectionReceipts: Array<{
    receiptId: string;
    policyExecutionId: string;
    target: { schema: string; table: string; id: string };
    operation: string;
    observationIds: string[];
    idempotencyKey: string;
    inputFingerprint: string;
    policyVersion: string;
    policyHash: string;
    actorId: string;
    actorType: string;
    result: string;
    dependencyCount: number;
    createdAt: string;
    systemOfRecord: string;
  }>;
  guidance: string;
}

export interface AutonomousBootstrapSupersessionResult {
  ok: boolean;
  status?: string;
  error?: string;
  systemOfRecord?: string;
  priorDecisionId?: string;
  observationId?: string;
  exceptionKind?: "resolution";
  action?: string;
  result?: SafeResult;
}

export interface ProcessorReviewWorkbench {
  ok: boolean;
  status: string;
  message?: string | null;
  limit: number;
  offset: number;
  filters: {
    sourceRecordId?: string | null;
    sessionId?: string | null;
    candidateKind?: string | null;
    country?: string | null;
  };
  counts: {
    visible: number;
    reported?: Record<string, unknown>;
    byCandidateKind: Array<{ value: string; label: string; count: number }>;
    bySource: Array<{ sourceRecordId: string; label: string; country?: string | null; count: number }>;
    byCountry: Array<{ value: string; label: string; count: number }>;
  };
  items: ProcessorReviewQueueItem[];
  diagnostics?: {
    ok: boolean;
    reason: string;
    processorUrl?: string | null;
    endpoint?: string | null;
    jobType?: string | null;
    status?: string | null;
    message?: string | null;
    requested?: {
      limit?: number | null;
      offset?: number | null;
      filters?: Record<string, unknown>;
    };
    returnedItems?: number;
    visibleItems?: number;
    reportedCounts?: Record<string, unknown>;
  };
  actions: ProcessorResearchAction[];
  guidance?: string | null;
  raw?: Record<string, unknown>;
}

export interface ProcessorReviewBatchPlan {
  ok: boolean;
  status?: string | null;
  mode?: string | null;
  mutates?: boolean;
  executed?: boolean;
  error?: string | null;
  message?: string | null;
  detail?: string | null;
  batchPlanId?: string | null;
  generatedAt?: string | null;
  decision?: string | null;
  candidateIds?: string[];
  missingCandidateIds?: string[];
  candidateCount?: number;
  decisionCount?: number;
  acceptedCount?: number;
  failedCount?: number;
  sourceRecordId?: string | null;
  sessionId?: string | null;
  candidateKind?: string | null;
  scoreRange?: string | null;
  confirmationPhrase?: string | null;
  permission?: ProcessorActorPermissionCheck;
  auditTrail?: {
    batchPlanId?: string | null;
    systemOfRecord?: string | null;
    mutationContract?: string | null;
    actorId?: string | null;
    permission?: string | null;
    candidateVisibility?: string | null;
    groupScope?: string | null;
    executionRequiresExactConfirmation?: boolean;
  };
  batchExecution?: {
    batchRunId?: string | null;
    batchPlanId?: string | null;
    submittedAt?: string | null;
    actorId?: string | null;
    status?: string | null;
    acceptedCount?: number;
    failedCount?: number;
    resultCount?: number;
    systemOfRecord?: string | null;
    mutationContract?: string | null;
  };
  receiptPersistence?: {
    ok: boolean;
    table?: string | null;
    receipt?: ProcessorReviewBatchReceipt | null;
    error?: string | null;
  };
  requests?: Array<Record<string, unknown>>;
  results?: Array<Record<string, unknown>>;
  safeguards?: string[];
  postActionChecks?: string[];
}

export interface ProcessorReviewBatchReceipt {
  batchRunId?: string | null;
  batchPlanId?: string | null;
  actorId?: string | null;
  sourceRecordId?: string | null;
  sessionId?: string | null;
  candidateKind?: string | null;
  decision?: string | null;
  status?: string | null;
  acceptedCount?: number;
  failedCount?: number;
  candidateCount?: number;
  submittedAt?: string | null;
  createdAt?: string | null;
  receipt: ProcessorReviewBatchPlan;
}

export interface ProcessorReviewBatchReceiptList {
  ok: boolean;
  table?: string | null;
  items: ProcessorReviewBatchReceipt[];
  limit: number;
  filters?: {
    actorId?: string | null;
    sourceRecordId?: string | null;
    sessionId?: string | null;
  };
}

export interface BuilderNameClassificationQueueItem {
  id?: string | null;
  label?: string | null;
  dedupeNameKey?: string | null;
  category?: string | null;
  entityType?: string | null;
  candidateGroupId?: string | null;
  candidateGroupUrl?: string | null;
  occurrenceCount?: number | null;
  sourceRecordCount?: number | null;
  associatedOrganCount?: number | null;
  sourcePaths?: string[];
  status?: string | null;
  owner?: string | null;
  requiresSlm?: boolean | null;
  deterministicClassification?: {
    matched?: boolean | null;
    class?: string | null;
    confidence?: number | null;
    matchedTerms?: string[];
    rule?: string | null;
    basis?: string | null;
  } | null;
  processorJob?: Record<string, unknown>;
  promptContract?: Record<string, unknown>;
}

export interface BuilderNameClassificationQueue {
  status: string;
  owner?: string | null;
  modelRole?: string | null;
  dedupePolicy?: string | null;
  eligibilityPolicy?: string | null;
  deterministicPolicy?: string | null;
  persistence?: {
    status?: string | null;
    table?: string | null;
    persistEndpoint?: string | null;
    receiptsEndpoint?: string | null;
    ingestionPlanEndpoint?: string | null;
    ingestionRunEndpoint?: string | null;
    systemOfRecord?: string | null;
    navigatorRole?: string | null;
  };
  counts: {
    deterministic: number;
    requiresSlm: number;
  };
  items: BuilderNameClassificationQueueItem[];
  total: number;
  limit: number;
}

export interface BuilderNameClassificationReceipt {
  classificationId?: string | null;
  dedupeNameKey?: string | null;
  label?: string | null;
  classification?: string | null;
  confidence?: number | null;
  matchedTerms?: string[];
  rule?: string | null;
  candidateGroupId?: string | null;
  candidateGroupUrl?: string | null;
  status?: string | null;
  actorId?: string | null;
  submittedAt?: string | null;
  createdAt?: string | null;
  receipt?: Record<string, unknown>;
}

export interface BuilderNameClassificationReceiptList {
  ok: boolean;
  table?: string | null;
  items: BuilderNameClassificationReceipt[];
  limit: number;
  filters?: {
    status?: string | null;
  };
}

export interface BuilderNameClassificationIngestionPlan {
  ok: boolean;
  status?: string | null;
  mutates?: boolean;
  executed?: boolean;
  generatedAt?: string | null;
  module?: string | null;
  jobType?: string | null;
  mutationContract?: string | null;
  sourceTable?: string | null;
  receiptStatus?: string | null;
  receiptCount?: number;
  receiptIds?: string[];
  limit?: number;
  idempotencyKey?: string | null;
  confirmationPhrase?: string | null;
  permission?: ProcessorActorPermissionCheck;
  preconditions?: Array<{ id?: string | null; label?: string | null; status?: string | null }>;
  paradata?: Record<string, unknown>;
  safeguards?: string[];
  guidance?: string | null;
  error?: string | null;
  detail?: string | null;
}

export interface ProcessorRunLinkSet {
  runId?: string | null;
  inspectionEndpoint?: string | null;
  eventsStreamEndpoint?: string | null;
  status?: string | null;
  guidance?: string | null;
}

export interface BuilderNameClassificationIngestionRun extends BuilderNameClassificationIngestionPlan {
  result?: SafeResult;
  processorRun?: ProcessorRunLinkSet | null;
  postActionChecks?: string[];
}

export interface BuilderNameSlmClassificationPlan {
  ok: boolean;
  status?: string | null;
  mutates?: boolean;
  executed?: boolean;
  generatedAt?: string | null;
  module?: string | null;
  jobType?: string | null;
  mutationContract?: string | null;
  classificationId?: string | null;
  dedupeNameKey?: string | null;
  label?: string | null;
  requiresSlm?: boolean | null;
  candidateGroupId?: string | null;
  candidateGroupUrl?: string | null;
  sourcePaths?: string[];
  limit?: number;
  idempotencyKey?: string | null;
  confirmationPhrase?: string | null;
  permission?: ProcessorActorPermissionCheck;
  preconditions?: Array<{ id?: string | null; label?: string | null; status?: string | null }>;
  paradata?: Record<string, unknown>;
  safeguards?: string[];
  guidance?: string | null;
  error?: string | null;
  detail?: string | null;
}

export interface BuilderNameSlmClassificationRun extends BuilderNameSlmClassificationPlan {
  result?: SafeResult;
  processorRun?: ProcessorRunLinkSet | null;
  postActionChecks?: string[];
}

export interface BuilderNameSlmBatchPlan {
  ok: boolean;
  status?: string | null;
  mutates?: boolean;
  executed?: boolean;
  generatedAt?: string | null;
  module?: string | null;
  jobType?: string | null;
  mutationContract?: string | null;
  queueTotal?: number | null;
  queueRequiresSlmCount?: number | null;
  batchLimit?: number | null;
  itemCount?: number | null;
  items?: Array<{
    classificationId?: string | null;
    dedupeNameKey?: string | null;
    label?: string | null;
    candidateGroupUrl?: string | null;
    idempotencyKey?: string | null;
  }>;
  limit?: number;
  idempotencyKey?: string | null;
  confirmationPhrase?: string | null;
  permission?: ProcessorActorPermissionCheck;
  preconditions?: Array<{ id?: string | null; label?: string | null; status?: string | null }>;
  paradata?: Record<string, unknown>;
  safeguards?: string[];
  guidance?: string | null;
  error?: string | null;
  detail?: string | null;
}

export interface BuilderNameSlmBatchRun extends BuilderNameSlmBatchPlan {
  acceptedCount?: number;
  failedCount?: number;
  results?: Array<{
    classificationId?: string | null;
    dedupeNameKey?: string | null;
    label?: string | null;
    ok?: boolean;
    result?: SafeResult;
    processorRun?: ProcessorRunLinkSet | null;
    idempotencyKey?: string | null;
    error?: string | null;
  }>;
  postActionChecks?: string[];
}

export interface BuilderNameClassificationParadataEvent {
  eventId?: string | null;
  eventTime?: string | null;
  eventType?: string | null;
  component?: string | null;
  classificationId?: string | null;
  dedupeNameKey?: string | null;
  label?: string | null;
  classification?: string | null;
  confidence?: number | null;
  recommendedAction?: string | null;
  riskFlags?: string[];
  traceability?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

export interface BuilderNameClassificationParadata {
  ok: boolean;
  table?: string | null;
  eventTypes?: string[];
  counts: {
    ingestedReceipts: number;
    slmClassifications: number;
  };
  items: BuilderNameClassificationParadataEvent[];
  limit: number;
  offset?: number;
  total?: number;
  hasMore?: boolean;
  nextOffset?: number | null;
  previousOffset?: number | null;
  filters?: {
    eventType?: string | null;
    classificationId?: string | null;
    dedupeNameKey?: string | null;
    query?: string | null;
  };
  guidance?: string | null;
}

export interface ProcessorReviewDecisionOption {
  id: string;
  label: string;
  module: string;
  jobType: string;
  owner: string;
  permission?: string | null;
  permissionLabel?: string | null;
  mutates: boolean;
  requiresActor: boolean;
  enabled: boolean;
  status?: string | null;
  confirmationRequired?: boolean;
  confirmation?: ProcessorActionConfirmation;
  payloadTemplate?: Record<string, unknown>;
}

export interface ProcessorResearchAction {
  id: string;
  label: string;
  module: string;
  jobType: string;
  mutates: boolean;
  permission?: string | null;
  permissionLabel?: string | null;
  requiresActor: boolean;
  roleHint?: string | null;
  executionMode?: "foreground" | "background" | string | null;
  confirmationRequired?: boolean;
  confirmation?: ProcessorActionConfirmation;
  enabled: boolean;
  status?: string | null;
  payload?: Record<string, unknown>;
  payloadTemplate?: Record<string, unknown>;
  requestPreview?: ProcessorRequestPreview;
}

export interface ProcessorActionConfirmation {
  title?: string | null;
  description?: string | null;
  confirmLabel?: string | null;
  checks?: string[];
}

export interface ContributionRequest {
  target_type: string;
  target_id: string;
  contribution_type: string;
  claim?: Record<string, unknown>;
  comment?: string;
  evidence_url?: string;
  evidence_title?: string;
  license?: string;
}

export async function fetchStatus(): Promise<Record<string, unknown>> {
  return getJson("/api/status");
}

export async function fetchRelease11Summary(): Promise<Release11Summary> {
  return getJson("/api/release-1-1/summary");
}

export async function fetchRelease11Evidence(params: {
  sourceRecordId?: string;
  family?: string;
  kind?: string;
  retrievalBand?: string;
  outcome?: string;
  query?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<Release11EvidenceResponse> {
  const query = new URLSearchParams();
  if (params.sourceRecordId) query.set("source_record_id", params.sourceRecordId);
  if (params.family) query.set("family", params.family);
  if (params.kind) query.set("kind", params.kind);
  if (params.retrievalBand) query.set("retrieval_band", params.retrievalBand);
  if (params.outcome) query.set("outcome", params.outcome);
  if (params.query) query.set("q", params.query);
  if (params.limit != null) query.set("limit", String(params.limit));
  if (params.offset != null) query.set("offset", String(params.offset));
  const suffix = query.size ? `?${query.toString()}` : "";
  return getJson(`/api/release-1-1/evidence${suffix}`);
}

export async function fetchCatalogReadModelStatus(): Promise<CatalogReadModelStatus> {
  return getJson("/api/admin/catalog-read-model");
}

export async function fetchAdminOperationsSummary(): Promise<AdminOperationsSummary> {
  return getJson("/api/admin/operations-summary");
}

export async function refreshCatalogReadModel(actor: NavigatorActor): Promise<CatalogReadModelRefreshResponse> {
  return postJson("/api/admin/catalog-read-model/refresh", {}, { actor });
}

export async function fetchExplore(params: {
  query?: string;
  limit?: number;
  georeferencingLimit?: number;
  georeferencingOffset?: number;
  georeferencingPriority?: string;
  georeferencingStatus?: string;
  georeferencingCountry?: string;
  includeGeoreferencing?: boolean;
} = {}): Promise<ExploreResponse> {
  const search = new URLSearchParams({ limit: String(params.limit ?? 8) });
  if (params.query) search.set("q", params.query);
  if (params.includeGeoreferencing) search.set("include_georeferencing", "1");
  if (params.georeferencingLimit) search.set("georeferencing_limit", String(params.georeferencingLimit));
  if (params.georeferencingOffset) search.set("georeferencing_offset", String(params.georeferencingOffset));
  if (params.georeferencingPriority) search.set("georeferencing_priority", params.georeferencingPriority);
  if (params.georeferencingStatus) search.set("georeferencing_status", params.georeferencingStatus);
  if (params.georeferencingCountry) search.set("georeferencing_country", params.georeferencingCountry);
  return getJson(`/api/explore?${search.toString()}`);
}

export async function fetchEntitySearch(params: { query?: string; limit?: number } = {}): Promise<EntitySearchResponse> {
  const search = new URLSearchParams({ limit: String(params.limit ?? 12) });
  if (params.query) search.set("q", params.query);
  return getJson(`/api/entities/search?${search.toString()}`);
}

export async function fetchCandidateEntityGroups(params: { category?: string; query?: string; country?: string; locationState?: string; reviewState?: string; matchState?: string; sort?: string; limit?: number } = {}): Promise<CandidateEntityGroupResponse> {
  const search = new URLSearchParams({ category: params.category ?? "all", limit: String(params.limit ?? 12) });
  if (params.query) search.set("q", params.query);
  if (params.country) search.set("country", params.country);
  if (params.locationState) search.set("location_state", params.locationState);
  if (params.reviewState) search.set("review_state", params.reviewState);
  if (params.matchState) search.set("match_state", params.matchState);
  if (params.sort) search.set("sort", params.sort);
  return getJson(`/api/entities/candidates?${search.toString()}`);
}

export async function fetchCandidateEntityGroup(category: string, id: string): Promise<CandidateEntityDetail> {
  const data = await getJson<{ candidate: CandidateEntityDetail }>(
    `/api/entities/candidates/${encodeURIComponent(category)}/${encodeURIComponent(id)}`
  );
  return data.candidate;
}

export async function fetchPersons(params: { query?: string; source?: string; publicationState?: string; role?: string; entityClass?: string; sort?: string; limit?: number; offset?: number } = {}): Promise<PersonListResponse> {
  const search = new URLSearchParams({ limit: String(params.limit ?? 30), offset: String(params.offset ?? 0) });
  if (params.query) search.set("q", params.query);
  if (params.source) search.set("source", params.source);
  if (params.publicationState) search.set("publication_state", params.publicationState);
  if (params.role) search.set("role", params.role);
  if (params.entityClass) search.set("entity_class", params.entityClass);
  if (params.sort) search.set("sort", params.sort);
  return getJson(`/api/persons?${search.toString()}`);
}

export async function fetchCanonicalActor(id: string, category = "people"): Promise<CanonicalActorDetail> {
  const data = await getJson<{ actor: CanonicalActorDetail }>(
    `/api/entities/${encodeURIComponent(category)}/${encodeURIComponent(id)}?view=summary`
  );
  return data.actor;
}

export async function fetchActorCollection<T>(url: string, query: string, page: number, signal: AbortSignal): Promise<ActorCollectionPage<T>> {
  const search = new URLSearchParams({ q: query, limit: "100", offset: String(page * 100) });
  // Each collection request owns its abort signal; do not reuse a cancelled in-flight request.
  const response = await fetch(`${url}?${search}`, { credentials: "include", signal });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

export async function fetchStructuredName(id: string): Promise<StructuredNameDetail> {
  const data = await getJson<{ name: StructuredNameDetail }>(
    `/api/entities/names/${encodeURIComponent(id)}`
  );
  return data.name;
}

export async function fetchVmiCandidates(params: { query?: string; limit?: number } = {}): Promise<VmiCandidateResponse> {
  const search = new URLSearchParams({ limit: String(params.limit ?? 12) });
  if (params.query) search.set("q", params.query);
  return getJson(`/api/vmi-candidates?${search.toString()}`);
}

export async function fetchOrgans(params: OrganFilters & { limit?: number; offset?: number; includeFacets?: boolean } = {}): Promise<OrganListResponse> {
  const search = new URLSearchParams({ limit: String(params.limit ?? 30), offset: String(params.offset ?? 0) });
  if (params.query) search.set("q", params.query);
  if (params.country) search.set("country", params.country);
  if (params.source) search.set("source", params.source);
  if (params.status) search.set("status", params.status);
  if (params.locationState) search.set("location_state", params.locationState);
  if (params.mediaState) search.set("media_state", params.mediaState);
  if (params.reviewState) search.set("review_state", params.reviewState);
  if (params.builder) search.set("builder", params.builder);
  if (params.institution) search.set("institution", params.institution);
  if (params.yearFrom) search.set("year_from", String(params.yearFrom));
  if (params.yearTo) search.set("year_to", String(params.yearTo));
  if (params.periodBucket) search.set("period_bucket", params.periodBucket);
  if (params.minSources) search.set("min_sources", String(params.minSources));
  if (params.evidenceState) search.set("evidence_state", params.evidenceState);
  if (params.conflictScope) search.set("conflict_scope", params.conflictScope);
  if (params.specificationState) search.set("specification_state", params.specificationState);
  if (params.stopCountBucket) search.set("stop_count_bucket", params.stopCountBucket);
  if (params.eventType) search.set("event_type", params.eventType);
  if (params.virtualInstrument) search.set("virtual_instrument", params.virtualInstrument);
  if (params.historyState) search.set("history_state", params.historyState);
  if (params.mediaKind) search.set("media_kind", params.mediaKind);
  if (params.sort) search.set("sort", params.sort);
  if (params.includeFacets === false) search.set("include_facets", "0");
  return getJson(`/api/organs?${search.toString()}`);
}

export async function fetchEvents(params: { query?: string; subject?: string; type?: string; yearFrom?: number | string; yearTo?: number | string; place?: string; participant?: string; source?: string; completeness?: string; routeState?: string; sort?: string; limit?: number; offset?: number } = {}): Promise<EventListResponse> {
  const search = new URLSearchParams({ limit: String(params.limit ?? 30), offset: String(params.offset ?? 0) });
  if (params.query) search.set("q", params.query);
  if (params.subject) search.set("subject", params.subject);
  if (params.type) search.set("type", params.type);
  if (params.yearFrom) search.set("year_from", String(params.yearFrom));
  if (params.yearTo) search.set("year_to", String(params.yearTo));
  if (params.place) search.set("place", params.place);
  if (params.participant) search.set("participant", params.participant);
  if (params.source) search.set("source", params.source);
  if (params.completeness) search.set("completeness", params.completeness);
  if (params.routeState) search.set("route", params.routeState);
  if (params.sort) search.set("sort", params.sort);
  return getJson(`/api/events?${search.toString()}`);
}

export async function fetchReleaseContext(): Promise<ReleaseContext> {
  return getJson("/api/release-context", { signal: AbortSignal.timeout(15_000) });
}

export async function fetchEvent(id: string): Promise<EventDetail> {
  const data = await getJson<{ event: EventDetail }>(`/api/events/${encodeURIComponent(id)}`);
  return data.event;
}

export async function fetchIdentifierResolution(id: string): Promise<IdentifierResolution> {
  return getJson<IdentifierResolution>(`/api/id/${encodeURIComponent(id)}`);
}

export async function fetchRouteAliasResolution(
  kind: string,
  slug: string,
): Promise<RouteAliasResolution> {
  return getJson<RouteAliasResolution>(
    `/api/aliases/${encodeURIComponent(kind)}/${encodeURIComponent(slug)}`,
  );
}

export async function fetchEventResearch(id: string, actor?: NavigatorActor): Promise<CanonicalEventResearch> {
  const data = await getJson<{ research: CanonicalEventResearch }>(`/api/events/${encodeURIComponent(id)}/research`, { actor });
  return data.research;
}

export async function fetchOrganFacets(params: OrganFilters = {}): Promise<OrganFacets> {
  const search = new URLSearchParams();
  if (params.query) search.set("q", params.query);
  if (params.country) search.set("country", params.country);
  if (params.source) search.set("source", params.source);
  if (params.status) search.set("status", params.status);
  if (params.locationState) search.set("location_state", params.locationState);
  if (params.mediaState) search.set("media_state", params.mediaState);
  if (params.reviewState) search.set("review_state", params.reviewState);
  if (params.builder) search.set("builder", params.builder);
  if (params.institution) search.set("institution", params.institution);
  if (params.yearFrom) search.set("year_from", String(params.yearFrom));
  if (params.yearTo) search.set("year_to", String(params.yearTo));
  if (params.periodBucket) search.set("period_bucket", params.periodBucket);
  if (params.minSources) search.set("min_sources", String(params.minSources));
  if (params.evidenceState) search.set("evidence_state", params.evidenceState);
  if (params.conflictScope) search.set("conflict_scope", params.conflictScope);
  if (params.specificationState) search.set("specification_state", params.specificationState);
  if (params.stopCountBucket) search.set("stop_count_bucket", params.stopCountBucket);
  if (params.eventType) search.set("event_type", params.eventType);
  if (params.virtualInstrument) search.set("virtual_instrument", params.virtualInstrument);
  if (params.historyState) search.set("history_state", params.historyState);
  if (params.mediaKind) search.set("media_kind", params.mediaKind);
  const suffix = search.toString() ? `?${search.toString()}` : "";
  const response = await getJson<OrganFacetResponse>(`/api/organs/facets${suffix}`);
  return response.facets ?? {
    builders: [],
    countries: [],
    institutions: [],
    locationStates: [],
    mediaStates: [],
    periodBuckets: [],
    reviewStates: [],
    sources: [],
    statuses: [],
    sourceCountBuckets: [],
    evidenceStates: [],
    conflictScopes: [],
    specificationStates: [],
    stopCountBuckets: [],
    eventTypes: [],
    historyStates: [],
    mediaKinds: [],
  };
}

export async function fetchOrgan(id: string): Promise<OrganDetail> {
  const data = await getJson<{ organ: OrganDetail }>(`/api/organs/${encodeURIComponent(id)}`);
  return data.organ;
}

export async function fetchOrganMapContextProject(id: string): Promise<OrganMapContextProject> {
  return getJson(`/api/organs/${encodeURIComponent(id)}/map-context.geolibre.json?v=5`);
}

export async function fetchActorMapContextProject(id: string): Promise<ActorMapContextProject> {
  return getJson(`/api/actors/${encodeURIComponent(id)}/activity-map.geolibre.json`);
}

export async function fetchPersistorPublicationStatus(id: string): Promise<PersistorPublicationStatus> {
  return getJson(`/api/id/${encodeURIComponent(id)}/publication-status`);
}

export async function fetchOrganResearch(id: string, actor?: NavigatorActor): Promise<ResearchResponse> {
  const data = await getJson<{ research: ResearchResponse }>(`/api/organs/${encodeURIComponent(id)}/research`, { actor });
  return data.research;
}

export async function fetchOrganSpecification(id: string): Promise<Pick<OrganDetail, "specification" | "componentHierarchy" | "pipework" | "sourceSpecifications" | "technicalEvidence" | "specificationDescriptions">> {
  const data = await getJson<Pick<OrganDetail, "specification" | "componentHierarchy" | "pipework" | "sourceSpecifications" | "technicalEvidence" | "specificationDescriptions">>(
    `/api/organs/${encodeURIComponent(id)}/specification`,
  );
  return {
    specification: data.specification,
    componentHierarchy: data.componentHierarchy,
    pipework: data.pipework,
    sourceSpecifications: data.sourceSpecifications,
    specificationDescriptions: data.specificationDescriptions,
    technicalEvidence: data.technicalEvidence,
  };
}

export async function fetchFunctionalPipePositions(
  organId: string,
  componentId: string,
  options: { offset?: number; limit?: number; referenceId?: string | null } = {},
): Promise<FunctionalPipePositionPage> {
  const search = new URLSearchParams({ component_id: componentId });
  search.set("offset", String(options.offset ?? 0));
  search.set("limit", String(options.limit ?? 100));
  if (options.referenceId) search.set("reference_id", options.referenceId);
  return getJson(`/api/organs/${encodeURIComponent(organId)}/pipe-positions?${search.toString()}`);
}

export async function fetchFunctionalPipePositionDetail(
  organId: string,
  componentId: string,
  referenceId: string,
): Promise<FunctionalPipePositionDetail> {
  const search = new URLSearchParams({ organ_id: organId, component_id: componentId });
  return getJson(`/api/pipe-positions/${encodeURIComponent(referenceId)}?${search.toString()}`);
}

type OrganHistorySection = Pick<OrganDetail, "timeline" | "activities"> & Partial<
  Pick<OrganDetail, "sources" | "documentedStateSummary" | "eventSourceComparisons" | "eventSourceComparisonSummary" | "specificationDescriptions">
>;

export async function fetchOrganHistory(id: string): Promise<OrganHistorySection> {
  // Public history omits sources; absence must preserve the loaded organ's
  // attribution when this section is merged into the detail view.
  return getJson<OrganHistorySection>(
    `/api/organs/${encodeURIComponent(id)}/history`,
  );
}

export async function fetchOrganMedia(id: string): Promise<Pick<OrganDetail, "media" | "derivativeAssets">> {
  return getJson(`/api/organs/${encodeURIComponent(id)}/media`);
}

export async function fetchOrganRelated(id: string): Promise<Pick<OrganDetail, "relatedEntities" | "relatedSummary" | "virtualInstruments">> {
  return getJson(`/api/organs/${encodeURIComponent(id)}/related`);
}

export async function fetchOrganContributions(id: string): Promise<Pick<OrganDetail, "contributions">> {
  return getJson(`/api/organs/${encodeURIComponent(id)}/contributions`);
}

export async function submitContribution(
  request: ContributionRequest,
  actor?: NavigatorActor
): Promise<SafeResult<{ contribution: Contribution; workflowRequest?: Record<string, unknown>; notification?: Record<string, unknown> }>> {
  return postJson("/api/contributions", request, { actor });
}

export async function fetchAuthMe(): Promise<AuthSession> {
  const session = await getJson<AuthSession>("/api/auth/me");
  setAuthCsrfToken(session.csrfToken ?? null);
  return session;
}

export async function login(identifier: string, password: string): Promise<AuthSession | AuthChallenge> {
  const response = requireAuthResponseOk(
    await postJson<AuthSession | AuthChallenge | SafeResult>("/api/auth/login", { identifier, password }, { csrf: false })
  );
  if (response.authenticated) setAuthCsrfToken(response.csrfToken ?? null);
  return response;
}

export async function registerAccount(request: {
  email: string;
  password: string;
  displayName?: string;
  affiliation?: string;
}): Promise<AuthSession | AuthChallenge> {
  const response = requireAuthResponseOk(
    await postJson<AuthSession | AuthChallenge | SafeResult>("/api/auth/register", request, { csrf: false })
  );
  if (response.authenticated) setAuthCsrfToken(response.csrfToken ?? null);
  return response;
}

export async function verifyRegistrationCode(challengeId: string, code: string): Promise<AuthSession> {
  const session = requireAuthResponseOk(
    await postJson<AuthSession | SafeResult>("/api/auth/register/verify", { challengeId, code }, { csrf: false })
  );
  setAuthCsrfToken(session.csrfToken ?? null);
  return session;
}

export async function verifyLoginCode(challengeId: string, code: string): Promise<AuthSession> {
  const session = requireAuthResponseOk(
    await postJson<AuthSession | SafeResult>("/api/auth/login/verify", { challengeId, code }, { csrf: false })
  );
  setAuthCsrfToken(session.csrfToken ?? null);
  return session;
}

export async function resendAuthCode(challengeId: string): Promise<AuthChallenge> {
  return requireAuthResponseOk(
    await postJson<AuthChallenge | SafeResult>("/api/auth/challenge/resend", { challengeId }, { csrf: false })
  );
}

function requireAuthResponseOk<T extends AuthSession | AuthChallenge | SafeResult>(response: T): Extract<T, AuthSession | AuthChallenge> {
  if ("ok" in response && response.ok === false) {
    throw new Error((response as SafeResult).error || "auth_request_failed");
  }
  return response as Extract<T, AuthSession | AuthChallenge>;
}

export async function logout(): Promise<AuthSession> {
  const session = await postJson<AuthSession>("/api/auth/logout", {});
  setAuthCsrfToken(null);
  return session;
}

export async function updateProfile(request: { displayName?: string; affiliation?: string }): Promise<SafeResult<{ account: NavigatorAccount }>> {
  return postJson("/api/auth/profile", request);
}

export async function changePassword(request: { currentPassword: string; newPassword: string }): Promise<SafeResult<Record<string, never>>> {
  return postJson("/api/auth/password", request);
}

export async function updatePreferences(preferences: Record<string, unknown>): Promise<SafeResult<{ preferences: Record<string, unknown> }>> {
  return postJson("/api/auth/preferences", { preferences });
}

export async function fetchMyContributions(limit = 50): Promise<{ items: Contribution[]; total: number; limit: number }> {
  return getJson(`/api/me/contributions?limit=${encodeURIComponent(String(limit))}`);
}

export async function fetchSavedItems(): Promise<{ items: SavedItem[]; total: number }> {
  return getJson("/api/me/saved");
}

export async function saveItem(request: {
  itemType: string;
  itemId: string;
  label?: string;
  url?: string;
  metadata?: Record<string, unknown>;
}): Promise<SafeResult<{ item: SavedItem }>> {
  return postJson("/api/me/saved", request);
}

export async function deleteSavedItem(savedItemId: string): Promise<SafeResult<{ deleted: boolean }>> {
  return deleteJson(`/api/me/saved/${encodeURIComponent(savedItemId)}`);
}

export async function fetchNotifications(): Promise<{ items: UserNotification[]; total: number }> {
  return getJson("/api/me/notifications");
}

export async function markNotificationRead(notificationId: string): Promise<SafeResult<{ notification: UserNotification }>> {
  return postJson(`/api/me/notifications/${encodeURIComponent(notificationId)}/read`, {});
}

export async function fetchModerationSummary(): Promise<ModerationSummary> {
  return getJson("/api/moderation/summary");
}

export async function fetchModerationContributions(limit = 50): Promise<{ items: Contribution[]; total: number; limit: number }> {
  return getJson(`/api/moderation/contributions?limit=${encodeURIComponent(String(limit))}`);
}

export async function reviewContribution(
  contributionId: string,
  request: { decision: string; message?: string }
): Promise<SafeResult<{ contributionId: string; status: string }>> {
  return postJson(`/api/moderation/contributions/${encodeURIComponent(contributionId)}/review`, request);
}

export async function fetchAdminAccounts(query = ""): Promise<AccountListResponse> {
  const search = new URLSearchParams();
  if (query) search.set("q", query);
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return getJson(`/api/admin/accounts${suffix}`);
}

export async function setAccountRoles(accountId: string, roles: NavigatorRole[]): Promise<SafeResult<{ account: NavigatorAccount }>> {
  return postJson(`/api/admin/accounts/${encodeURIComponent(accountId)}/roles`, { roles });
}

export async function revokeAccountSessions(accountId: string): Promise<SafeResult<{ revoked: number }>> {
  return postJson(`/api/admin/accounts/${encodeURIComponent(accountId)}/sessions/revoke`, {});
}

export async function fetchFrameworkContracts(): Promise<SafeResult<FrameworkContracts>> {
  return getJson("/api/framework/contracts");
}

export async function fetchVocabularyOverview(): Promise<VocabularyOverview> {
  return getJson("/api/vocab/overview");
}

export async function fetchVocabularySchemes(): Promise<VocabularyListResponse<VocabularyScheme>> {
  return getJson("/api/vocab/schemes");
}

export async function fetchVocabularyConcepts(params: { schemeCode?: string; languageCode?: string; query?: string; limit?: number; offset?: number } = {}): Promise<VocabularyListResponse<VocabularyConcept>> {
  const search = new URLSearchParams({ limit: String(params.limit ?? 50), offset: String(params.offset ?? 0) });
  if (params.schemeCode) search.set("scheme_code", params.schemeCode);
  if (params.languageCode) search.set("language_code", params.languageCode);
  if (params.query) search.set("q", params.query);
  return getJson(`/api/vocab/concepts?${search.toString()}`);
}

export async function fetchVocabularyLanguages(): Promise<VocabularyLanguageRegistryResponse> {
  return getJson("/api/vocab/languages");
}

export async function planVocabularyLanguageRegistryAddition(
  request: {
    name?: string;
    endonym?: string;
    isLiving?: boolean;
    scope?: string;
    iso6391?: string;
    iso6392?: string;
    bcp47Tag?: string;
    sources?: string[] | string;
    rationale?: string;
  },
  actor?: NavigatorActor,
): Promise<VocabularyLanguageRegistryProposalPlan> {
  return postJson("/api/vocab/languages/proposal-plan", request, { actor });
}

export async function fetchVocabularyLanguageRegistryProposals(
  params: { status?: string; query?: string; limit?: number; offset?: number } = {},
  actor?: NavigatorActor,
): Promise<VocabularyLanguageRegistryProposalListResponse> {
  const search = new URLSearchParams({ limit: String(params.limit ?? 50), offset: String(params.offset ?? 0) });
  if (params.status) search.set("status", params.status);
  if (params.query) search.set("q", params.query);
  return getJson(`/api/vocab/languages/proposals?${search.toString()}`, { actor });
}

export async function saveVocabularyLanguageRegistryProposal(
  request: {
    name?: string;
    endonym?: string;
    isLiving?: boolean;
    scope?: string;
    iso6391?: string;
    iso6392?: string;
    bcp47Tag?: string;
    sources?: string[] | string;
    rationale?: string;
  },
  actor?: NavigatorActor,
): Promise<VocabularyLanguageRegistryProposalPlan> {
  return postJson("/api/vocab/languages/proposals", request, { actor });
}

export async function reviewVocabularyLanguageRegistryProposal(
  proposalId: string,
  request: {
    decision?: string;
    targetStatus?: string;
    rationale?: string;
    actorType?: string;
    agentName?: string;
    modelName?: string;
    confidence?: number;
    humanConfirmed?: boolean;
    authorityValidation?: Record<string, unknown>;
    evidence?: Record<string, unknown>;
  },
  actor: NavigatorActor,
): Promise<VocabularyLanguageRegistryProposalReviewResult> {
  return postJson(`/api/vocab/languages/proposals/${encodeURIComponent(proposalId)}/review`, request, { actor });
}

export async function fetchVocabularyConcept(id: string): Promise<VocabularyConceptDetailResponse> {
  return getJson(`/api/vocab/concepts/${encodeURIComponent(id)}`);
}

export async function fetchVocabularySourceTerms(params: {
  sourceKey?: string;
  sourceTable?: string;
  termClass?: string;
  languageCode?: string;
  mappingStatus?: string;
  query?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<VocabularyListResponse<VocabularySourceTerm>> {
  const search = new URLSearchParams({ limit: String(params.limit ?? 50), offset: String(params.offset ?? 0) });
  if (params.sourceKey) search.set("source_key", params.sourceKey);
  if (params.sourceTable) search.set("source_table", params.sourceTable);
  if (params.termClass) search.set("term_class", params.termClass);
  if (params.languageCode) search.set("language_code", params.languageCode);
  if (params.mappingStatus) search.set("mapping_status", params.mappingStatus);
  if (params.query) search.set("q", params.query);
  return getJson(`/api/vocab/source-terms?${search.toString()}`);
}

export async function fetchVocabularySourceTerm(id: string): Promise<VocabularySourceTermDetailResponse> {
  return getJson(`/api/vocab/source-terms/${encodeURIComponent(id)}`);
}

export async function fetchVocabularySourceTermReviewQueue(params: {
  reviewState?: string;
  sourceKey?: string;
  query?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<VocabularySourceTermReviewQueueResponse> {
  const search = new URLSearchParams({ limit: String(params.limit ?? 50), offset: String(params.offset ?? 0) });
  if (params.reviewState) search.set("review_state", params.reviewState);
  if (params.sourceKey) search.set("source_key", params.sourceKey);
  if (params.query) search.set("q", params.query);
  return getJson(`/api/vocab/source-term-review?${search.toString()}`);
}

export async function fetchVocabularyQaQueue(params: {
  sourceKey?: string;
  query?: string;
  itemType?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<VocabularyQaQueueResponse> {
  const search = new URLSearchParams({ limit: String(params.limit ?? 50), offset: String(params.offset ?? 0) });
  if (params.sourceKey) search.set("source_key", params.sourceKey);
  if (params.query) search.set("q", params.query);
  if (params.itemType) search.set("item_type", params.itemType);
  return getJson(`/api/vocab/qa-queue?${search.toString()}`);
}

export async function fetchVocabularyMappings(params: {
  reviewStatus?: string;
  contextCode?: string;
  query?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<VocabularyListResponse<VocabularyMapping>> {
  const search = new URLSearchParams({ limit: String(params.limit ?? 50), offset: String(params.offset ?? 0) });
  if (params.reviewStatus) search.set("review_status", params.reviewStatus);
  if (params.contextCode) search.set("context_code", params.contextCode);
  if (params.query) search.set("q", params.query);
  return getJson(`/api/vocab/mappings?${search.toString()}`);
}

export async function fetchVocabularyContexts(params: {
  sourceKey?: string;
  reviewStatus?: string;
  query?: string;
  limit?: number;
} = {}): Promise<VocabularyListResponse<VocabularyContext>> {
  const search = new URLSearchParams({ limit: String(params.limit ?? 50) });
  if (params.sourceKey) search.set("source_key", params.sourceKey);
  if (params.reviewStatus) search.set("review_status", params.reviewStatus);
  if (params.query) search.set("q", params.query);
  return getJson(`/api/vocab/contexts?${search.toString()}`);
}

export async function fetchVocabularyOccurrences(params: {
  sourceRecordKey?: string;
  sourceKey?: string;
  sourceTable?: string;
  query?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<VocabularyListResponse<VocabularyOccurrence>> {
  const search = new URLSearchParams({ limit: String(params.limit ?? 50), offset: String(params.offset ?? 0) });
  if (params.sourceRecordKey) search.set("source_record_key", params.sourceRecordKey);
  if (params.sourceKey) search.set("source_key", params.sourceKey);
  if (params.sourceTable) search.set("source_table", params.sourceTable);
  if (params.query) search.set("q", params.query);
  return getJson(`/api/vocab/occurrences?${search.toString()}`);
}

export async function fetchVocabularyChangeLog(params: {
  changeType?: string;
  subjectType?: string;
  query?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<VocabularyChangeLogResponse> {
  const search = new URLSearchParams({ limit: String(params.limit ?? 50), offset: String(params.offset ?? 0) });
  if (params.changeType) search.set("change_type", params.changeType);
  if (params.subjectType) search.set("subject_type", params.subjectType);
  if (params.query) search.set("q", params.query);
  return getJson(`/api/vocab/change-log?${search.toString()}`);
}

export async function planVocabularySourceTermMapping(
  request: VocabularySourceTermMappingReviewRequest,
  actor?: NavigatorActor
): Promise<VocabularySourceTermMappingReviewPlan> {
  return postJson("/api/vocab/source-term-mappings/plan", request, { actor });
}

export async function reviewVocabularySourceTermMapping(
  request: VocabularySourceTermMappingReviewRequest,
  actor: NavigatorActor
): Promise<VocabularySourceTermMappingReviewPlan> {
  return postJson("/api/vocab/source-term-mappings", request, { actor });
}

export async function planExistingVocabularySourceTermMappingReview(
  mappingId: string,
  request: VocabularyExistingMappingReviewRequest,
  actor?: NavigatorActor
): Promise<VocabularySourceTermMappingReviewPlan> {
  return postJson(`/api/vocab/source-term-mappings/${encodeURIComponent(mappingId)}/review-plan`, request, { actor });
}

export async function reviewExistingVocabularySourceTermMapping(
  mappingId: string,
  request: VocabularyExistingMappingReviewRequest,
  actor: NavigatorActor
): Promise<VocabularySourceTermMappingReviewPlan> {
  return postJson(`/api/vocab/source-term-mappings/${encodeURIComponent(mappingId)}/review`, request, { actor });
}

export async function planVocabularyConceptProposal(
  request: VocabularyConceptProposalRequest,
  actor?: NavigatorActor
): Promise<VocabularyConceptProposalPlan> {
  return postJson("/api/vocab/concepts/propose/plan", request, { actor });
}

export async function proposeVocabularyConcept(
  request: VocabularyConceptProposalRequest,
  actor: NavigatorActor
): Promise<VocabularyConceptProposalPlan> {
  return postJson("/api/vocab/concepts/propose", request, { actor });
}

export async function planVocabularyConceptReview(
  conceptId: string,
  request: VocabularyConceptReviewRequest,
  actor?: NavigatorActor
): Promise<VocabularyConceptReviewPlan> {
  return postJson(`/api/vocab/concepts/${encodeURIComponent(conceptId)}/review-plan`, request, { actor });
}

export async function reviewVocabularyConcept(
  conceptId: string,
  request: VocabularyConceptReviewRequest,
  actor: NavigatorActor
): Promise<VocabularyConceptReviewPlan> {
  return postJson(`/api/vocab/concepts/${encodeURIComponent(conceptId)}/review`, request, { actor });
}

export async function planVocabularyConceptLabelLanguage(
  labelId: string | number,
  request: { language_id?: number | null; languageId?: number | null; language_code?: string | null; languageCode?: string | null; rationale?: string },
  actor?: NavigatorActor
): Promise<VocabularyConceptLabelLanguagePlan> {
  return postJson(`/api/vocab/concept-labels/${encodeURIComponent(String(labelId))}/language-plan`, request, { actor });
}

export async function updateVocabularyConceptLabelLanguage(
  labelId: string | number,
  request: { language_id?: number | null; languageId?: number | null; language_code?: string | null; languageCode?: string | null; rationale?: string },
  actor: NavigatorActor
): Promise<VocabularyConceptLabelLanguagePlan> {
  return postJson(`/api/vocab/concept-labels/${encodeURIComponent(String(labelId))}/language`, request, { actor });
}

export async function fetchVocabularyReleases(params: { query?: string; limit?: number; offset?: number } = {}): Promise<VocabularyListResponse<VocabularyRelease>> {
  const search = new URLSearchParams({ limit: String(params.limit ?? 50), offset: String(params.offset ?? 0) });
  if (params.query) search.set("q", params.query);
  return getJson(`/api/vocab/releases?${search.toString()}`);
}

export async function fetchVocabularyRelease(id: string): Promise<VocabularyRelease> {
  const data = await getJson<{ release: VocabularyRelease }>(`/api/vocab/releases/${encodeURIComponent(id)}`);
  return data.release;
}

export async function fetchVocabularyReleaseStorageCheck(id: string): Promise<VocabularyReleaseStorageCheck> {
  return getJson(`/api/vocab/releases/${encodeURIComponent(id)}/artifacts/storage-check`);
}

export async function fetchVocabularyReleaseQualityCheck(id: string): Promise<VocabularyReleaseQualityCheck> {
  return getJson(`/api/vocab/releases/${encodeURIComponent(id)}/quality-check`);
}

export function vocabularyReleaseQualityReportUrl(id: string, format: "json" | "csv"): string {
  return `/api/vocab/releases/${encodeURIComponent(id)}/quality-report.${format}`;
}

export async function repairVocabularyReleaseArtifacts(id: string, actor: NavigatorActor): Promise<Record<string, unknown>> {
  return postJson(`/api/vocab/releases/${encodeURIComponent(id)}/artifacts/repair`, {}, { actor });
}

export async function fetchVocabularyReleaseIdentifierPlan(id: string): Promise<VocabularyReleaseIdentifierPlan> {
  return getJson(`/api/vocab/releases/${encodeURIComponent(id)}/identifier-plan`);
}

export async function registerVocabularyReleaseIdentifier(
  id: string,
  request: { identifier_type?: string; assigned_identifier?: string; assignedIdentifier?: string; identifier?: string; dry_run?: boolean },
  actor: NavigatorActor
): Promise<VocabularyReleaseIdentifierPlan> {
  return postJson(`/api/vocab/releases/${encodeURIComponent(id)}/identifier/register`, request, { actor });
}

export async function planVocabularyRelease(request: VocabularyReleasePlanRequest, actor?: NavigatorActor): Promise<VocabularyReleasePlan> {
  return postJson("/api/vocab/releases/plan", request, { actor });
}

export async function publishVocabularyRelease(request: VocabularyReleasePublishRequest, actor: NavigatorActor): Promise<VocabularyReleasePlan> {
  return postJson("/api/vocab/releases", request, { actor });
}

export async function fetchSourceRecords(params: {
  mode: ViewMode;
  schemaKey?: string;
  status?: string;
  query?: string;
  limit?: number;
  offset?: number;
}): Promise<SourceRecordList> {
  const search = new URLSearchParams({ mode: params.mode, limit: String(params.limit ?? 40) });
  if (params.offset) search.set("offset", String(params.offset));
  if (params.schemaKey) search.set("schema_key", params.schemaKey);
  if (params.status) search.set("status", params.status);
  if (params.query) search.set("q", params.query);
  return getJson(`/api/source-records?${search.toString()}`);
}

export async function fetchDigitalScores(params: {
  mode: ViewMode;
  query?: string;
  title?: string;
  composer?: string;
  catalogNumber?: string;
  collection?: string;
  format?: string;
  license?: string;
  hasSymbolic?: boolean;
  hasMidi?: boolean;
  hasPdf?: boolean;
  assetHealth?: string;
  ambitusStatus?: string;
  evidenceStrength?: string;
  analysisStatus?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}): Promise<DigitalScoreList> {
  const search = new URLSearchParams({ mode: params.mode, limit: String(params.limit ?? 40) });
  if (params.offset) search.set("offset", String(params.offset));
  if (params.query) search.set("q", params.query);
  if (params.title) search.set("title", params.title);
  if (params.composer) search.set("composer", params.composer);
  if (params.catalogNumber) search.set("catalog_number", params.catalogNumber);
  if (params.collection) search.set("collection", params.collection);
  if (params.format) search.set("format", params.format);
  if (params.license) search.set("license", params.license);
  if (params.hasSymbolic !== undefined) search.set("has_symbolic", String(params.hasSymbolic));
  if (params.hasMidi !== undefined) search.set("has_midi", String(params.hasMidi));
  if (params.hasPdf !== undefined) search.set("has_pdf", String(params.hasPdf));
  if (params.assetHealth) search.set("asset_health", params.assetHealth);
  if (params.ambitusStatus) search.set("ambitus_status", params.ambitusStatus);
  if (params.evidenceStrength) search.set("evidence_strength", params.evidenceStrength);
  if (params.analysisStatus) search.set("analysis_status", params.analysisStatus);
  if (params.sort) search.set("sort", params.sort);
  return getJson(`/api/scores?${search.toString()}`);
}

export async function fetchDigitalScore(id: string, mode: ViewMode): Promise<DigitalScoreDetail> {
  const data = await getJson<{ score: DigitalScoreDetail }>(`/api/scores/${encodeURIComponent(id)}?mode=${mode}`);
  return data.score;
}

export async function fetchDigitalScoreAsset(scoreId: string, assetId: string, mode: ViewMode): Promise<DigitalScoreAssetDetail> {
  const data = await getJson<{ asset: DigitalScoreAssetDetail }>(
    `/api/scores/${encodeURIComponent(scoreId)}/assets/${encodeURIComponent(assetId)}?mode=${mode}`
  );
  return data.asset;
}

export async function fetchIconography(params: {
  mode: ViewMode;
  query?: string;
  instrument?: string;
  normalizedInstrument?: string;
  iconographyType?: string;
  objectType?: string;
  category?: string;
  creator?: string;
  collection?: string;
  itemLocation?: string;
  subject?: string;
  iconclass?: string;
  century?: string;
  hasImage?: boolean;
  limit?: number;
  offset?: number;
}): Promise<IconographyList> {
  const search = new URLSearchParams({ mode: params.mode, limit: String(params.limit ?? 40) });
  if (params.offset) search.set("offset", String(params.offset));
  if (params.query) search.set("q", params.query);
  if (params.instrument) search.set("instrument", params.instrument);
  if (params.normalizedInstrument) search.set("normalized_instrument", params.normalizedInstrument);
  if (params.iconographyType) search.set("iconography_type", params.iconographyType);
  if (params.objectType) search.set("object_type", params.objectType);
  if (params.category) search.set("category", params.category);
  if (params.creator) search.set("creator", params.creator);
  if (params.collection) search.set("collection", params.collection);
  if (params.itemLocation) search.set("item_location", params.itemLocation);
  if (params.subject) search.set("subject", params.subject);
  if (params.iconclass) search.set("iconclass", params.iconclass);
  if (params.century) search.set("century", params.century);
  if (params.hasImage !== undefined) search.set("has_image", String(params.hasImage));
  return getJson(`/api/iconography?${search.toString()}`);
}

export async function fetchIconographyRecord(id: string, mode: ViewMode): Promise<IconographyDetail> {
  const data = await getJson<{ record: IconographyDetail }>(`/api/iconography/${encodeURIComponent(id)}?mode=${mode}`);
  return data.record;
}

export async function fetchTemperaments(params: {
  mode: ViewMode;
  query?: string;
  groupKey?: string;
  preciseVariant?: boolean;
  commentaryAvailable?: boolean;
  commentaryQuery?: string;
  queryScope?: "identity";
  limit?: number;
  offset?: number;
}): Promise<TuningSystemList> {
  const search = new URLSearchParams({ mode: params.mode, limit: String(params.limit ?? 40) });
  if (params.offset) search.set("offset", String(params.offset));
  if (params.query) search.set("q", params.query);
  if (params.groupKey) search.set("group_key", params.groupKey);
  if (params.preciseVariant !== undefined) search.set("precise_variant", String(params.preciseVariant));
  if (params.commentaryAvailable !== undefined) search.set("commentary_available", String(params.commentaryAvailable));
  if (params.commentaryQuery) search.set("commentary_q", params.commentaryQuery);
  if (params.queryScope) search.set("scope", params.queryScope);
  return getJson(`/api/temperaments?${search.toString()}`);
}

export async function fetchTemperament(id: string, mode: ViewMode): Promise<TuningSystemDetail> {
  const data = await getJson<{ temperament: TuningSystemDetail }>(`/api/temperaments/${encodeURIComponent(id)}?mode=${mode}`);
  return data.temperament;
}

export async function fetchTemperamentOrgans(id: string, limit = 200, offset = 0): Promise<TuningSystemOrganLinks> {
  const search = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const data = await getJson<{ organs: TuningSystemOrganLinks }>(`/api/temperaments/${encodeURIComponent(id)}/organs?${search.toString()}`);
  return data.organs;
}

export async function fetchMidiAsset(assetId: string, mode: ViewMode): Promise<MidiAssetDetail> {
  const data = await getJson<{ midi: MidiAssetDetail }>(`/api/midi/${encodeURIComponent(assetId)}?mode=${mode}`);
  return data.midi;
}

export async function fetchDigitalScoreReadModelStatus(): Promise<DigitalScoreReadModelStatus> {
  return getJson("/api/admin/digital-score-read-model");
}

export async function refreshDigitalScoreReadModel(actor: NavigatorActor): Promise<DigitalScoreReadModelStatus> {
  return postJson("/api/admin/digital-score-read-model/refresh", {}, { actor });
}

export async function fetchLiteratureStatus(): Promise<LiteratureStatus> {
  return getJson("/api/literature/status");
}

export async function fetchLiterature(params: {
  mode: ViewMode;
  query?: string;
  year?: string;
  yearFrom?: string;
  yearTo?: string;
  collection?: string;
  publicationType?: string;
  author?: string;
  venue?: string;
  volume?: string;
  containerType?: string;
  confidence?: string;
  digitized?: boolean;
  reviewFlag?: string;
  parserStatus?: string;
  hasExternalId?: boolean;
  sort?: string;
  limit?: number;
  offset?: number;
}): Promise<LiteratureList> {
  const search = new URLSearchParams({ mode: params.mode, limit: String(params.limit ?? 40) });
  if (params.offset) search.set("offset", String(params.offset));
  if (params.query) search.set("q", params.query);
  if (params.year) search.set("year", params.year);
  if (params.yearFrom) search.set("year_from", params.yearFrom);
  if (params.yearTo) search.set("year_to", params.yearTo);
  if (params.collection) search.set("collection", params.collection);
  if (params.publicationType) search.set("publication_type", params.publicationType);
  if (params.author) search.set("author", params.author);
  if (params.venue) search.set("venue", params.venue);
  if (params.volume) search.set("volume", params.volume);
  if (params.containerType) search.set("container_type", params.containerType);
  if (params.confidence) search.set("confidence", params.confidence);
  if (params.digitized !== undefined) search.set("digitized", String(params.digitized));
  if (params.reviewFlag) search.set("review_flag", params.reviewFlag);
  if (params.parserStatus) search.set("parser_status", params.parserStatus);
  if (params.hasExternalId !== undefined) search.set("has_external_id", String(params.hasExternalId));
  if (params.sort) search.set("sort", params.sort);
  return getJson(`/api/literature?${search.toString()}`);
}

export async function fetchLiteratureDetail(id: string, mode: ViewMode): Promise<LiteratureDetail> {
  const data = await getJson<{ literature: LiteratureDetail }>(`/api/literature/${encodeURIComponent(id)}?mode=${mode}`);
  return data.literature;
}

export async function fetchDiscovery(params: { mode: ViewMode; query: string }): Promise<DiscoveryResponse> {
  const search = new URLSearchParams({ mode: params.mode, limit: "12" });
  if (params.query) search.set("q", params.query);
  return getJson(`/api/discovery?${search.toString()}`);
}

export async function fetchResolution(params: { mode: ViewMode; query: string }): Promise<ResolutionResponse> {
  const search = new URLSearchParams({ mode: params.mode });
  if (params.query) search.set("q", params.query);
  return getJson(`/api/resolve?${search.toString()}`);
}

export async function fetchSourceRecord(id: string, mode: ViewMode): Promise<SourceRecordDetail> {
  const data = await getJson<{ record: SourceRecordDetail }>(
    `/api/source-records/${encodeURIComponent(id)}?mode=${mode}`
  );
  return data.record;
}

export async function fetchFileEvidence(id: string, mode: ViewMode): Promise<FileEvidenceDetail> {
  const data = await getJson<{ file: FileEvidenceDetail }>(
    `/api/files/${encodeURIComponent(id)}?mode=${mode}`
  );
  return data.file;
}

export async function fetchFileEvidenceList(params: {
  mode: ViewMode;
  query?: string;
  kind?: string;
  limit?: number;
  offset?: number;
}): Promise<FileEvidenceList> {
  const search = new URLSearchParams({ mode: params.mode, limit: String(params.limit ?? 40) });
  if (params.offset) search.set("offset", String(params.offset));
  if (params.query) search.set("q", params.query);
  if (params.kind) search.set("kind", params.kind);
  return getJson(`/api/files?${search.toString()}`);
}

export async function fetchNormalizedDossiers(params: {
  mode: ViewMode;
  query?: string;
  limit?: number;
  offset?: number;
}): Promise<NormalizedDossierList> {
  const search = new URLSearchParams({ mode: params.mode, limit: String(params.limit ?? 30) });
  if (params.offset) search.set("offset", String(params.offset));
  if (params.query) search.set("q", params.query);
  return getJson(`/api/normalized-dossiers?${search.toString()}`);
}

export async function fetchNormalizedDossier(id: string, mode: ViewMode): Promise<NormalizedDossierDetail> {
  const data = await getJson<{ dossier: NormalizedDossierDetail }>(
    `/api/normalized-dossiers/${encodeURIComponent(id)}?mode=${mode}`
  );
  return data.dossier;
}

export function evidencePacketUrl(id: string, download = false): string {
  const search = new URLSearchParams({ mode: "depth" });
  if (download) search.set("download", "1");
  return `/api/normalized-dossiers/${encodeURIComponent(id)}/evidence-packet?${search.toString()}`;
}

export function organResearchRawExportUrl(id: string, actor?: NavigatorActor, download = true): string {
  const search = new URLSearchParams();
  if (download) search.set("download", "1");
  if (actor?.actorId.trim()) search.set("actor_id", actor.actorId.trim());
  if (actor?.authProvider?.trim()) search.set("auth_provider", actor.authProvider.trim());
  if (actor?.subject?.trim()) search.set("subject", actor.subject.trim());
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return `/api/organs/${encodeURIComponent(id)}/research/raw-export${suffix}`;
}

export async function fetchProcessorWorkbench(_actor?: NavigatorActor): Promise<ProcessorWorkbench> {
  return getJson("/api/processor/workbench");
}

export async function fetchProcessorPublicModels(): Promise<SafeResult<ProcessorPublicModelDiscovery>> {
  return getJson("/api/processor/public-models");
}

export async function fetchProcessorPublicModelBundle(modelId: string): Promise<SafeResult<ProcessorPublicModelBundle>> {
  return getJson(`/api/processor/public-models/${encodeURIComponent(modelId)}`);
}

export async function fetchAutonomousBootstrapDashboard(params: {
  limit?: number;
  sourceRecordId?: string;
  outcome?: string;
} = {}): Promise<AutonomousBootstrapDashboard> {
  const search = new URLSearchParams({ limit: String(params.limit ?? 80) });
  if (params.sourceRecordId) search.set("source_record_id", params.sourceRecordId);
  if (params.outcome) search.set("outcome", params.outcome);
  return getJson(`/api/processor/autonomous-bootstrap?${search.toString()}`);
}

export function autonomousBootstrapProvenanceUrl(format: "jsonld" | "ttl", subjectId?: string): string {
  const search = new URLSearchParams({ format });
  if (subjectId) search.set("subject_id", subjectId);
  return `/api/processor/autonomous-bootstrap/provenance?${search.toString()}`;
}

export async function supersedeAutonomousBootstrapException(
  decisionId: string,
  request: {
    exception_kind: "resolution";
    observation_id: string;
    action: "link_existing" | "create_provisional" | "abstain" | "reject" | "exception_review";
    chosen_candidate_id?: string;
    reason_codes?: string[];
    rationale: string;
  },
): Promise<AutonomousBootstrapSupersessionResult> {
  return postJson(
    `/api/processor/autonomous-bootstrap/exceptions/${encodeURIComponent(decisionId)}/supersede`,
    request,
  );
}

export async function fetchProcessorReviewWorkbench(params: {
  limit?: number;
  offset?: number;
  sourceRecordId?: string;
  sessionId?: string;
  candidateKind?: string;
  country?: string;
} = {}): Promise<ProcessorReviewWorkbench> {
  const search = new URLSearchParams({ limit: String(params.limit ?? 50), offset: String(params.offset ?? 0) });
  if (params.sourceRecordId) search.set("source_record_id", params.sourceRecordId);
  if (params.sessionId) search.set("session_id", params.sessionId);
  if (params.candidateKind) search.set("candidate_kind", params.candidateKind);
  if (params.country) search.set("country", params.country);
  return getJson(`/api/processor/review-workbench?${search.toString()}`);
}

export async function planProcessorReviewBatch(
  request: {
    candidate_ids: string[];
    decision?: string;
    limit?: number;
    offset?: number;
    source_record_id?: string;
    session_id?: string;
    candidate_kind?: string;
    country?: string;
    execute?: boolean;
    confirmation_phrase?: string;
  },
  actor: NavigatorActor
): Promise<ProcessorReviewBatchPlan> {
  return postJson("/api/processor/review-workbench/batch", request, { actor });
}

export async function fetchProcessorReviewBatchReceipts(
  params: {
    limit?: number;
    actorId?: string;
    sourceRecordId?: string;
    sessionId?: string;
  },
  actor: NavigatorActor
): Promise<ProcessorReviewBatchReceiptList> {
  const search = new URLSearchParams({ limit: String(params.limit ?? 20) });
  if (params.actorId) search.set("actor_id", params.actorId);
  if (params.sourceRecordId) search.set("source_record_id", params.sourceRecordId);
  if (params.sessionId) search.set("session_id", params.sessionId);
  return getJson(`/api/processor/review-workbench/batches?${search.toString()}`, { actor });
}

export async function fetchBuilderNameClassificationQueue(params: { limit?: number } = {}): Promise<BuilderNameClassificationQueue> {
  const search = new URLSearchParams({ limit: String(params.limit ?? 100) });
  return getJson(`/api/processor/classification/builder-name-queue?${search.toString()}`);
}

export async function fetchBuilderNameClassificationReceipts(
  params: { limit?: number; status?: string } = {}
): Promise<BuilderNameClassificationReceiptList> {
  const search = new URLSearchParams({ limit: String(params.limit ?? 100) });
  if (params.status) search.set("status", params.status);
  return getJson(`/api/processor/classification/builder-name-receipts?${search.toString()}`);
}

export async function fetchBuilderNameClassificationIngestionPlan(
  params: { limit?: number; status?: string } = {},
  actor?: NavigatorActor
): Promise<BuilderNameClassificationIngestionPlan> {
  const search = new URLSearchParams({ limit: String(params.limit ?? 100) });
  if (params.status) search.set("status", params.status);
  return getJson(`/api/processor/classification/builder-name-ingestion-plan?${search.toString()}`, { actor });
}

export async function runBuilderNameClassificationIngestion(
  request: { limit?: number; status?: string; confirmation_phrase: string },
  actor: NavigatorActor
): Promise<BuilderNameClassificationIngestionRun> {
  return postJson("/api/processor/classification/builder-name-ingestion-run", request, { actor });
}

export async function fetchBuilderNameSlmClassificationPlan(
  params: { classificationId?: string; dedupeNameKey?: string; limit?: number },
  actor?: NavigatorActor
): Promise<BuilderNameSlmClassificationPlan> {
  const search = new URLSearchParams({ limit: String(params.limit ?? 100) });
  if (params.classificationId) search.set("classification_id", params.classificationId);
  if (params.dedupeNameKey) search.set("dedupe_name_key", params.dedupeNameKey);
  return getJson(`/api/processor/classification/builder-name-slm-plan?${search.toString()}`, { actor });
}

export async function runBuilderNameSlmClassification(
  request: { classification_id?: string; dedupe_name_key?: string; limit?: number; confirmation_phrase: string },
  actor: NavigatorActor
): Promise<BuilderNameSlmClassificationRun> {
  return postJson("/api/processor/classification/builder-name-slm-run", request, { actor });
}

export async function fetchBuilderNameSlmBatchPlan(
  params: { limit?: number; batchLimit?: number } = {},
  actor?: NavigatorActor
): Promise<BuilderNameSlmBatchPlan> {
  const search = new URLSearchParams({
    limit: String(params.limit ?? 100),
    batch_limit: String(params.batchLimit ?? 5),
  });
  return getJson(`/api/processor/classification/builder-name-slm-batch-plan?${search.toString()}`, { actor });
}

export async function runBuilderNameSlmBatchClassification(
  request: { limit?: number; batch_limit?: number; confirmation_phrase: string },
  actor: NavigatorActor
): Promise<BuilderNameSlmBatchRun> {
  return postJson("/api/processor/classification/builder-name-slm-batch-run", request, { actor });
}

export async function fetchBuilderNameClassificationParadata(params: {
  limit?: number;
  offset?: number;
  eventType?: string;
  classificationId?: string;
  dedupeNameKey?: string;
  query?: string;
} = {}): Promise<BuilderNameClassificationParadata> {
  const search = new URLSearchParams({ limit: String(params.limit ?? 100) });
  if (params.offset) search.set("offset", String(params.offset));
  if (params.eventType) search.set("event_type", params.eventType);
  if (params.classificationId) search.set("classification_id", params.classificationId);
  if (params.dedupeNameKey) search.set("dedupe_name_key", params.dedupeNameKey);
  if (params.query) search.set("q", params.query);
  return getJson(`/api/processor/classification/builder-name-paradata?${search.toString()}`);
}

export async function fetchProcessorActorPermissions(
  actorId: string,
  permissions: string[]
): Promise<ProcessorActorPermissionsResponse> {
  const search = new URLSearchParams();
  permissions.forEach((permission) => {
    if (permission.trim()) search.append("permission", permission.trim());
  });
  return getJson(`/api/processor/actors/${encodeURIComponent(actorId)}/permissions?${search.toString()}`);
}

export async function fetchProcessorRunInspection(id: string, actor?: NavigatorActor): Promise<ProcessorRunInspection> {
  const search = new URLSearchParams();
  if (actor?.actorId.trim()) search.set("actor_id", actor.actorId.trim());
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return getJson(`/api/processor/runs/${encodeURIComponent(id)}/inspection${suffix}`);
}

export function processorRunInspectionUrl(id: string, actor?: NavigatorActor): string {
  const search = new URLSearchParams();
  if (actor?.actorId.trim()) search.set("actor_id", actor.actorId.trim());
  if (actor?.authProvider?.trim()) search.set("auth_provider", actor.authProvider.trim());
  if (actor?.subject?.trim()) search.set("subject", actor.subject.trim());
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return `/api/processor/runs/${encodeURIComponent(id)}/inspection${suffix}`;
}

export function processorRunEventStreamUrl(id: string, actor?: NavigatorActor): string {
  const search = new URLSearchParams();
  if (actor?.actorId.trim()) search.set("actor_id", actor.actorId.trim());
  if (actor?.authProvider?.trim()) search.set("auth_provider", actor.authProvider.trim());
  if (actor?.subject?.trim()) search.set("subject", actor.subject.trim());
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return `/api/processor/runs/${encodeURIComponent(id)}/events/stream${suffix}`;
}

export async function cancelProcessorRun(
  id: string,
  request: { reason?: string },
  actor: NavigatorActor
): Promise<SafeResult> {
  return postJson(`/api/processor/runs/${encodeURIComponent(id)}/cancel`, request, { actor });
}

export async function retryProcessorRun(
  id: string,
  request: { confirm_retry_run_id: string; idempotency_key?: string },
  actor: NavigatorActor
): Promise<SafeResult> {
  return postJson(`/api/processor/runs/${encodeURIComponent(id)}/retry`, request, {
    actor,
    idempotencyKey: request.idempotency_key
  });
}

export async function renewProcessorRunLease(
  id: string,
  request: { worker_id: string; lease_seconds?: number },
  actor: NavigatorActor
): Promise<SafeResult> {
  return postJson(`/api/processor/runs/${encodeURIComponent(id)}/renew-lease`, request, { actor });
}

export async function fetchAggregatorWorkbench(): Promise<AggregatorWorkbench> {
  return getJson("/api/aggregator/workbench");
}

export async function runProcessorJob(
  moduleName: string,
  request: ProcessorJobRequest,
  actor?: NavigatorActor
): Promise<SafeResult> {
  return postJson(`/api/processor/modules/${moduleName}/jobs`, request, { actor });
}

export async function detectVocabularyLanguageInline(
  items: VocabularyLanguageInlineDetectionItem[],
  candidateLanguages?: string[]
): Promise<VocabularyLanguageInlineDetectionResponse> {
  const payload: Record<string, unknown> = { items };
  if (candidateLanguages && candidateLanguages.length > 0) payload.candidate_languages = candidateLanguages;
  const result = await runProcessorJob("language_detection", { job_type: "detect_inline", payload });
  if (!result.ok) {
    throw new Error(result.error || "Language detection preview failed.");
  }
  const data = result.data as VocabularyLanguageInlineDetectionResponse;
  return {
    ...data,
    items: (data.items ?? []).map((item) => ({
      ...item,
      languageQa: normalizeVocabularyLanguageQa(item.languageQa),
    })),
  };
}

function normalizeVocabularyLanguageQa(value: unknown): VocabularyLanguageQa | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  return {
    detectionId: (item.detectionId ?? item.detection_id) as string | null | undefined,
    detectionKey: (item.detectionKey ?? item.detection_key) as string | null | undefined,
    subjectTable: (item.subjectTable ?? item.subject_table) as string | null | undefined,
    subjectId: (item.subjectId ?? item.subject_id) as string | null | undefined,
    subjectField: (item.subjectField ?? item.subject_field) as string | null | undefined,
    sourcePath: (item.sourcePath ?? item.source_path) as string | null | undefined,
    sourceRecordId: (item.sourceRecordId ?? item.source_record_id) as string | null | undefined,
    inputText: (item.inputText ?? item.input_text) as string | null | undefined,
    inputTextSha256: (item.inputTextSha256 ?? item.input_text_sha256) as string | null | undefined,
    normalizedInputSha256: (item.normalizedInputSha256 ?? item.normalized_input_sha256) as string | null | undefined,
    storedLanguageCode: (item.storedLanguageCode ?? item.stored_language_code) as string | null | undefined,
    storedLanguageId: (item.storedLanguageId ?? item.stored_language_id) as number | null | undefined,
    detectedLanguageCode: (item.detectedLanguageCode ?? item.detected_language_code) as string | null | undefined,
    confidence: (item.confidence as number | null | undefined),
    margin: (item.margin as number | null | undefined),
    candidates: (Array.isArray(item.candidates) ? item.candidates : []) as VocabularyLanguageQa["candidates"],
    detector: (item.detector && typeof item.detector === "object" ? item.detector : {}) as Record<string, unknown>,
    detectedAt: (item.detectedAt ?? item.detected_at) as string | null | undefined,
    qaStatus: (item.qaStatus ?? item.qa_status) as VocabularyLanguageQa["qaStatus"],
    detectionStatus: (item.detectionStatus ?? item.detection_status) as VocabularyLanguageQa["detectionStatus"],
    flags: (Array.isArray(item.flags) ? item.flags : []) as string[],
    navigatorLabel: (item.navigatorLabel ?? item.navigator_label) as string | null | undefined,
    suggestedLanguageCode: (item.suggestedLanguageCode ?? item.suggested_language_code) as string | null | undefined,
    createdAt: (item.createdAt ?? item.created_at) as string | null | undefined,
    updatedAt: (item.updatedAt ?? item.updated_at) as string | null | undefined,
  };
}

export async function fetchImagesegAnnotationView(target: ImagesegAnnotationTarget): Promise<ImagesegAnnotationView> {
  const load = async (includeImageDataUrl: boolean) => {
    const payload: Record<string, unknown> = {};
    if (target.runId) payload.run_id = target.runId;
    if (target.mediaReferenceId) payload.media_reference_id = target.mediaReferenceId;
    if (target.imageIdentifier) payload.image_identifier = target.imageIdentifier;
    if (includeImageDataUrl) payload.include_image_data_url = true;
    const result = await runProcessorJob("imageseg", { job_type: "annotation_view", payload });
    return result;
  };
  let result = await load(Boolean(target.includeImageDataUrl));
  if (!result.ok) {
    throw new Error(result.error || "Unable to load image segments");
  }
  let data = result.data as ImagesegAnnotationView | undefined;
  if (!data || data.status !== "ok") {
    throw new Error((data as { error?: string; message?: string } | undefined)?.error || (data as { message?: string } | undefined)?.message || "Image segments are unavailable");
  }
  const missingBrowserSrc = !data.image?.display_url && Boolean(data.image?.local_path_available || data.image?.image_uri?.startsWith("file://"));
  if (!target.includeImageDataUrl && missingBrowserSrc) {
    result = await load(true);
    if (!result.ok) {
      throw new Error(result.error || "Unable to embed the local image for annotation");
    }
    data = result.data as ImagesegAnnotationView | undefined;
    if (!data || data.status !== "ok") {
      throw new Error((data as { error?: string; message?: string } | undefined)?.error || (data as { message?: string } | undefined)?.message || "Embedded image segments are unavailable");
    }
  }
  return data;
}

export async function fetchImagesegSegmentAnnotations(
  target: ImagesegAnnotationTarget & { segmentIds?: string[] }
): Promise<ImagesegSegmentAnnotation[]> {
  const params = new URLSearchParams();
  for (const segmentId of target.segmentIds ?? []) {
    if (segmentId) params.append("segment_id", segmentId);
  }
  if (target.runId) params.set("run_id", target.runId);
  if (target.mediaReferenceId) params.set("media_reference_id", target.mediaReferenceId);
  if (target.imageIdentifier) params.set("image_identifier", target.imageIdentifier);
  if (target.organId) params.set("organ_id", target.organId);
  const query = params.toString();
  const result = await getJson<SafeResult<{ items: ImagesegSegmentAnnotation[] }>>(`/api/imageseg/annotations${query ? `?${query}` : ""}`);
  if (!result.ok) {
    throw new Error(result.error || "Unable to load segment annotations");
  }
  return result.data?.items ?? [];
}

export async function fetchImagesegLabelSuggestions(
  target: ImagesegAnnotationTarget & { query?: string; limit?: number }
): Promise<ImagesegLabelSuggestion[]> {
  const params = new URLSearchParams();
  if (target.query) params.set("q", target.query);
  if (target.runId) params.set("run_id", target.runId);
  if (target.mediaReferenceId) params.set("media_reference_id", target.mediaReferenceId);
  if (target.imageIdentifier) params.set("image_identifier", target.imageIdentifier);
  if (target.organId) params.set("organ_id", target.organId);
  if (target.limit) params.set("limit", String(target.limit));
  const query = params.toString();
  const result = await getJson<SafeResult<{ items: ImagesegLabelSuggestion[] }>>(`/api/imageseg/label-suggestions${query ? `?${query}` : ""}`);
  if (!result.ok) {
    throw new Error(result.error || "Unable to load label suggestions");
  }
  return result.data?.items ?? [];
}

export async function fetchImagesegAnnotationAudit(segmentId: string): Promise<ImagesegAnnotationAuditEntry[]> {
  const params = new URLSearchParams();
  params.set("segment_id", segmentId);
  const result = await getJson<SafeResult<{ items: ImagesegAnnotationAuditEntry[] }>>(`/api/imageseg/annotations/audit?${params.toString()}`);
  if (!result.ok) {
    throw new Error(result.error || "Unable to load annotation history");
  }
  return result.data?.items ?? [];
}

export async function fetchImagesegViewState(targetKey: string): Promise<ImagesegViewStateRecord> {
  const params = new URLSearchParams({ target_key: targetKey });
  const result = await getJson<SafeResult<ImagesegViewStateRecord>>(`/api/imageseg/view-state?${params.toString()}`);
  if (!result.ok) {
    throw new Error(result.error || "Unable to load annotation view state");
  }
  return result.data ?? { state: {} };
}

export async function saveImagesegViewState(
  request: ImagesegAnnotationTarget & { targetKey: string; state: ImagesegViewState },
  actor?: NavigatorActor
): Promise<ImagesegViewStateRecord> {
  const result = await postJson<SafeResult<ImagesegViewStateRecord>>(
    "/api/imageseg/view-state",
    {
      targetKey: request.targetKey,
      runId: request.runId,
      mediaReferenceId: request.mediaReferenceId,
      imageIdentifier: request.imageIdentifier,
      organId: request.organId,
      state: request.state,
    },
    { actor }
  );
  if (!result.ok || !result.data) {
    throw new Error(result.error || "Unable to save annotation view state");
  }
  return result.data;
}

export async function saveImagesegSegmentAnnotation(
  request: ImagesegSegmentAnnotationSaveRequest,
  actor?: NavigatorActor
): Promise<ImagesegSegmentAnnotation> {
  const result = await postJson<SafeResult<ImagesegSegmentAnnotation>>("/api/imageseg/annotations", request, { actor });
  if (!result.ok || !result.data) {
    throw new Error(result.error || "Unable to save segment annotation");
  }
  return result.data;
}

export async function runProcessorBackgroundJob(
  moduleName: string,
  request: ProcessorJobRequest,
  actor?: NavigatorActor
): Promise<SafeResult> {
  const idempotencyKey = typeof request.payload.idempotency_key === "string" ? request.payload.idempotency_key : undefined;
  return postJson(`/api/processor/modules/${moduleName}/jobs/background`, request, { actor, idempotencyKey });
}

export async function submitSourceProposal(request: SourceProposalRequest): Promise<SafeResult<SourceProposalResponse>> {
  return postJson("/api/aggregator/proposals/source", request);
}

export async function submitAssetProposal(request: SourceProposalRequest): Promise<SafeResult<SourceProposalResponse>> {
  return postJson("/api/aggregator/proposals/asset", request);
}

export async function fetchDocumentationHub(): Promise<DocumentationHub> {
  return getJson("/api/docs");
}

export async function fetchInternalDocumentationHub(profile: InternalDocumentationProfile): Promise<InternalDocumentationHub> {
  return getJson(`/api/internal/docs/${encodeURIComponent(profile)}`);
}

export async function fetchInternalDocumentationPages(profile: InternalDocumentationProfile, options: {
  query?: string; category?: string; audience?: string; component?: string; language?: string;
  kind?: string; authority?: string; lifecycle?: string; taskTag?: string; reviewStatus?: string;
  limit?: number; offset?: number;
} = {}): Promise<InternalDocumentationPageList> {
  const params = new URLSearchParams();
  if (options.query) params.set("q", options.query);
  if (options.category) params.set("category", options.category);
  if (options.audience) params.set("audience", options.audience);
  if (options.component) params.set("component", options.component);
  if (options.language) params.set("language", options.language);
  if (options.kind) params.set("kind", options.kind);
  if (options.authority) params.set("authority", options.authority);
  if (options.lifecycle) params.set("lifecycle", options.lifecycle);
  if (options.taskTag) params.set("task_tag", options.taskTag);
  if (options.reviewStatus) params.set("review_status", options.reviewStatus);
  if (options.limit != null) params.set("limit", String(options.limit));
  if (options.offset != null) params.set("offset", String(options.offset));
  return getJson(`/api/internal/docs/${encodeURIComponent(profile)}/pages?${params.toString()}`);
}

export async function fetchInternalDocumentationPage(
  profile: InternalDocumentationProfile,
  slug: string,
): Promise<InternalDocumentationPage> {
  const path = slug.split("/").map(encodeURIComponent).join("/");
  return getJson(`/api/internal/docs/${encodeURIComponent(profile)}/pages/${path}`);
}

export async function fetchDocumentationPages(options: {
  query?: string; category?: string; audience?: string; component?: string; language?: string;
  release?: string; limit?: number; offset?: number;
} = {}): Promise<DocumentationPageList> {
  const params = new URLSearchParams();
  if (options.query) params.set("q", options.query);
  if (options.category) params.set("category", options.category);
  if (options.audience) params.set("audience", options.audience);
  if (options.component) params.set("component", options.component);
  if (options.language) params.set("language", options.language);
  if (options.release) params.set("release", options.release);
  if (options.limit != null) params.set("limit", String(options.limit));
  if (options.offset != null) params.set("offset", String(options.offset));
  return getJson(`/api/docs/pages?${params.toString()}`);
}

export async function fetchDocumentationPage(slug: string, version?: string | null): Promise<DocumentationPage> {
  const path = version
    ? `/api/docs/v/${encodeURIComponent(version)}/pages/${slug.split("/").map(encodeURIComponent).join("/")}`
    : `/api/docs/pages/${slug.split("/").map(encodeURIComponent).join("/")}`;
  const result = await getJson<{ page: DocumentationPage }>(path);
  return result.page;
}

export async function fetchDocumentationReleases(): Promise<{ ok: boolean; items: DocumentationRelease[]; total: number }> {
  return getJson("/api/docs/releases");
}

export async function fetchDocumentationRelease(version: string): Promise<DocumentationRelease> {
  const result = await getJson<{ release: DocumentationRelease }>(`/api/docs/releases/${encodeURIComponent(version)}`);
  return result.release;
}

export async function fetchDocumentationAdminStatus(): Promise<Record<string, unknown>> {
  return getJson("/api/admin/docs/status");
}

export async function stageDocumentationReleaseBundle(file: File): Promise<DocumentationReleasePlan> {
  recentGetJson.clear();
  const form = new FormData();
  form.append("bundle", file, file.name);
  const headers: Record<string, string> = {};
  if (authCsrfToken) headers["X-CSRF-Token"] = authCsrfToken;
  const response = await fetch("/api/admin/docs/releases/plan", { method: "POST", credentials: "include", headers, body: form });
  const payload = await response.json();
  if (!response.ok && !payload?.error) throw new Error(`${response.status} ${response.statusText}`);
  return payload as DocumentationReleasePlan;
}

export async function publishDocumentationRelease(planId: string, confirmationPhrase: string): Promise<DocumentationReleasePlan> {
  return postJson("/api/admin/docs/releases", { plan_id: planId, confirmation_phrase: confirmationPhrase });
}

export async function fetchDocumentationPreview(planId: string, slug: string): Promise<{ preview: true; planId: string; page: DocumentationPage & { release: DocumentationRelease }; robots: string }> {
  return getJson(`/api/admin/docs/plans/${encodeURIComponent(planId)}/pages/${slug.split("/").map(encodeURIComponent).join("/")}`);
}

export async function fetchDocumentationIdentifierPlan(version: string): Promise<Record<string, unknown>> {
  return getJson(`/api/admin/docs/releases/${encodeURIComponent(version)}/identifier-plan`);
}

export async function registerDocumentationIdentifier(version: string, dryRun = true): Promise<Record<string, unknown>> {
  return postJson(`/api/admin/docs/releases/${encodeURIComponent(version)}/identifier/register`, { dry_run: dryRun });
}

function actorHeaders(actor?: NavigatorActor): Record<string, string> {
  if (!actor?.actorId.trim()) return {};
  return {
    "X-Navigator-Actor-Id": actor.actorId.trim(),
    "X-Navigator-Auth-Provider": actor.authProvider?.trim() || "navigator",
    "X-Navigator-Subject": actor.subject?.trim() || actor.actorId.trim(),
  };
}

const GET_DEDUPE_TTL_MS = 2000;
const inFlightGetJson = new Map<string, Promise<unknown>>();
const recentGetJson = new Map<string, { expiresAt: number; value: unknown }>();
let authCsrfToken: string | null = null;

export function setAuthCsrfToken(token: string | null): void {
  authCsrfToken = token;
}

function getCacheKey(url: string, headers: Record<string, string>): string {
  const headerKey = Object.entries(headers)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value}`)
    .join("|");
  return `${url}::${headerKey}`;
}

async function getJson<T>(url: string, options: { actor?: NavigatorActor; signal?: AbortSignal } = {}): Promise<T> {
  const headers = actorHeaders(options.actor);
  const cacheKey = getCacheKey(url, headers);
  const cached = recentGetJson.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  if (cached) recentGetJson.delete(cacheKey);
  const inFlight = inFlightGetJson.get(cacheKey);
  if (inFlight) return inFlight as Promise<T>;
  const request = fetch(url, { headers, credentials: "include", signal: options.signal })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const payload = await response.json();
      recentGetJson.set(cacheKey, { expiresAt: Date.now() + GET_DEDUPE_TTL_MS, value: payload });
      return payload as T;
    })
    .finally(() => {
      inFlightGetJson.delete(cacheKey);
    });
  inFlightGetJson.set(cacheKey, request);
  return request;
}

async function postJson<T>(
  url: string,
  body: unknown,
  options: { actor?: NavigatorActor; idempotencyKey?: string; csrf?: boolean } = {}
): Promise<T> {
  recentGetJson.clear();
  const headers: Record<string, string> = { "Content-Type": "application/json", ...actorHeaders(options.actor) };
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  if (options.csrf !== false && authCsrfToken) headers["X-CSRF-Token"] = authCsrfToken;
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok && !payload?.error) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  recentGetJson.clear();
  return payload as T;
}

async function deleteJson<T>(url: string, options: { actor?: NavigatorActor } = {}): Promise<T> {
  recentGetJson.clear();
  const headers: Record<string, string> = { ...actorHeaders(options.actor) };
  if (authCsrfToken) headers["X-CSRF-Token"] = authCsrfToken;
  const response = await fetch(url, {
    method: "DELETE",
    credentials: "include",
    headers,
  });
  const payload = await response.json();
  if (!response.ok && !payload?.error) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  recentGetJson.clear();
  return payload as T;
}
