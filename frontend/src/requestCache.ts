/** A small, in-memory GET cache. Each reader owns its cancellation independently. */
type Cached = { value: unknown; expiresAt: number; bytes: number };
type Pending = { controller: AbortController; promise: Promise<unknown>; readers: number; settled: boolean };
export type JsonRequestOptions = { headers?: Record<string, string>; signal?: AbortSignal; cache?: RequestCache; credentials?: RequestCredentials };
export class PublicReadError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function publicValidationMessage(url: string, response: Response): Promise<string | null> {
  if (![400, 409].includes(response.status)
    || !/^\/api\/(?:workbench|research|pod|vocab|omaro)(?:\/|\?|$)|^\/api\/(?:entities\/search|discovery\/context)(?:\?|$)/.test(url)) return null;
  try {
    const body = await response.text();
    if (body.length > 8192) return null;
    const payload = JSON.parse(body) as { error?: unknown };
    if (typeof payload.error !== "string") return null;
    const message = payload.error.replace(/\s+/g, " ").trim();
    if (!message || /traceback|stack trace|sqlstate|psycopg|sqlite3|\bselect\b.*\bfrom\b|\/(?:Users|home|Volumes)\//i.test(message)) return null;
    return message.slice(0, 400);
  } catch { return null; }
}

export class JsonRequestCache {
  private completed = new Map<string, Cached>();
  private pending = new Map<string, Pending>();
  private bytes = 0;
  private generation = 0;
  constructor(private readonly settings = { maxEntries: 96, maxBytes: 8 * 1024 * 1024, maxPending: 48, ttlMs: 2_000, timeoutMs: 45_000 }) {}

  clear(): void {
    this.generation += 1;
    this.completed.clear();
    this.bytes = 0;
  }

  private prune(now: number): void {
    for (const [key, entry] of this.completed) {
      if (entry.expiresAt <= now) this.remove(key);
    }
    while (this.completed.size > this.settings.maxEntries || this.bytes > this.settings.maxBytes) {
      const oldest = this.completed.keys().next().value;
      if (oldest === undefined) break;
      this.remove(oldest);
    }
  }

  private remove(key: string): void {
    const entry = this.completed.get(key);
    if (entry) this.bytes -= entry.bytes;
    this.completed.delete(key);
  }

  async get<T>(url: string, options: JsonRequestOptions = {}): Promise<T> {
    if (options.signal?.aborted) throw options.signal.reason ?? new DOMException("Request cancelled", "AbortError");
    const headerKey = Object.entries(options.headers ?? {}).sort(([a], [b]) => a.localeCompare(b));
    const key = JSON.stringify([url, headerKey, options.credentials ?? "include", this.generation]);
    // Current-instance discovery and authenticated/private reads must never reuse a response.
    const reusable = options.cache !== "no-store" && options.cache !== "reload"
      && !headerKey.some(([name]) => /actor|authorization/i.test(name))
      && !/^\/api\/(?:auth|admin|moderation|me|notifications|profile|preferences|contributions|review)(?:\/|\?|$)/.test(url);
    this.prune(Date.now());
    const cached = reusable ? this.completed.get(key) : undefined;
    if (cached) {
      this.completed.delete(key);
      this.completed.set(key, cached);
      return cached.value as T;
    }
    let request = reusable ? this.pending.get(key) : undefined;
    if (!request) {
      const controller = new AbortController();
      const generation = this.generation;
      const timer = setTimeout(() => controller.abort(new DOMException("This request took too long. Try a narrower search or try again.", "TimeoutError")), this.settings.timeoutMs);
      const pending: Pending = { controller, readers: 0, settled: false, promise: Promise.resolve() };
      pending.promise = fetch(url, { ...options, signal: controller.signal, credentials: options.credentials ?? "include" })
        .then(async response => {
          if (!response.ok) {
            const validation = await publicValidationMessage(url, response);
            if (validation) throw new PublicReadError(validation, response.status);
            const message = response.status === 503 || response.status === 504
              ? "The data service could not finish this request. Try a narrower search or try again."
              : response.status === 404 ? "This record is not available in the current dataset."
              : response.status === 429 ? "The data service is busy. Wait a moment and try again."
              : `Could not load the data (${response.status}). Please try again.`;
            throw new PublicReadError(message, response.status);
          }
          const body = await response.text();
          let value: T;
          try { value = JSON.parse(body) as T; }
          catch { throw new Error("The data service returned an unreadable response. Please try again."); }
          const size = body.length * 2;
          if (reusable && generation === this.generation && !controller.signal.aborted && size <= this.settings.maxBytes) {
            this.remove(key);
            this.completed.set(key, { value, bytes: size, expiresAt: Date.now() + this.settings.ttlMs });
            this.bytes += size;
            this.prune(Date.now());
          }
          return value;
        }).catch(error => {
          if (error instanceof TypeError) throw new Error("The data service could not be reached. Check your connection and try again.");
          throw error;
        }).finally(() => {
          pending.settled = true;
          clearTimeout(timer);
          if (this.pending.get(key) === pending) this.pending.delete(key);
        });
      if (reusable && this.pending.size < this.settings.maxPending) this.pending.set(key, pending);
      request = pending;
    }
    return this.subscribe<T>(key, request, options.signal);
  }

  private subscribe<T>(key: string, request: Pending, signal?: AbortSignal): Promise<T> {
    request.readers += 1;
    return new Promise<T>((resolve, reject) => {
      let finished = false;
      const release = () => {
        if (finished) return false;
        finished = true;
        signal?.removeEventListener("abort", abort);
        request.readers -= 1;
        return true;
      };
      const abort = () => {
        if (!release()) return;
        reject(signal?.reason ?? new DOMException("Request cancelled", "AbortError"));
        if (!request.readers && !request.settled) {
          if (this.pending.get(key) === request) this.pending.delete(key);
          request.controller.abort();
        }
      };
      signal?.addEventListener("abort", abort, { once: true });
      // The signal may change between the caller's check and subscription.
      if (signal?.aborted) abort();
      request.promise.then(value => { if (release()) resolve(value as T); }, error => { if (release()) reject(error); });
    });
  }
}

export const jsonRequestCache = new JsonRequestCache();
