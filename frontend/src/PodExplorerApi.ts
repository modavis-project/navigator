import {useEffect, useState} from 'react';
import {publicGetJson} from './api';
export async function podJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.errors?.map((item: {message:string}) => item.message).join('; ') || `Request failed (${response.status})`);
  return data;
}
export function usePodRead<T>(url: string | null) {
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{url:string; data?:T; error?:string}>();
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    publicGetJson<T>(url, controller.signal).then(data => setState({url, data})).catch(error => {
      if (!controller.signal.aborted) setState({url, error: String(error.message || error)});
    });
    return () => controller.abort();
  }, [url, retry]);
  return {...(state?.url === url ? state : {}), retry: () => {setState(undefined); setRetry(value => value + 1);}};
}
export function downloadPodJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], {type: 'application/json'}));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
