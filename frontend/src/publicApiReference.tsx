import { useEffect, useState, type ReactNode } from "react";
import { LoadingContent } from "./LoadingContent";
import { useUiLocale, type UiLocale } from "./uiLocale";

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

function readHeading(block: string[]) {
  const stableAnchor = /^<a id="([a-z0-9-]+)"><\/a>$/.exec(block[0]);
  const heading = /^(#{2,3}) (.+)$/.exec((stableAnchor ? block[1] : block[0]) ?? "");
  if (!heading) return;
  const [, marker, title] = heading;
  return { title, id: stableAnchor?.[1] ?? sectionId(title), level: marker.length };
}

export function PublicApiReferenceBody({ markdown }: { markdown: string }) {
  // This renderer covers the tracked reference's controlled Markdown subset.
  // Content is rendered as React text, and only local section links are parsed.
  const { t } = useUiLocale();
  const blocks = referenceBlocks(markdown);
  const headings = blocks.map(readHeading);
  let section = blocks[0]?.[0].slice(2) ?? "";
  return <>
    <nav className="api-reference-contents" aria-label={t("guide.api.reference.contentsLabel", "API reference contents", "Inhaltsverzeichnis der API-Referenz")}>
      <h2>{t("guide.api.reference.contents", "Contents", "Inhalt")}</h2>
      <ul>{headings.map(heading => heading && <li key={heading.id}><a href={"#" + heading.id}>{heading.title}</a></li>)}</ul>
    </nav>
    {blocks.map(([line, ...rest], index) => {
      if (line.startsWith("# ")) return null;
      const heading = headings[index];
      if (heading) {
        section = heading.title;
        const Heading = heading.level === 2 ? "h2" : "h3";
        return <Heading id={heading.id} key={index}>{inline(section)}</Heading>;
      }
      if (line.startsWith("```")) return <pre key={index} tabIndex={0} aria-label={t("guide.api.reference.exampleLabel", "{section} example", "Beispiel zu {section}", { section })}><code>{rest.slice(0, -1).join("\n")}</code></pre>;
      if (line.startsWith("|") && /^\|(?:\s*:?-+:?\s*\|)+$/.test(rest[0] ?? "")) {
        return <div key={index} className="api-reference-table" role="region" tabIndex={0} aria-label={t("guide.api.reference.tableLabel", "{section} table", "Tabelle zu {section}", { section })}>
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
  const { locale, t } = useUiLocale();
  const url = locale === "de" ? "/navigator-api.de.md" : "/navigator-api.md";
  const title = t("guide.api.reference.title", "MODAVIS Navigator public API", "Öffentliche API des MODAVIS Navigators");
  const [state, setState] = useState<{ locale: UiLocale; markdown?: string; failed?: boolean }>();
  const current = state?.locale === locale ? state : undefined;
  const markdown = current?.markdown;
  useEffect(() => {
    document.title = title + " | MODAVIS Navigator";
    const controller = new AbortController();
    fetch(url, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("API reference unavailable");
      const markdown = await response.text();
      if (markdown.split(/\r?\n/, 1)[0] !== "# " + title) throw new Error("Invalid API reference");
      if (!controller.signal.aborted) setState({ locale, markdown });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ locale, failed: true });
    });
    return () => controller.abort();
  }, [locale, title, url]);
  useEffect(() => {
    if (!markdown) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [markdown]);
  return <article className="entity-section release-guide api-guide" lang={locale}>
    <header className="api-guide-header">
      <div><h1>{title}</h1></div>
      <nav className="api-reference-links" aria-label={t("guide.api.reference.links", "API reference links", "Links zur API-Referenz")}>
        <a href="/about/api">{t("guide.api.reference.back", "Back to the API guide", "Zurück zum API-Leitfaden")}</a>
        <a className="api-primary-link" href={url} download>{t("guide.api.reference.download", "Download Markdown", "Als Markdown herunterladen")}</a>
      </nav>
    </header>
    <div className="release-guide-section api-reference-document">
      {markdown ? <PublicApiReferenceBody markdown={markdown} />
        : current?.failed ? <p role="alert">{t("guide.api.reference.unavailable", "The API reference could not be loaded.", "Die API-Referenz konnte nicht geladen werden.")} <a href={url} download>{t("guide.api.reference.download", "Download Markdown", "Als Markdown herunterladen")}</a></p>
          : <LoadingContent kind="article" label={t("guide.api.reference.loading", "Loading the API reference…", "API-Referenz wird geladen …")} />}
    </div>
  </article>;
}
