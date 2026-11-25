import { useEffect, useState, type ReactNode } from "react";
import { LoadingContent } from "./LoadingContent";

const REFERENCE_URL = "/navigator-api.md";
const REFERENCE_TITLE = "MODAVIS Navigator public API";

function inline(text: string): ReactNode[] {
  return text.split(/(`[^`\n]+`|\[[^\]\n]+\]\(#[a-z0-9-]+\))/g).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    const link = /^\[([^\]\n]+)\]\((#[a-z0-9-]+)\)$/.exec(part);
    return link ? <a key={index} href={link[2]}>{link[1]}</a> : part;
  });
}

function referenceBlocks(markdown: string): string[][] {
  const blocks: string[][] = [];
  let block: string[] = [];
  let fenced = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^```(?:\w+)?$/.test(line)) {
      if (fenced) {
        blocks.push([...block, line]);
        block = [];
      } else {
        if (block.length) blocks.push(block);
        block = [line];
      }
      fenced = !fenced;
    } else if (!fenced && !line.trim()) {
      if (block.length) blocks.push(block);
      block = [];
    } else {
      block.push(line);
    }
  }
  if (block.length) blocks.push(block);
  return blocks;
}

const sectionId = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const cells = (line: string) => line.slice(1, -1).split("|").map(cell => cell.trim());

export function PublicApiReferenceBody({ markdown }: { markdown: string }) {
  // This renderer covers the tracked reference's controlled Markdown subset.
  // Content is rendered as React text, and only local section links are parsed.
  const blocks = referenceBlocks(markdown);
  const sections = blocks.flatMap(([line]) => /^#{2,3} /.test(line) ? [line.replace(/^#+ /, "")] : []);
  let section = REFERENCE_TITLE;
  return <>
    <nav className="api-reference-contents" aria-label="API reference contents">
      <h2>Contents</h2>
      <ul>{sections.map(title => <li key={title}><a href={"#" + sectionId(title)}>{title}</a></li>)}</ul>
    </nav>
    {blocks.map(([line, ...rest], index) => {
      if (line.startsWith("# ")) return null;
      if (line.startsWith("## ")) {
        section = line.slice(3);
        return <h2 id={sectionId(section)} key={index}>{inline(section)}</h2>;
      }
      if (line.startsWith("### ")) {
        section = line.slice(4);
        return <h3 id={sectionId(section)} key={index}>{inline(section)}</h3>;
      }
      if (line.startsWith("```")) return <pre key={index} tabIndex={0} aria-label={section + " example"}><code>{rest.slice(0, -1).join("\n")}</code></pre>;
      if (line.startsWith("|") && /^\|(?:\s*:?-+:?\s*\|)+$/.test(rest[0] ?? "")) {
        return <div key={index} className="api-reference-table" role="region" tabIndex={0} aria-label={section + " table"}>
          <table>
            <thead><tr>{cells(line).map((value, column) => <th key={column} scope="col">{inline(value)}</th>)}</tr></thead>
            <tbody>{rest.slice(1).map((row, rowIndex) => <tr key={rowIndex}>
              {cells(row).map((value, column) => <td key={column}>{inline(value)}</td>)}
            </tr>)}</tbody>
          </table>
        </div>;
      }
      if (line.startsWith("- ") && rest.every(item => item.startsWith("- "))) {
        return <ul key={index}>{[line, ...rest].map((item, itemIndex) => <li key={itemIndex}>{inline(item.slice(2))}</li>)}</ul>;
      }
      return <p key={index}>{inline([line, ...rest].join(" "))}</p>;
    })}
  </>;
}

export function PublicApiReference() {
  const [state, setState] = useState<{ markdown?: string; failed?: boolean }>({});
  useEffect(() => {
    document.title = REFERENCE_TITLE + " | MODAVIS Navigator";
    const controller = new AbortController();
    fetch(REFERENCE_URL, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("API reference unavailable");
      const markdown = await response.text();
      if (!markdown.startsWith("# " + REFERENCE_TITLE + "\n")) throw new Error("Invalid API reference");
      if (!controller.signal.aborted) setState({ markdown });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ failed: true });
    });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!state.markdown) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [state.markdown]);
  return <article className="entity-section release-guide api-guide api-reference" lang="en">
    <header className="release-guide-hero public-data-guide-hero">
      <div><p className="eyebrow">Public API reference</p><h1>{REFERENCE_TITLE}</h1></div>
      <nav aria-label="API reference links">
        <a href="/about/api">Back to the API guide</a>
        <a href={REFERENCE_URL} download>Download Markdown</a>
      </nav>
    </header>
    <div className="release-guide-section api-reference-document">
      {state.markdown ? <PublicApiReferenceBody markdown={state.markdown} />
        : state.failed ? <p role="alert">The API reference could not be loaded. <a href={REFERENCE_URL} download>Download Markdown</a>.</p>
          : <LoadingContent kind="article" label="Loading the API reference…" />}
    </div>
  </article>;
}
