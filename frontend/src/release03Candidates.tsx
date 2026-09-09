import { FormEvent, useEffect, useState } from "react";
import { ArrowUpRight, Database, ExternalLink, Search, ShieldCheck } from "lucide-react";
import "./release02Candidates.css";

type Action = "all" | "linked" | "distinct" | "ambiguous";
type Candidate = {
  nporId: string;
  sourceRecordId: string;
  action: string;
  classification: string;
  method: string;
  selectedTargetMdvsId?: string | null;
  candidateKey?: string | null;
  location: { building?: string; town?: string; region?: string; country?: string };
  builderCount: number;
  eventCount: number;
  literatureCount: number;
  researchPath: string;
};
type Detail = Candidate & {
  sourceUrl: string;
  descriptions: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  literature: Array<Record<string, unknown>>;
  possibleDuplicates: Array<Record<string, unknown>>;
};

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.detail || `Request failed (${response.status})`);
  return payload as T;
}

export function Release03CandidateCatalog({ initialCandidateId }: { initialCandidateId?: string }) {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [action, setAction] = useState<Action>("all");
  const [items, setItems] = useState<Candidate[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<string | undefined>(initialCandidateId);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [status, setStatus] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    readJson<Record<string, any>>("/api/research/release-0.3/npor/status").then(setStatus).catch((err) => setError(err.message));
  }, []);
  useEffect(() => {
    const params = new URLSearchParams({ q: submitted, action, limit: "50" });
    readJson<{ items: Candidate[]; total: number }>(`/api/research/release-0.3/npor/candidates?${params}`)
      .then((value) => { setItems(value.items); setTotal(value.total); setError(""); })
      .catch((err) => setError(err.message));
  }, [submitted, action]);
  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    readJson<Detail>(`/api/research/release-0.3/npor/candidates/${encodeURIComponent(selected)}`)
      .then((value) => { setDetail(value); setError(""); })
      .catch((err) => setError(err.message));
  }, [selected]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(query.trim());
  }

  return (
    <div className="release02-candidate-page">
      <header className="release02-candidate-hero">
        <div>
          <p className="eyebrow">Release 0.3 research preview</p>
          <h1>NPOR candidate evidence</h1>
          <p>Explore the isolated, source-attributed NPOR delta before canonical admission. Ambiguous identities remain visibly distinct.</p>
        </div>
        <div className="release02-trust-card">
          <ShieldCheck size={20} />
          <div><strong>Read-only candidate plane</strong><small>No canonical or Release 0.2 mutation</small></div>
        </div>
      </header>

      {status && <div className="release02-stat-grid">
        <Stat label="NPOR records" value={status.counts?.source_records ?? 0} />
        <Stat label="Linked" value={status.counts?.linked ?? 0} />
        <Stat label="Distinct" value={status.counts?.distinct ?? 0} />
        <Stat label="Ambiguous" value={status.counts?.ambiguous ?? 0} />
      </div>}

      <form className="release02-toolbar" onSubmit={submit}>
        <label className="release02-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search building, town, builder, or NPOR ID" /><button type="submit">Search</button></label>
        <label>Identity outcome<select value={action} onChange={(event) => setAction(event.target.value as Action)}><option value="all">All</option><option value="linked">Linked</option><option value="distinct">Distinct</option><option value="ambiguous">Possible duplicates</option></select></label>
      </form>

      {error && <p className="notice" role="alert">{error}</p>}
      <div className="release02-candidate-layout">
        <section className="release02-candidate-list" aria-label={`${total} NPOR candidates`}>
          <p className="muted">{total.toLocaleString()} results · showing {items.length}</p>
          {items.map((item) => <button type="button" key={item.nporId} className={`release02-candidate-card ${selected === item.nporId ? "is-selected" : ""}`} onClick={() => { setSelected(item.nporId); history.replaceState(null, "", item.researchPath); }}>
            <span className="release02-state-chip">{item.classification}</span>
            <strong>{item.location.building || `NPOR ${item.nporId}`}</strong>
            <span>{[item.location.town, item.location.region, item.location.country].filter(Boolean).join(", ")}</span>
            <small>{item.nporId} · {item.eventCount} events · {item.literatureCount} references</small>
          </button>)}
        </section>
        <section className="release02-candidate-detail">
          {!detail ? <div className="empty-state"><Database size={24} /><h2>Select an NPOR record</h2><p>Its source evidence and conservative identity decision will appear here.</p></div> : <>
            <p className="eyebrow">NPOR {detail.nporId}</p>
            <h2>{detail.location.building || detail.nporId}</h2>
            <p>{[detail.location.town, detail.location.region, detail.location.country].filter(Boolean).join(", ")}</p>
            <p><span className="release02-state-chip">{detail.classification}</span> <code>{detail.method}</code></p>
            <div className="button-row"><a className="secondary-button" href={detail.sourceUrl} target="_blank" rel="noreferrer">Open NPOR source <ExternalLink size={15} /></a>{detail.selectedTargetMdvsId && <a className="primary-button" href={`/id/${encodeURIComponent(detail.selectedTargetMdvsId)}`}>Open linked MODAVIS entity <ArrowUpRight size={15} /></a>}</div>
            <h3>Evidence summary</h3>
            <dl className="detail-grid"><div><dt>Named builders / workers</dt><dd>{detail.builderCount}</dd></div><div><dt>Events</dt><dd>{detail.events.length}</dd></div><div><dt>Archive references</dt><dd>{detail.literature.length}</dd></div><div><dt>Possible duplicates</dt><dd>{detail.possibleDuplicates.length}</dd></div></dl>
            {detail.events.slice(0, 8).map((event, index) => <div className="panel-block" key={String(event.entity_id || index)}><strong>{String(event.type || "Organ work")}</strong><p>{String(event.description || (event.activities as unknown[] || []).join(", ") || "Source-backed activity")}</p><small>{(event.dates as unknown[] || []).join(" · ")}</small></div>)}
          </>}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="release02-stat-card"><strong>{Number(value).toLocaleString()}</strong><span>{label}</span></div>;
}
