import "./publicModels.css";
import { AlertCircle, Layers3 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  fetchProcessorPublicModelBundle,
  fetchProcessorPublicModels,
  type ProcessorPublicModelBundle,
  type ProcessorPublicModelDiscovery,
  type ProcessorPublicModelSummary,
  type SafeResult,
} from "./api";
import { EmptyState, Metric, SectionHead } from "./catalogPresentation";

export default function PublicModelsPage() {
  const [discovery, setDiscovery] = useState<SafeResult<ProcessorPublicModelDiscovery> | null>(null);
  const [discoveryLoading, setDiscoveryLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bundle, setBundle] = useState<SafeResult<ProcessorPublicModelBundle> | null>(null);
  const [bundleLoading, setBundleLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDiscoveryLoading(true);
    fetchProcessorPublicModels()
      .then((result) => {
        if (cancelled) return;
        setDiscovery(result);
        const firstModelId = result.ok ? result.data?.models?.[0]?.model_id : null;
        if (firstModelId) setSelectedId((current) => current ?? firstModelId);
      })
      .catch((err) => {
        if (!cancelled) {
          setDiscovery({ ok: false, error: err instanceof Error ? err.message : "Could not load public models" });
        }
      })
      .finally(() => {
        if (!cancelled) setDiscoveryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setBundle(null);
      return;
    }
    let cancelled = false;
    setBundleLoading(true);
    fetchProcessorPublicModelBundle(selectedId)
      .then((result) => {
        if (!cancelled) setBundle(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setBundle({ ok: false, error: err instanceof Error ? err.message : "Could not load model viewer bundle" });
        }
      })
      .finally(() => {
        if (!cancelled) setBundleLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const models = discovery?.ok ? discovery.data?.models ?? [] : [];
  const selectedSummary = models.find((item) => item.model_id === selectedId) ?? models[0] ?? null;
  const viewer = bundle?.ok ? bundle.data?.viewer : undefined;
  const modelRecord = bundle?.ok ? bundle.data?.model ?? {} : {};
  const transparency = publicModelRecord(modelRecord.generation_transparency);
  const quality = publicModelRecord(transparency.quality);
  const environmentLocks = publicModelRecord(transparency.environment_locks);
  const modelSrc = viewer?.model_viewer_src || viewer?.model_proxy_url || viewer?.model_url || viewer?.stable_processor_artifact_url || selectedSummary?.public_url || null;
  const viewerReady = Boolean(bundle?.ok && bundle.data?.status === "ready" && viewer?.public_web_ready && modelSrc);
  const modelViewerReady = useModelViewerScript(viewerReady);
  const blockers = viewer?.public_web_blockers ?? bundle?.data?.blockers ?? [];

  return (
    <section className="entity-section public-models-page" id="models" tabIndex={-1}>
      <SectionHead
        eyebrow="3D Models"
        title="Published reconstructions"
        detail={discoveryLoading ? "Loading models" : `${discovery?.data?.total ?? models.length} model${(discovery?.data?.total ?? models.length) === 1 ? "" : "s"}`}
      />

      <div className="catalog-metrics public-model-metrics">
        <Metric label="Registered models" value={discovery?.data?.total ?? models.length} />
        <Metric label="Visible in Navigator" value={models.filter((item) => item.public_url || item.api_url).length} />
        <Metric label="Paradata complete" value={models.filter((item) => item.paradata_complete).length} />
      </div>

      {!discoveryLoading && discovery && !discovery.ok && (
        <EmptyState icon={<AlertCircle size={22} />} title="Models unavailable" body={discovery.error || "The Processor public model registry did not respond."} />
      )}

      {!discoveryLoading && discovery?.ok && models.length === 0 && (
        <EmptyState icon={<Layers3 size={22} />} title="No public models yet" body="Approved Processor reconstructions will appear here after publication." />
      )}

      {models.length > 0 && (
        <div className="public-models-layout">
          <div className="public-model-list" aria-label="Published models">
            {models.map((model) => (
              <button
                type="button"
                key={model.model_id}
                className={model.model_id === selectedSummary?.model_id ? "public-model-card active" : "public-model-card"}
                onClick={() => setSelectedId(model.model_id)}
              >
                <span>{publicModelTitle(model)}</span>
                <strong>{model.object_id || model.source_record_id || model.model_id}</strong>
                <small>{model.batch_id || "No batch id"} · {publicModelQuality(model)}</small>
                <small>{model.paradata_complete ? "Paradata complete" : "Paradata pending"} · {formatPublicModelDate(model.updated_at)}</small>
              </button>
            ))}
          </div>

          <section className="public-model-viewer-panel" aria-label="Selected model">
            {bundleLoading && <EmptyState icon={<Layers3 size={22} />} title="Loading model" body="Fetching the public Processor viewer bundle." />}

            {!bundleLoading && bundle && !bundle.ok && (
              <EmptyState icon={<AlertCircle size={22} />} title="Model unavailable" body={bundle.error || "The selected model bundle could not be loaded."} />
            )}

            {!bundleLoading && bundle?.ok && (
              <>
                <div className="public-model-viewer-wrap">
                  {viewerReady && modelSrc && modelViewerReady ? (
                    <ModelViewerElement src={modelSrc} label={`3D model ${selectedSummary?.model_id ?? ""}`} />
                  ) : (
                    <div className="public-model-viewer-fallback">
                      <Layers3 size={34} />
                      <strong>{viewerReady ? "Preparing 3D viewer" : "Viewer not public-ready"}</strong>
                      <span>{viewerReady ? "The model source is ready; the browser viewer is still loading." : blockers.join(", ") || "No public model source is available."}</span>
                      {modelSrc && <a href={modelSrc}>Open model source</a>}
                    </div>
                  )}
                </div>

                <div className="public-model-detail">
                  <div>
                    <p className="eyebrow">Model</p>
                    <h3>{publicModelTitle(selectedSummary)}</h3>
                    <p>{selectedSummary?.object_id || selectedSummary?.source_record_id || selectedSummary?.model_id}</p>
                  </div>
                  <div className="public-model-meta-grid">
                    <span><strong>Storage</strong>{viewer?.storage_backend || "unknown"}</span>
                    <span><strong>Serving</strong>{viewer?.serving_strategy || "unknown"}</span>
                    <span><strong>Quality</strong>{formatPublicModelValue(quality.label ?? selectedSummary?.quality_label)}</span>
                    <span><strong>Score</strong>{formatPublicModelValue(quality.score ?? selectedSummary?.quality_score)}</span>
                    <span><strong>Batch</strong>{formatPublicModelValue(selectedSummary?.batch_id)}</span>
                    <span><strong>Paradata</strong>{transparency.paradata_complete ? "complete" : "pending"}</span>
                  </div>
                  <div className="public-model-provenance">
                    <strong>Provenance</strong>
                    <span>Source: {formatPublicModelValue(selectedSummary?.source_record_id)}</span>
                    <span>Environment: {formatPublicModelValue(publicModelRecord(environmentLocks.batch).status ?? publicModelRecord(environmentLocks.batch).batch_id)}</span>
                    <span>Delivery: {modelSrc ? "public web route" : "not available"}</span>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

function useModelViewerScript(enabled: boolean) {
  const [ready, setReady] = useState(() => typeof window !== "undefined" && Boolean(window.customElements?.get("model-viewer")));
  useEffect(() => {
    if (!enabled || ready || typeof document === "undefined") return;
    const existing = document.querySelector<HTMLScriptElement>("script[data-modavis-model-viewer]");
    if (existing) {
      existing.addEventListener("load", () => setReady(Boolean(window.customElements?.get("model-viewer"))), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.type = "module";
    script.src = "https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js";
    script.dataset.modavisModelViewer = "true";
    script.addEventListener("load", () => setReady(Boolean(window.customElements?.get("model-viewer"))));
    document.head.appendChild(script);
  }, [enabled, ready]);
  return ready;
}

function ModelViewerElement({ label, src }: { label: string; src: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let viewer = host.querySelector("model-viewer") as HTMLElement | null;
    if (!viewer) {
      viewer = document.createElement("model-viewer");
      viewer.className = "public-model-viewer";
      viewer.setAttribute("camera-controls", "");
      viewer.setAttribute("auto-rotate", "");
      viewer.setAttribute("exposure", "0.9");
      host.replaceChildren(viewer);
    }
    viewer.setAttribute("src", src);
    viewer.setAttribute("aria-label", label);
  }, [label, src]);
  return <div className="public-model-viewer-host" ref={hostRef} />;
}

function publicModelRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function publicModelTitle(model?: ProcessorPublicModelSummary | null): string {
  if (!model) return "Selected model";
  return model.object_id ? `Object ${model.object_id}` : model.source_record_id ? `Source ${model.source_record_id}` : `Model ${model.model_id}`;
}

function publicModelQuality(model: ProcessorPublicModelSummary): string {
  if (model.quality_label && typeof model.quality_score === "number") return `${model.quality_label} (${model.quality_score.toFixed(2)})`;
  if (model.quality_label) return model.quality_label;
  if (typeof model.quality_score === "number") return model.quality_score.toFixed(2);
  return "Quality unrecorded";
}

function formatPublicModelValue(value: unknown): string {
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "boolean") return value ? "yes" : "no";
  return "unrecorded";
}

function formatPublicModelDate(value?: string | null): string {
  if (!value) return "No update date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}
