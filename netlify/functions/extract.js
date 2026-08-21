const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const { imageBase64, mimeType } = JSON.parse(event.body);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        system: 'Extract client contact info from this image. Respond ONLY with valid JSON, no markdown:\n{"clientName":"","clientPhone":"","clientEmail":"","jobAddress":"","estimateRef":""}\nLeave as empty string if not visible. estimateRef = any estimate or job number.',
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: 'Extract the client contact information from this image.' }
          ]
        }]
      })
    });

    const data = await response.json();
    const raw = data.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(raw);

    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(parsed) };

  } catch (err) {
    return { statusCode: 500, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err.message }) };
  }
};
