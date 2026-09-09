import { useEffect, useId, useRef } from 'react';
import { Plus } from 'lucide-react';
import { pageFaq } from './pageFaqContent';
import './pageFaq.css';

/** One lightweight, local FAQ per public page; no requests or persistent user state. */
export function PageFaq({ pathname, organTab }: { pathname: string; organTab: string }) {
 const content = pageFaq(pathname, organTab);
 const root = useRef<HTMLElement>(null);
 const heading = useId();
 useEffect(() => {
  let observer: ResizeObserver | undefined;
  let frame = 0;
  let tracking = false;
  const stop = () => { tracking = false; observer?.disconnect(); cancelAnimationFrame(frame); };
  const reveal = (hash = window.location.hash) => {
   stop();
   const target = document.getElementById(hash.slice(1));
   if (!(target instanceof HTMLDetailsElement) || !root.current?.contains(target)) return;
   target.open = true;
   tracking = true;
   const align = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
     if (tracking && target.isConnected) target.scrollIntoView({ block: 'start' });
    });
   };
   // The source results above the footer load asynchronously. Keep a requested
   // answer visible through those layout changes until the reader interacts.
   observer = new ResizeObserver(align);
   observer.observe(root.current.parentElement || root.current);
   align();
  };
  const onHash = () => reveal();
  const onLink = (event: MouseEvent) => {
   const link = event.target instanceof Element ? event.target.closest('a') : null;
   if (link?.getAttribute('href')?.startsWith('#faq-')) reveal(link.hash);
  };
  reveal();
  window.addEventListener('hashchange', onHash);
  window.addEventListener('click', onLink);
  for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) window.addEventListener(event, stop, { passive: true });
  return () => {
   stop();
   window.removeEventListener('hashchange', onHash);
   window.removeEventListener('click', onLink);
   for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) window.removeEventListener(event, stop);
  };
 }, [pathname, content?.id]);
 if (!content) return null;
 return <section className="page-faq" ref={root} aria-labelledby={heading} data-faq-context={content.id} key={pathname+content.id}>
  <header><h2 id={heading}>Questions about this page</h2><span>FAQ · {content.label}</span></header>
  <div className="page-faq-items">{content.items.map(entry => <details key={entry.id} id={'faq-'+entry.id} name={'page-faq-'+heading}>
   <summary><span>{entry.question}</span><Plus size={16} aria-hidden="true"/></summary>
   <div className="page-faq-answer"><p>{entry.answer}</p>{entry.link && <a href={entry.link.href}>{entry.link.label} →</a>}</div>
  </details>)}</div>
 </section>;
}
