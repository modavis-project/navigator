import { useEffect } from "react";
import { ArrowRight, AudioLines, Box, Boxes, ChevronLeft, Code2, ExternalLink, Gamepad2, MapPinned, Network, Piano } from "lucide-react";
import "./publicStories.css";

const applications = [
  { id: "orgrec", name: "OrgRec", category: "Record", icon: AudioLines,
    summary: "Plan, record and document a pipe organ in a native macOS workspace.",
    description: "OrgRec turns an organ specification into a recording roadmap. It supports multichannel Broadcast Wave capture, microphone and equipment documentation, non-destructive review, segmentation and sustained-loop inspection.",
    connection: "Navigator organ records and the POD 1.5 OrgRec SQLite profile support organ discovery and specification-based roadmaps, including offline work. A recording session retains its own source and dataset version.",
    detail: "OrgRec 0.4.0 exports VAO 0.6.0 from the command line. The macOS Export button writes VAO 0.5.0.",
    links: [{ label: "OrgRec releases and export instructions", url: "https://github.com/modavis-project/orgrec/releases" }], next: { label: "Find an organ to document", url: "/organs" } },
  { id: "orgmap", name: "OrgMap", category: "Discover", icon: MapPinned,
    summary: "Find nearby pipe organs through an installable map made for field visits.",
    description: "OrgMap offers a focused geographical view of the organ catalogue, with nearby discovery, organ details and links back to Navigator. Its responsive interface can be installed on a phone.",
    connection: "OrgMap reads the reduced POD 1.5 OrgMap SQLite profile. It includes organ identifiers, builders, location evidence, technical summaries and links to virtual instruments. Contributions are stored separately from the release database.",
    detail: "Coordinate precision matters: a locality-level position locates an area and should not be used as an exact entrance or building position.",
    links: [{ label: "Open OrgMap", url: "https://map.modavis.org" }], next: { label: "Explore the Navigator map", url: "/map" } },
  { id: "vao-standard", name: "VAO Standard", category: "Preserve", icon: Boxes,
    summary: "Connect recordings, models, measurements and evidence in a Virtual Acoustic Object.",
    description: "The Virtual Acoustic Object Standard defines an exchange and preservation format for digital representations of musical instruments and acoustic objects. It binds descriptive information, media, provenance, rights and exact file identities into an identified release.",
    connection: "MODAVIS identifiers can connect a digital representation to its documented instrument and sources. The VAO format complements the dataset and uses an explicit mapping to the MODAVIS Ontology Network.",
    detail: "VAO 0.6.0 was released on 10 October 2026. It includes the independently versioned MMIC 1.0.0 profile for mechanical music carriers.",
    links: [{ label: "Read VAO 0.6.0", url: "https://w3id.org/modavis/vao/0.6.0/" }, { label: "MMIC 1.0.0", url: "https://w3id.org/modavis/vao/profile/mmic/1.0.0" }, { label: "VAO vocabulary", url: "https://w3id.org/modavis/vao/0.6.0/vocabulary" }], next: { label: "Explore virtual instruments", url: "/virtual-instruments" } },
  { id: "vao-cli", name: "VAO CLI", category: "Work with data", icon: Code2,
    summary: "Inspect, validate and selectively retrieve Virtual Acoustic Objects from the command line.",
    description: "VAO CLI resolves DOI-identified releases, lists their contents and selects the representations needed for a task. It can verify downloaded files, compare releases and create local carriers containing a chosen set of assets.",
    connection: "The client provides a practical route from a documented instrument or virtual representation to reusable research files. Each retrieval retains the exact release and file identity.",
    detail: "VAO CLI validates 0.4.0, 0.5.0 and 0.6.0 packages. It reports which MMIC levels passed and which need additional payloads.",
    links: [{ label: "Commands and installation", url: "https://github.com/modavis-project/vao-cli" }, { label: "VAO CLI releases", url: "https://github.com/modavis-project/vao-cli/releases" }], next: { label: "Read about the VAO Standard", url: "/applications/vao-standard" } },
  { id: "vaoxr", name: "vaoXR", category: "Experience", icon: Piano,
    summary: "Explore acoustic objects through interactive models, listening and musical interaction.",
    description: "vaoXR is a browser platform for Virtual Acoustic Objects. Experiences are driven by the capabilities declared by each object, including 3D viewing, synchronized media, sampled musical interaction and spatial listening.",
    connection: "Where an object includes MODAVIS identifiers, it can connect an interactive representation with its documented physical instrument. Supported experiences and package versions depend on the object and viewer.",
    detail: "The file inspector opens local 0.5.0 and 0.6.0 files and can preview verified embedded audio. The Cuntz organ experiences use their original VAO 0.5.0 release.",
    links: [{ label: "Open vaoXR", url: "https://vaoxr.modavis.org" }, { label: "vaoXR releases", url: "https://github.com/modavis-project/vaoxr/releases" }], next: { label: "Find related virtual instruments", url: "/virtual-instruments?organ_link=linked" } },
  { id: "vao-blender", name: "VAO Blender", category: "Inspect and import", icon: Box,
    summary: "Inspect VAO carriers and import supported geometry in Blender.",
    description: "The extension checks the package before import and shows the manifest and verified files in Blender.",
    connection: "The manifest can carry MODAVIS instrument identifiers and evidence alongside the model.",
    detail: "The prerelease adds VAO 0.6.0 core validation and imports supported geometry. MMIC records are available for inspection.",
    links: [{ label: "VAO Blender prereleases", url: "https://github.com/modavis-project/vao-blender/releases" }], next: { label: "Read about the VAO Standard", url: "/applications/vao-standard" } },
  { id: "vao-unity", name: "VAO Unity", category: "Inspect and import", icon: Gamepad2,
    summary: "Import VAO packages into Unity and inspect their contents.",
    description: "The Unity Editor importer creates a package asset from the manifest and imports supported embedded files.",
    connection: "Package assets retain the source manifest and its recorded links to instruments and evidence.",
    detail: "The prerelease reads VAO 0.6.0. MMIC carriers are imported as metadata, with a receipt that records the scope of the import.",
    links: [{ label: "VAO Unity prereleases", url: "https://github.com/modavis-project/vao-unity/releases" }], next: { label: "Read about the VAO Standard", url: "/applications/vao-standard" } },
  { id: "ontology-network", name: "MODAVIS Ontology Network", category: "Connect", icon: Network,
    summary: "Describe instrument identities, states, evidence and digital representations with shared terms.",
    description: "The ontology network provides modular vocabularies and validation profiles for knowledge about musical instruments. It distinguishes instruments, historical states, assertions, source evidence, activities and digital representations.",
    connection: "These distinctions explain how the Navigator can retain conflicting source claims and several descriptions of an organ without treating every description as a new physical instrument. The network also provides the semantic basis for VAO mappings.",
    detail: "The network is at version 0.1.0. The VAO 0.6.0 mapping uses this release’s digital asset and bitstream classes.",
    links: [{ label: "Ontology and documentation", url: "https://modavis-project.github.io/modavis-ontology-network/" }, { label: "Persistent ontology identifier", url: "https://w3id.org/modavis/ontology/0.1.0" }], next: { label: "Browse activity vocabulary", url: "/vocab/modavis_activity_types" } },
];

export function RelatedApplications() {
  const slug = window.location.pathname.replace(/\/+$/, "").split("/")[2];
  const app = applications.find(item => item.id === slug);
  useEffect(() => { document.title = `${app?.name || "Related applications"} | MODAVIS Navigator`; }, [app]);
  if (slug && !app) return <section className="story-page"><h1>Application not found</h1><a href="/applications">Browse related applications</a></section>;
  if (app) { const Icon = app.icon; return <article className="story-page application-detail">
    <a className="catalog-back" href="/applications"><ChevronLeft size={17} /> Related applications</a>
    <header className="story-hero"><div className="application-icon"><Icon size={32} /></div><p className="eyebrow">{app.category}</p><h1>{app.name}</h1><p className="story-deck">{app.summary}</p></header>
    <div className="story-columns"><section><h2>What it does</h2><p>{app.description}</p><h2>How it connects to MODAVIS</h2><p>{app.connection}</p><h2>Availability and compatibility</h2><p>{app.detail}</p></section>
      <aside className="story-side-card"><h2>Get started</h2>{app.links.map(link => <a className="application-link" key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.label}<ExternalLink size={16} /></a>)}<a className="application-link" href={app.next.url}>{app.next.label}<ArrowRight size={16} /></a><small>Checked 19 November 2026.</small></aside></div>
  </article>; }
  return <section className="story-page"><header className="story-hero"><p className="eyebrow">Around the Navigator</p><h1>From discovery to documentation</h1><p className="story-deck">Tools and standards for finding, recording, preserving and exploring musical instruments.</p></header><div className="application-grid">{applications.map(item => { const Icon = item.icon; return <a key={item.id} href={`/applications/${item.id}`} className="application-card"><Icon size={27} /><span className="eyebrow">{item.category}</span><h2>{item.name}</h2><p>{item.summary}</p><span className="application-card-footer">About {item.name} <ArrowRight size={17} /></span></a>; })}</div><p className="muted">OrgRec and OrgMap use POD 1.5 profiles. Other projects connect through instrument identifiers, representations or shared semantic standards; their supported versions are listed on each page.</p></section>;
}

export function ApplicationsPreview() {
  return <section className="explore-applications"><div><p className="eyebrow">Continue your research</p><h2>Record, map and explore</h2><p>Discover OrgRec, OrgMap, the VAO Standard, vaoXR and the MODAVIS Ontology Network.</p></div><a className="public-action-link" href="/applications">Related applications <ArrowRight size={17} /></a></section>;
}
