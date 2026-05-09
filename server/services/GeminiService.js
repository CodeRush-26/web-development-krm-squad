import axios from 'axios';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

export class GeminiService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
  }

  async analyzeDistressMessage(message) {
    if (!message?.trim()) {
      return {
        severity: 'low',
        summary: 'No distress content provided.',
        source: 'local-fallback',
      };
    }

    if (!this.apiKey) {
      const fallback = {
        severity: 'medium',
        summary: `Distress noted: ${message.slice(0, 120)}`,
        source: 'local-fallback',
      };
      console.log('Gemini Raw Response:', fallback);
      return fallback;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${this.apiKey}`;
    const prompt = `Classify this vessel distress message into severity {low|medium|high|critical} and summarize in one sentence:\n${message}`;
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
      const text =
        data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
        'No AI summary returned.';

      return {
        severity: /critical/i.test(text)
          ? 'critical'
          : /high/i.test(text)
            ? 'high'
            : /medium/i.test(text)
              ? 'medium'
              : 'low',
        summary: text,
        source: GEMINI_MODEL,
      };
    } catch (error) {
      const status = error?.response?.status;
      const responseBody = error?.response?.data;
      console.error('Gemini request failed:', status || error.message, responseBody);
      return {
        severity: /bleeding|evac|emergency|critical|mayday/i.test(message)
          ? 'critical'
          : 'medium',
        summary: `AI fallback: ${message.slice(0, 140)}`,
        source: 'local-fallback-after-error',
      };
    }
  }
}
