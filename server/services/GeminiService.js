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
const AVAILABLE_PORTS = ['Muscat', 'Salalah', 'Doha', 'Abu Dhabi', 'Fujairah'];
const SUPPORT_VESSELS = ['Tug Alpha', 'MedEvac-1', 'Coast Guard Patrol 7'];

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
        summary: 'No distress content provided',
        injuries: 0,
        needsEscort: false,
        suggestedAction: 'Continue monitoring and maintain current route.',
        timestamp: new Date().toISOString(),
        source: 'local-fallback',
      };
    }

    if (!this.apiKey) {
      const fallback = {
        severity: 'medium',
        type: 'general',
        summary: 'Distress signal received with incomplete AI connectivity.',
        injuries: /\b(\d+)\b/.test(message) ? Number(message.match(/\b(\d+)\b/)?.[1] || 1) : 1,
        needsEscort: /escort|medical evac|evac|mayday|rescue/i.test(message),
        suggestedAction: 'Redirect to Muscat for immediate assistance.',
        timestamp: new Date().toISOString(),
        source: 'local-fallback',
      };
      console.log('Gemini Raw Response:', fallback);
      return fallback;
    }

    const modelToUse = await this.resolveModel();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${this.apiKey}`;
    const prompt = `You are a maritime emergency dispatcher. Analyze the following message and return ONLY a valid JSON object. Do not include markdown formatting or extra text.
Available Ports: ${AVAILABLE_PORTS.join(', ')}.
Support Vessels: ${SUPPORT_VESSELS.join(', ')}.
If distress indicates Mechanical Failure, Out of Fuel, or Medical Emergency, set "suggestedAction" like: "Redirect to [Port Name] for immediate assistance."
Schema: { "severity": "low" | "medium" | "high", "type": string, "summary": string, "injuries": number, "needsEscort": boolean, "suggestedAction": string }.

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
        summary: String(parsed?.summary || 'Distress reported'),
        injuries: Number.isFinite(Number(parsed?.injuries)) ? Number(parsed.injuries) : 0,
        needsEscort: Boolean(parsed?.needsEscort),
        suggestedAction: String(
          parsed?.suggestedAction || 'Redirect to Muscat for immediate assistance.'
        ),
        timestamp: new Date().toISOString(),
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
        summary: /medical|bleeding|injury|laceration|evac/i.test(message)
          ? 'Medical distress reported by crew'
          : 'Operational distress reported by vessel',
        injuries: /\b(\d+)\b/.test(message) ? Number(message.match(/\b(\d+)\b/)?.[1] || 1) : 1,
        needsEscort: /escort|medical evac|evac|mayday|rescue/i.test(message),
        suggestedAction: /mechanical|engine|drift|out of fuel|fuel|medical|bleeding|injury|evac/i.test(
          message
        )
          ? 'Redirect to Muscat for immediate assistance.'
          : 'Dispatch Tug Alpha and continue close monitoring.',
        timestamp: new Date().toISOString(),
        source: 'local-fallback-after-error',
      };
    }
  }

  /**
   * Dark-vessel / AIS spoofing classification for operator identification workflow.
   * @param {{ proximityKm?: number; speedKnots?: number; tier?: number; behavior?: string }} ctx
   */
  async analyzeThreatSignature(ctx) {
    const proximityKm = Number(ctx?.proximityKm ?? 0);
    const speedKnots = Number(ctx?.speedKnots ?? 0);
    const tier = Number(ctx?.tier ?? 1);
    const behavior = String(ctx?.behavior ?? 'unknown');

    if (!this.apiKey) {
      const classification =
        tier >= 3
          ? 'Likely hostile fast craft — intercept recommended'
          : behavior === 'stationary'
            ? 'Non-AIS fishing trawler or anchored dhow'
            : 'Suspected pirate skiff — erratic AIS-null track';
      console.log('Threat signature (fallback):', classification);
      return { classification, source: 'local-fallback' };
    }

    const modelToUse = await this.resolveModel();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${this.apiKey}`;
    const prompt = `You are a maritime security analyst. An unidentified radar contact shows AIS spoofing / no identity.
Closest range to friendly traffic: ${proximityKm.toFixed(2)} km.
Observed speed: ${speedKnots.toFixed(1)} knots.
Track behavior: ${behavior}.
Alert tier: ${tier} (1=radar detection fringe, 2=caution, 3=threat proximity).

Return ONLY valid JSON, no markdown:
{ "classification": "<concise label e.g. Likely Pirate Skiff or Non-AIS Fishing Trawler>" }
classification max 90 characters.`;

    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    };

    try {
      const { data } = await axios.post(url, body, { timeout: 12000 });
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '{}';
      const stripped = text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      const parsed = JSON.parse(stripped);
      const classification = String(parsed?.classification || 'Unidentified surface contact').slice(
        0,
        120
      );
      console.log('Gemini threat signature:', classification);
      return { classification, source: modelToUse };
    } catch (error) {
      console.error('Gemini threat signature failed:', error?.message || error);
      return {
        classification:
          tier >= 3
            ? 'High-risk unidentified vessel — treat as hostile until classified'
            : 'Small craft — probable non-compliant fishing or logistics tender',
        source: 'local-fallback-after-error',
      };
    }
  }
}
