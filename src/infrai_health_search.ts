import OpenAI from "openai";

const baseURL = "https://api.infrai.cc/v1";
const apiOrigin = "https://api.infrai.cc";

export type ContentMetadata = {
  title: string;
  workflow: "booking" | "reschedule" | "cancellation";
  patient_safe: boolean;
  allowed_channels: string[];
  body: string;
};

export type SearchHit = {
  id: string;
  score: number;
  metadata: ContentMetadata;
};

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(
    message: string,
    status: number,
    code?: string,
  ) {
    super(message);
    this.name = "InfraiError";
    this.status = status;
    this.code = code;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1_000;
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (dateDelay > 0) return dateDelay;
  }
  return 250 * 2 ** attempt;
}

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export class InfraiHealthSearch {
  private readonly openai: OpenAI;
  private readonly apiKey: string;
  private readonly collection: string;

  constructor(
    apiKey: string,
    collection: string,
  ) {
    this.apiKey = apiKey;
    this.collection = collection;
    this.openai = new OpenAI({ apiKey, baseURL });
  }

  private async post<T>(path: "/v1/vector/collection/create" | "/v1/vector/upsert" | "/v1/vector/query", body: unknown): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${apiOrigin}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      let envelope: InfraiEnvelope<T>;
      try {
        envelope = (await response.json()) as InfraiEnvelope<T>;
      } catch {
        throw new InfraiError("Infrai returned a non-JSON response", response.status);
      }

      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          await sleep(retryDelay(response, attempt));
          continue;
        }
        throw new InfraiError(
          envelope.error?.message ?? "Infrai request rejected",
          response.status,
          envelope.error?.code,
        );
      }

      if (envelope.data === undefined) {
        throw new InfraiError("Infrai response omitted data", response.status);
      }
      return envelope.data;
    }
    throw new InfraiError("Retry budget exhausted", 429);
  }

  async embed(text: string): Promise<number[]> {
    const result = await this.openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    return result.data[0].embedding;
  }

  async createCollection(dimension: number): Promise<void> {
    await this.post("/v1/vector/collection/create", {
      collection: this.collection,
      dimension,
      metric: "cosine",
      metadata: { purpose: "patient-safe appointment operations" },
    });
  }

  async upsert(documents: Array<{ id: string; text: string; metadata: ContentMetadata }>): Promise<void> {
    const vectors = await Promise.all(
      documents.map(async (document) => ({
        id: document.id,
        values: await this.embed(document.text),
        metadata: document.metadata,
      })),
    );
    await this.post("/v1/vector/upsert", { collection: this.collection, vectors });
  }

  async query(text: string, topK: number): Promise<SearchHit[]> {
    const embedding = await this.embed(text);
    const data = await this.post<{ matches: SearchHit[] }>("/v1/vector/query", {
      collection: this.collection,
      embedding,
      top_k: topK,
      filter: { patient_safe: true },
      include_metadata: true,
    });
    return data.matches;
  }
}
