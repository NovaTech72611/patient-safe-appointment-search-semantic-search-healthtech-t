import type { ContentMetadata, SearchHit } from "./infrai_health_search.js";

export type SearchProvider = {
  query(text: string, topK: number): Promise<SearchHit[]>;
};

export type PatientNotice = {
  content_id: string;
  title: string;
  body: string;
  channel: string;
  workflow: ContentMetadata["workflow"];
};

export async function findPatientSafeNotices(
  provider: SearchProvider,
  input: { query: string; channel: string; limit: number },
): Promise<PatientNotice[]> {
  const hits = await provider.query(input.query, Math.min(input.limit * 3, 30));

  return hits
    .filter((hit) => hit.metadata.patient_safe)
    .filter((hit) => hit.metadata.allowed_channels.includes(input.channel))
    .slice(0, input.limit)
    .map((hit) => ({
      content_id: hit.id,
      title: hit.metadata.title,
      body: hit.metadata.body,
      channel: input.channel,
      workflow: hit.metadata.workflow,
    }));
}
