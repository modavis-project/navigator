import "./loadingContent.css";

type LoadingLayout = "article" | "cards" | "table" | "rows" | "text";

export function LoadingContent({ label, kind = "text", className = "", count }: {
  label?: string;
  kind?: LoadingLayout;
  className?: string;
  count?: number;
}) {
  const items = count ?? (kind === "cards" ? 6 : kind === "rows" || kind === "table" ? 5 : 1);
  return <div className="content-loading">
    {label && <p className="sr-only" role="status">{label}</p>}
    <div className={`loading-shapes loading-shapes-${kind} ${className || "loading-shapes-default"}`} aria-hidden="true">
      {Array.from({ length: items }, (_, index) => (
        <div className="loading-shape" key={index}>
          <span /><span /><span />
        </div>
      ))}
    </div>
  </div>;
}

export function UpdatingContent({ label }: { label: string }) {
  return <p className="content-updating" role="status"><span aria-hidden="true" />{label}</p>;
}
