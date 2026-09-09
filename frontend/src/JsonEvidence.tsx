import { useId, useMemo, useRef, useState } from "react";
import { Copy } from "lucide-react";
import "./jsonEvidence.css";

/** The visible and copied representations always contain the same complete payload. */
export function JsonEvidence({ value, label = "Structured evidence" }: { value: unknown; label?: string }) {
  const id = useId();
  const code = useRef<HTMLPreElement>(null);
  const text = useMemo(() => JSON.stringify(value, null, 2) ?? "", [value]);
  const [notice, setNotice] = useState<{ text: string; message: string }>();
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setNotice({ text, message: "JSON copied." });
    } catch {
      if (code.current) {
        code.current.focus();
        const range = document.createRange();
        range.selectNodeContents(code.current);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setNotice({ text, message: "JSON selected. Use your browser’s Copy command." });
    }
  }
  if (!text) return <p className="json-evidence-empty">No structured evidence is available.</p>;
  return <div className="json-evidence">
    <div className="json-evidence-toolbar"><span>JSON</span><span role="status">{notice?.text === text ? notice.message : ""}</span>
      <button type="button" aria-label={`Copy ${label} as JSON`} aria-controls={id} onClick={copy}><Copy size={15} aria-hidden="true" /> Copy JSON</button>
    </div>
    <pre id={id} ref={code} className="json-evidence-code" role="region" aria-label={`${label} (JSON)`} tabIndex={0}>{text}</pre>
  </div>;
}
