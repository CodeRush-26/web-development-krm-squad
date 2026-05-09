import axios from 'axios';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const MODEL_CANDIDATES = [
  GEMINI_MODEL,
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash-8b',
  'gemini-1.5-flash',
];

export class GeminiService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
    this.activeModel = null;
  }

  async resolveModel() {
    if (this.activeModel) return this.activeModel;
    if (!this.apiKey) return GEMINI_MODEL;

    try {
      const { data } = await axios.get(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`,
        { timeout: 10000 }
      );
      const available = Array.isArray(data?.models) ? data.models : [];
      const supportsGenerate = available
        .filter((m) => (m?.supportedGenerationMethods || []).includes('generateContent'))
        .map((m) => String(m.name || '').replace(/^models\//, ''));

      for (const candidate of MODEL_CANDIDATES) {
        if (supportsGenerate.includes(candidate)) {
          this.activeModel = candidate;
          console.log('Gemini model selected:', this.activeModel);
          return this.activeModel;
        }
      }

      const firstFlash = supportsGenerate.find((m) => /flash/i.test(m));
      if (firstFlash) {
        this.activeModel = firstFlash;
        console.log('Gemini model selected:', this.activeModel);
        return this.activeModel;
      }

      this.activeModel = supportsGenerate[0] || GEMINI_MODEL;
      console.log('Gemini model selected:', this.activeModel);
      return this.activeModel;
    } catch (error) {
      console.error('Gemini model discovery failed:', error.message);
      this.activeModel = GEMINI_MODEL;
      return this.activeModel;
    }
  }

  async analyzeDistressMessage(message) {
    if (!message?.trim()) {
      return {
        severity: 'low',
        type: 'unknown',
        injuries: 0,
        needsEscort: false,
        source: 'local-fallback',
      };
    }

    if (!this.apiKey) {
      const fallback = {
        severity: 'medium',
        type: 'general',
        injuries: /\b(\d+)\b/.test(message) ? Number(message.match(/\b(\d+)\b/)?.[1] || 1) : 1,
        needsEscort: /escort|medical evac|evac|mayday|rescue/i.test(message),
        source: 'local-fallback',
      };
      console.log('Gemini Raw Response:', fallback);
      return fallback;
    }

    const modelToUse = await this.resolveModel();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${this.apiKey}`;
    const prompt = `You are a maritime emergency dispatcher. Analyze the following message and return ONLY a valid JSON object. Do not include markdown formatting or extra text. Schema: { "severity": "low" | "medium" | "high", "type": string, "injuries": number, "needsEscort": boolean }.

Message:
${message}`;
    console.log('Gemini Prompt:', prompt);

    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
    };

    try {
      const { data } = await axios.post(url, body, { timeout: 10000 });
      console.log('Gemini Raw Response:', data);
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '{}';
      const stripped = text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      const parsed = JSON.parse(stripped);
      const severity = ['low', 'medium', 'high'].includes(parsed?.severity)
        ? parsed.severity
        : 'medium';

      return {
        severity,
        type: String(parsed?.type || 'general'),
        injuries: Number.isFinite(Number(parsed?.injuries)) ? Number(parsed.injuries) : 0,
        needsEscort: Boolean(parsed?.needsEscort),
        source: modelToUse,
      };
    } catch (error) {
      const status = error?.response?.status;
      const responseBody = error?.response?.data;
      console.error('Gemini request failed:', status || error.message, responseBody);
      return {
        severity: /bleeding|evac|emergency|critical|mayday/i.test(message)
          ? 'high'
          : 'medium',
        type: /medical|bleeding|injury|laceration|evac/i.test(message)
          ? 'medical'
          : 'general',
        injuries: /\b(\d+)\b/.test(message) ? Number(message.match(/\b(\d+)\b/)?.[1] || 1) : 1,
        needsEscort: /escort|medical evac|evac|mayday|rescue/i.test(message),
        source: 'local-fallback-after-error',
      };
    }
  }
}
