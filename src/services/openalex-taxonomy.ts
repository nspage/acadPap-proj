export interface OpenAlexDomain {
  id: string;
  display_name: string;
}

export interface OpenAlexSubfield {
  id: string;
  display_name: string;
}

export interface OpenAlexField {
  id: string;
  display_name: string;
  subfields: OpenAlexSubfield[];
}

export interface OpenAlexTopic {
  id: string;
  display_name: string;
  description?: string;
  works_count?: number;
}

const BASE_URL = 'https://api.openalex.org';

export async function fetchDomains(): Promise<OpenAlexDomain[]> {
  const res = await fetch(`${BASE_URL}/domains`);
  if (!res.ok) throw new Error('Failed to fetch domains');
  const data = await res.json();
  return data.results;
}

export async function fetchFieldsForDomain(domainId: string): Promise<OpenAlexField[]> {
  // Extract just the ID part, e.g., "1" from "https://openalex.org/domains/1"
  const shortId = domainId.split('/').pop();
  const res = await fetch(`${BASE_URL}/fields?filter=domain.id:${shortId}&per_page=100`);
  if (!res.ok) throw new Error('Failed to fetch fields');
  const data = await res.json();
  return data.results;
}

export async function fetchTopicsForSubfield(subfieldId: string): Promise<OpenAlexTopic[]> {
  const shortId = subfieldId.split('/').pop();
  const res = await fetch(`${BASE_URL}/topics?filter=subfield.id:${shortId}&per_page=100&sort=works_count:desc`);
  if (!res.ok) throw new Error('Failed to fetch topics');
  const data = await res.json();
  return data.results;
}
