export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  const { text, lang, scenario } = req.body;

  if (!text || text.trim().length < 3) {
    return res.status(400).json({ error: 'No observation text provided' });
  }

  const isKnownScenario = !!scenario && scenario !== 'null';

  const SCENARIO_SLOTS = {
    pain:          ['location', 'intensity', 'action', 'medication', 'extra'],
    repositioning: ['position', 'skin', 'extra'],
    fluid:         ['amount', 'type', 'concern', 'extra'],
    skin:          ['location', 'action', 'treatment', 'followup', 'extra'],
    medication:    ['medication', 'dose', 'time', 'reaction', 'followup', 'extra'],
    fall:          ['found', 'injury', 'doctor', 'extra'],
    restless:      ['behaviour', 'action', 'extra'],
    sleep:         ['quality', 'action', 'extra'],
    vital:         ['values', 'action', 'followup', 'extra'],
    nutrition:     ['intake', 'action', 'concern', 'extra'],
  };

  const systemPrompt = isKnownScenario
    ? `You are a German clinical documentation specialist for Pflegeeinrichtungen.

Your task: Extract slot values from a nursing observation and return structured JSON.

You have access to an advisor tool. Use it ONLY if:
- The input language is ambiguous and affects clinical meaning
- A safety-critical clinical detail needs expert interpretation
- The scenario is more complex than the template covers

Slots for scenario "${scenario}": ${(SCENARIO_SLOTS[scenario] || []).join(', ')}

Return ONLY valid JSON — no markdown, no preamble:
{
  "slots": { "slot_name": "German value" },
  "ambiguity_flags": ["safety-critical missing detail"],
  "vocabulary": [{"informal": "phrase in their language", "clinical": "German clinical term"}]
}

Extract ONLY what is explicitly stated. Never infer. Never fill gaps. Flag missing safety-critical info.`

    : `You are a German clinical documentation specialist for Pflegeeinrichtungen.

Your task: Transform an informal nursing observation into proper Pflegedokumentation.

You have access to an advisor tool. Use it if:
- The clinical content is complex or unusual
- Translation is genuinely ambiguous
- Multiple overlapping symptoms need careful clinical interpretation

Return ONLY valid JSON — no markdown, no preamble:
{
  "clinical_german": "Beobachtung: ...\n\nMaßnahme: ...\n\nEmpfehlung: ...",
  "confidence": "high" or "low",
  "ambiguity_flags": ["specific missing safety-critical detail"],
  "vocabulary": [{"informal": "what they said", "clinical": "German clinical term"}]
}

NEVER invent clinical details. NEVER fill in gaps. Flag everything missing. Nurse MUST review.`;

  const userPrompt = isKnownScenario
    ? `Language: ${lang || 'English'}\nObservation: "${text}"\nScenario: ${scenario}\nExtract slots.`
    : `Language: ${lang || 'English'}\nObservation: "${text}"\nTransform to Pflegedokumentation.`;

  const requestBody = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: isKnownScenario ? 500 : 1000,
    system: systemPrompt,
    tools: [
      {
        type: 'advisor_20260301',
        name: 'advisor',
        model: 'claude-opus-4-6',
        max_uses: 2
      }
    ],
    messages: [{ role: 'user', content: userPrompt }]
  };

  try {
    let anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'advisor-tool-2026-03-01',
      },
      body: JSON.stringify(requestBody)
    });

    if (!anthropicRes.ok) {
      const errData = await anthropicRes.json();
      const isAdvisorError = errData.error?.message?.includes('advisor') ||
                             errData.error?.message?.includes('beta');

      if (isAdvisorError || anthropicRes.status === 400) {
        const fallbackBody = { ...requestBody };
        delete fallbackBody.tools;

        anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(fallbackBody)
        });
      }

      if (!anthropicRes.ok) {
        const finalErr = await anthropicRes.json();
        return res.status(anthropicRes.status).json({
          error: finalErr.error?.message || 'Anthropic API error'
        });
      }
    }

    const data = await anthropicRes.json();

    const textBlock = data.content?.find(b => b.type === 'text');
    const raw = textBlock?.text || '';
    const advisorUsed = data.content?.some(b => b.type === 'advisor_tool_use');

    let parsed;
    try {
      parsed = JSON.parse(
        raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      );
    } catch (e) {
      return res.status(500).json({
        error: 'Could not parse clinical output. Please try again.',
        raw
      });
    }

    return res.status(200).json({
      ...parsed,
      scenario: scenario || null,
      advisorUsed: advisorUsed || false,
      model: 'haiku' + (advisorUsed ? '+opus' : '')
    });

  } catch (err) {
    console.error('Transform error:', err);
    return res.status(500).json({
      error: 'Server error. Please try again.',
      detail: err.message
    });
  }
}

