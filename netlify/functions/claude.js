exports.handler = async (event) => {

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: { message: 'Método no permitido' } })
    };
  }

  if (!process.env.GEMINI_API_KEY) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: { message: 'GEMINI_API_KEY no configurada en Netlify' } })
    };
  }

  try {
    const incoming = JSON.parse(event.body);

    // ── Extract system prompt and messages from Anthropic-style request ──
    const systemPrompt = incoming.system || '';
    const messages     = incoming.messages || [];

    // Build Gemini contents array
    const contents = [];

    // Add system instruction as first user turn if present
    // (Gemini handles system via systemInstruction field)
    
    for (const msg of messages) {
      const role = msg.role === 'assistant' ? 'model' : 'user';

      if (typeof msg.content === 'string') {
        contents.push({ role, parts: [{ text: msg.content }] });
      } else if (Array.isArray(msg.content)) {
        const parts = [];
        for (const block of msg.content) {
          if (block.type === 'text') {
            parts.push({ text: block.text });
          } else if (block.type === 'document') {
            // Send document as inline base64 data
            parts.push({
              inlineData: {
                mimeType: block.source.media_type,
                data: block.source.data
              }
            });
          } else if (block.type === 'image') {
            parts.push({
              inlineData: {
                mimeType: block.source.media_type,
                data: block.source.data
              }
            });
          }
        }
        if (parts.length > 0) {
          contents.push({ role, parts });
        }
      }
    }

    // Build Gemini request body
    const geminiBody = {
      contents,
      systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
      generationConfig: {
        maxOutputTokens: incoming.max_tokens || 4000,
        temperature: 0.1  // Low temperature for precise data extraction
      }
    };

    // Call Gemini API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody)
    });

    const geminiData = await response.json();

    if (geminiData.error) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: { message: geminiData.error.message } })
      };
    }

    // Convert Gemini response → Anthropic-style response (so frontend works unchanged)
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const anthropicStyleResponse = {
      content: [{ type: 'text', text }],
      model: 'gemini-1.5-flash',
      role: 'assistant',
      stop_reason: 'end_turn'
    };

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(anthropicStyleResponse)
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: { message: 'Error del servidor: ' + err.message } })
    };
  }
};
