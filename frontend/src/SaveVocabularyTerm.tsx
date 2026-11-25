import {useEffect,useRef,useState} from "react";
import {Bookmark,Check,FolderOpen} from "lucide-react";
import {addViewToWorkspace,readWorkspace,WORKSPACE_EVENT,type NewWorkspaceView,type WorkspaceSaveResult} from "./researchWorkspace";
import {resolveVocabularyWorkspaceView} from "./vocabularyWorkspace";
import {useUiLocale,type UiLocale,type UiText} from "./uiLocale";
import "./saveVocabularyTerm.css";

type Feedback =
  | {kind:"saved";view:NewWorkspaceView}
  | {kind:"memory"}
  | {kind:"error";detail:string};

function saveLabel(contextKey:string, supplied:string, t:UiText) {
  const {pathname,searchParams}=new URL(contextKey,"https://navigator.modavis.org");
  if (/^\/vocab\/usage\//.test(pathname)) return searchParams.has("term")
    ? t("vocab.save.wording",supplied,"Eintrag speichern")
    : t("vocab.save.wordingView",supplied,"Wortlautansicht speichern");
  if (pathname==="/vocab/registry") return searchParams.has("concept")
    ? t("vocab.save.candidate",supplied,"Terminologievorschlag speichern")
    : t("vocab.save.candidateView",supplied,"Ansicht der Terminologievorschläge speichern");
  if (pathname==="/vocab/reference"||pathname==="/vocab/omaro") {
    if (!searchParams.has("uri")) return t("vocab.save.referenceView",supplied,"Referenzansicht speichern");
    const concept=pathname==="/vocab/omaro"
      ? (searchParams.get("collection")??"instruments")==="instruments"
      : searchParams.get("kind")==="concept";
    return concept ? t("vocab.save.referenceConcept",supplied,"Begriff speichern") : t("vocab.save.reference",supplied,"Referenz speichern");
  }
  if (/^\/vocab\/modavis_entity_types\/concepts\//.test(pathname)) return t("vocab.save.category",supplied,"Kategorie speichern");
  return /\/concepts\//.test(pathname)
    ? t("vocab.save.concept",supplied,"Begriff speichern")
    : t("vocab.save.view",supplied,"Vokabularansicht speichern");
}

function feedbackText(feedback:Feedback|null,t:UiText,locale:UiLocale):string {
  if (!feedback) return "";
  if (feedback.kind==="memory") return t("vocab.save.memory",
    "The entry is in the open workspace. Browser storage is unavailable. Export this workspace to retain it.",
    "Der Eintrag ist im geöffneten Arbeitsbereich verfügbar. Der Browserspeicher ist nicht verfügbar. Exportieren Sie den Arbeitsbereich, um den Eintrag zu sichern.");
  if (feedback.kind==="error") return locale==="en" ? feedback.detail : t("vocab.save.error",
    "The entry could not be saved. Check the link and requested version and try again.",
    "Der Eintrag konnte nicht gespeichert werden. Prüfen Sie den Link und die angeforderte Version und versuchen Sie es erneut.");
  const {title,binding}=feedback.view;
  if (!binding) return t("vocab.save.confirmation","Saved “{title}”. Its exact link and filters are retained.",
    "„{title}“ wurde gespeichert. Der genaue Link und die Filter bleiben erhalten.",{title});
  return t("vocab.save.confirmationBound","Saved “{title}” · {collection} · {version}. Its exact link and filters are retained.",
    "„{title}“ wurde gespeichert · {collection} · {version}. Der genaue Link und die Filter bleiben erhalten.",{
      title,collection:binding.collectionTitle,version:binding.version||t("vocab.save.snapshot","Snapshot {hash}","Datenstand {hash}",{hash:binding.snapshot.slice(0,12)}),
    });
}

export function SaveVocabularyTerm({contextKey,label="Save term"}:{contextKey:string;label?:string}) {
  const {t,locale}=useUiLocale();
  const [pending,setPending]=useState(false),[feedback,setFeedback]=useState<Feedback|null>(null);
  const saved=feedback?.kind==="saved";
  const failure=feedback!==null&&!saved;
  const active=useRef<AbortController|null>(null);
  const savedUrl=useRef<string|null>(null);
  useEffect(()=>{active.current?.abort();savedUrl.current=null;setPending(false);setFeedback(null);return()=>active.current?.abort();},[contextKey]);
  useEffect(()=>{
    const canonical=(value:string)=>{const url=new URL(value,"https://navigator.modavis.org");url.searchParams.sort();return url.pathname+url.search+url.hash;};
    const changed=()=>{try{
      const current=new URL(contextKey,"https://navigator.modavis.org");current.hash=location.hash;
      const workspace=readWorkspace(),views=workspace?.views||[],pin=current.searchParams.get("snapshot");
      const podWording=/^\/vocab\/usage\/[^/]+$/.test(current.pathname)&&current.searchParams.getAll("snapshot").length===1&&!!pin&&/^[a-f0-9]{64}$/i.test(pin)&&workspace?.snapshot===pin;
      const retained=views.find(view=>(view.binding||podWording)&&canonical(view.url)===canonical(current.href));
      if(retained){savedUrl.current=retained.url;setFeedback({kind:"saved",view:retained});}
      else if(savedUrl.current){savedUrl.current=null;setFeedback(null);}
    }catch{savedUrl.current=null;setFeedback(null);}};
    const hashChanged=()=>{active.current?.abort();setPending(false);savedUrl.current=null;setFeedback(null);changed();};
    changed();window.addEventListener(WORKSPACE_EVENT,changed);window.addEventListener("storage",changed);window.addEventListener("hashchange",hashChanged);
    return()=>{window.removeEventListener(WORKSPACE_EVENT,changed);window.removeEventListener("storage",changed);window.removeEventListener("hashchange",hashChanged);};
  },[contextKey]);
  async function save() {
    active.current?.abort();const controller=new AbortController();active.current=controller;
    setPending(true);setFeedback(null);
    try {
      const capture=new URL(contextKey,location.origin||"https://navigator.modavis.org");capture.hash=location.hash;
      const view=await resolveVocabularyWorkspaceView(capture.pathname+capture.search+capture.hash,controller.signal);
      if(controller.signal.aborted)return;
      const result:WorkspaceSaveResult=await addViewToWorkspace(view);
      if(controller.signal.aborted)return;
      savedUrl.current=result.persisted?view.url:null;
      setFeedback(result.persisted?{kind:"saved",view}:{kind:"memory"});
    } catch(error) {
      if(controller.signal.aborted)return;
      setFeedback({kind:"error",detail:error instanceof Error?error.message:"The term could not be saved. Please try again."});
    } finally {if(!controller.signal.aborted)setPending(false);}
  }
  return <span className="vocabulary-save" data-vocabulary-workspace-url={contextKey}>
    <span className="vocabulary-save-actions"><button type="button" className="vocabulary-save-button" disabled={pending} aria-busy={pending||undefined} onClick={()=>void save()}>
      {saved?<Check size={16} aria-hidden="true"/>:<Bookmark size={16} aria-hidden="true"/>}{pending?t("vocab.save.pending","Saving…","Wird gespeichert …"):saved?t("vocab.save.saved","Saved","Gespeichert"):saveLabel(contextKey,label,t)}
    </button>{feedback&&<button type="button" className="vocabulary-open-workspace" onClick={()=>window.dispatchEvent(new CustomEvent("modavis:workspace-open"))}><FolderOpen size={15} aria-hidden="true"/>{t("vocab.save.openWorkspace","Open workspace","Arbeitsbereich öffnen")}</button>}</span>
    <span className={failure?"vocabulary-save-feedback is-error":"vocabulary-save-feedback"} role={failure?"alert":"status"} aria-live={failure?"assertive":"polite"}>{feedbackText(feedback,t,locale)}</span>
  </span>;
}
