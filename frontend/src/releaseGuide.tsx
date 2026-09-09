import { AlertCircle, CheckCircle2, Database, Eye, EyeOff, Info, MapPin, ShieldCheck } from "lucide-react";
import type { ReleaseContext } from "./api";

function number(value?: number): string {
  return new Intl.NumberFormat("en").format(value || 0);
}

function PublicDataGuide({ context }: { context: ReleaseContext }) {
  const highlights = context.publicHighlights ?? [];
  const excluded = context.excludedFromPublicView ?? [];
  return (
    <article className="entity-section release-guide public-data-guide" id="release-guide" tabIndex={-1}>
      <header className="release-guide-hero public-data-guide-hero">
        <div>
          <p className="eyebrow">About the data</p>
          <h2>{context.title}</h2>
          <p>{context.summary}</p>
          <p>Navigator is part of the MODAVIS PhD project, supporting research on pipe organs and their documented histories.</p>
        </div>
        <aside>
          <strong>What you can do here</strong>
          <p>{context.changeFocus}</p>
        </aside>
      </header>

      {highlights.length > 0 && (
        <section className="release-guide-section limitations">
          <h3><Eye size={19} aria-hidden="true" /> What the public Navigator includes</h3>
          <ul>{highlights.map((item) => <li key={item}><CheckCircle2 size={16} aria-hidden="true" /><span>{item}</span></li>)}</ul>
        </section>
      )}

      <section className="release-guide-section limitations">
        <h3><Info size={19} aria-hidden="true" /> Keep in mind</h3>
        <ul>{context.limitations.map((item) => <li key={item}><CheckCircle2 size={16} aria-hidden="true" /><span>{item}</span></li>)}</ul>
      </section>

      {excluded.length > 0 && (
        <section className="release-guide-section limitations public-data-exclusions">
          <h3><EyeOff size={19} aria-hidden="true" /> What is not shown publicly</h3>
          <ul>{excluded.map((item) => <li key={item}><CheckCircle2 size={16} aria-hidden="true" /><span>{item}</span></li>)}</ul>
        </section>
      )}

      <details className="release-guide-section public-data-technical">
        <summary>Dataset and reproducibility details</summary>
        <dl>
          <div><dt>Dataset version</dt><dd>{context.releaseVersion}</dd></div>
          <div><dt>Access</dt><dd>Public and read-only</dd></div>
          <div><dt>Content</dt><dd>Structured records approved for public distribution</dd></div>
        </dl>
        <p>{context.documentationPolicy}</p>
        {context.documentationUrl && <a href={context.documentationUrl}>Citation and download information</a>}
      </details>
    </article>
  );
}

function ReviewerReleaseGuide({ context }: { context: ReleaseContext }) {
  const actor = context.actorIdentity;
  const map = context.map;
  return (
    <article className="entity-section release-guide" id="release-guide" tabIndex={-1}>
      <header className="release-guide-hero">
        <div>
          <p className="eyebrow">Reviewer guide · not a publication</p>
          <h2>{context.title}</h2>
          <p>{context.summary}</p>
          <div className="release-guide-badges">
            <span><ShieldCheck size={15} /> {context.publicationLabel}</span>
            <span><Database size={15} /> {context.readOnly ? "Verified read-only baseline" : "Read-only status unavailable"}</span>
            <span>Release {context.releaseVersion}</span>
          </div>
        </div>
        <aside>
          <strong>Change focus</strong>
          <p>{context.changeFocus}</p>
          {context.baselineRelease && <span>Evidence baseline: Release {context.baselineRelease}</span>}
        </aside>
      </header>

      <section className="release-guide-boundary" aria-labelledby="release-boundary-title">
        <AlertCircle size={20} aria-hidden="true" />
        <div>
          <h3 id="release-boundary-title">Citation and authority boundary</h3>
          <p>{context.documentationPolicy}</p>
          {context.documentationUrl && <a href={context.documentationUrl}>Open approved documentation catalog</a>}
        </div>
      </section>

      {actor && (
        <section className="release-guide-section">
          <h3>What Release {context.releaseVersion} changes</h3>
          <div className="release-guide-metrics">
            <div><strong>{number(actor.acceptedAliases)}</strong><span>strict actor aliases</span></div>
            <div><strong>{number(actor.evidenceDependencies)}</strong><span>evidence dependencies</span></div>
            <div><strong>{number(actor.peopleBefore)} → {number(actor.peopleAfter)}</strong><span>person dossiers</span></div>
            <div><strong>{number(actor.coreEntityWrites)}</strong><span>core-entity writes</span></div>
          </div>
          <p>The projection changes navigation and display identity only. Retained MODAVIS identifiers remain resolvable, and differently identified or ambiguous authorities remain distinct.</p>
        </section>
      )}

      <section className="release-guide-section">
        <h3>How to read reviewer-visible counts</h3>
        {context.countDefinitions.length > 0 ? (
          <>
            <div className="release-guide-definition-table" role="table" aria-label="Relationship count definitions">
              {context.countDefinitions.map((item) => (
                <div role="row" key={item.label}><strong role="cell">{item.label}</strong><span role="cell">{item.definition}</span></div>
              ))}
            </div>
            <p>These denominators answer different questions and must not be compared as though they were the same population.</p>
          </>
        ) : (
          <p>No successor-specific relationship count definitions are selected for this baseline.</p>
        )}
      </section>

      {map && (
        <section className="release-guide-section">
          <h3><MapPin size={19} aria-hidden="true" /> Map precision</h3>
          <div className="release-guide-metrics map">
            <div><strong>{number(map.groups)}</strong><span>display groups</span></div>
            <div><strong>{number(map.entities)}</strong><span>mapped entities</span></div>
            <div><strong>{number(map.precision.venueEntities)}</strong><span>venue-position entities</span></div>
            <div><strong>{number(map.precision.gridCentroidEntities)}</strong><span>source-grid centroid entities</span></div>
            <div><strong>{number(map.precision.fallbackEntities)}</strong><span>locality/settlement fallback entities</span></div>
          </div>
          <p>{map.statement}</p>
        </section>
      )}

      <section className="release-guide-section limitations">
        <h3>Interpretive limitations for organological review</h3>
        <ul>{context.limitations.map((item) => <li key={item}><CheckCircle2 size={16} aria-hidden="true" /><span>{item}</span></li>)}</ul>
      </section>

      <footer className="release-guide-fixity">
        <strong>Verified local selection</strong>
        <code>{context.contentSha256 || "Content fingerprint unavailable"}</code>
        <span>This fingerprint identifies the selected read-only baseline; it is not a DOI or publication identifier.</span>
      </footer>
    </article>
  );
}

export function ReleaseGuideArea({ context }: { context: ReleaseContext }) {
  return context.dataProfile === "pod-1.5-public"
    ? <PublicDataGuide context={context} />
    : <ReviewerReleaseGuide context={context} />;
}
