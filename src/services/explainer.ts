import { GoogleGenAI } from '@google/genai';

export async function fetchDictionaryDefinition(term: string): Promise<string> {
  const clean = term.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return 'Invalid selection.';
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${clean}`);
    if (!res.ok) return 'No standard dictionary definition found.';
    const data = await res.json();
    return data[0]?.meanings[0]?.definitions[0]?.definition || 'Definition unavailable.';
  } catch {
    return 'Unable to connect to dictionary service.';
  }
}

export async function fetchContextualExplanation(
  term: string,
  surroundingContext: string,
  apiKey: string
): Promise<string> {
  if (!apiKey) {
    return 'Add your free Gemini API key in Settings to activate context-aware explanations.';
  }
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are an academic learning assistant. Explain what the term/phrase "${term}" means in the context of this excerpt:\n\n"${surroundingContext}"\n\nExplain it clearly in 2 concise, plain-English sentences.`
    });
    return response.text || 'No explanation generated.';
  } catch (err: any) {
    return `AI Explanation error: ${err.message || 'Check your API key.'}`;
  }
}
