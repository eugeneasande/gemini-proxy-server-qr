import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// ✅ FIX CORS for Netlify
app.use(cors({
  origin: 'https://qr-barcode-imei.netlify.app' // ✅ your frontend
}));

app.use(express.json({ limit: '10mb' }));

// Gemini API helper
async function callGeminiAPI(apiKey, payload) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errorText}`);
  }

  return await res.json();
}

// JSON extraction
function extractAndParseJson(text) {
  try {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end === -1) throw new Error('No JSON array found');
    return JSON.parse(text.substring(start, end + 1));
  } catch (e) {
    throw new Error('Malformed AI response: ' + e.message);
  }
}

// ✅ FINAL Gemini proxy route
app.post('/gemini-proxy', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const base64 = req.body.base64Image;

  if (!apiKey) return res.status(500).json({ error: 'Missing Gemini API key' });
  if (!base64) return res.status(400).json({ error: 'Missing base64 image' });

  const prompt = `
From the image, extract only barcode numbers labeled "IMEI 1".
Ignore "IMEI 2", "S/N", or anything else.
Respond with clean JSON array like: [{"imei": "123456789012345"}, {"imei": "234567890123456"}]
`;

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              data: base64,
              mimeType: 'image/jpeg'
            }
          }
        ]
      }
    ]
  };

  try {
    const result = await callGeminiAPI(apiKey, payload);
    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const imeis = extractAndParseJson(rawText);
    res.json(imeis);
  } catch (err) {
    console.error('Gemini Proxy Error:', err.message);
    res.status(500).send(`Proxy Server Error: ${err.message}`);
  }
});

app.get('/', (_, res) => {
  res.send('Gemini Proxy is running.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
