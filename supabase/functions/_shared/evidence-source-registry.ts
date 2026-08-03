// Source registry — the single owner of citation identity.
//
// LLMs will keep emitting raw `[Source](url)` markdown regardless of how we
// retrieve evidence. Instead of regex-mutating the model output across many
// sites, we collect every known source up front, then run ONE normalization
// pass that maps inline citations to registry entries (or strips them).
//
// EvidenceContent (excerpts) lives only on the backend; the registry only
// hands out EvidenceSource descriptors to anything client-bound.

import type {
  EvidenceContent,
  EvidenceSource,
  SourceKind,
} from "./pipeline-types.ts";

interface RegisterArgs {
  kind: SourceKind;
  url?: string;
  docRef?: string;
  title?: string;
  label?: string;
  /** Optional backend-only excerpt. Stored separately and never serialized. */
  excerpt?: string;
}

export class EvidenceSourceRegistry {
  private byId = new Map<string, EvidenceSource>();
  private byKey = new Map<string, string>();
  private content = new Map<string, EvidenceContent>();
  private nextId = 1;

  register(args: RegisterArgs): EvidenceSource {
    const key = this.dedupeKey(args);
    const existingId = this.byKey.get(key);
    if (existingId) return this.byId.get(existingId)!;

    const id = `s_${this.nextId++}`;
    const source: EvidenceSource = {
      id,
      kind: args.kind,
      label: args.label ?? this.deriveLabel(args),
      url: args.url,
      docRef: args.docRef,
      title: args.title,
    };
    this.byId.set(id, source);
    this.byKey.set(key, id);
    if (args.excerpt) {
      this.content.set(id, { sourceId: id, excerpt: args.excerpt, chunkCount: 1 });
    }
    return source;
  }

  /** Lookup by id or by raw URL (used by inline citation normalization). */
  resolve(ref: string): EvidenceSource | undefined {
    if (this.byId.has(ref)) return this.byId.get(ref);
    const key = this.urlKey(ref);
    if (key) {
      const id = this.byKey.get(key);
      if (id) return this.byId.get(id);
    }
    return undefined;
  }

  list(): EvidenceSource[] {
    return [...this.byId.values()];
  }

  /** Backend-only. Never expose this to client serialization. */
  getContent(id: string): EvidenceContent | undefined {
    return this.content.get(id);
  }

  private dedupeKey(args: RegisterArgs): string {
    if (args.url) return `url:${this.urlKey(args.url)}`;
    if (args.docRef) return `doc:${args.docRef}`;
    return `lab:${args.label ?? args.title ?? Math.random()}`;
  }

  private urlKey(raw: string): string {
    const cleaned = raw.replace(/[)>\\.,;:!?\"']+$/g, "").trim();
    try {
      const u = new URL(cleaned);
      return `${u.host}${u.pathname}`.toLowerCase().replace(/\/+$/, "");
    } catch {
      return cleaned.toLowerCase();
    }
  }

  private deriveLabel(args: RegisterArgs): string {
    if (args.title) return args.title.slice(0, 140);
    if (args.docRef) return args.docRef;
    if (args.url) {
      try { return new URL(args.url).hostname; } catch { return args.url; }
    }
    return "Source";
  }
}
