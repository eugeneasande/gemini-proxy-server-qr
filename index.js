// Filename: index.js (Corrected)

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// ✅ FIX: Allow requests from any origin ('*').
// This is necessary for the app to work in development (like here) and on Netlify.
app.use(cors({ origin: '*' }));

app.use(express.json({ limit: '10mb' }));

// Helper function to call the Gemini API
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

// Helper function to extract JSON from the AI's text response
function extractAndParseJson(text) {
  try {
    // This regex is more robust for finding JSON within a string that might have ```json ... ``` markers.
    const match = text.match(/```json\s*([\s\S]*?)\s*```|(\[[\s\S]*\])/);
    if (!match) {
        throw new Error("No JSON array found in the string.");
    }
    // Use the first captured group that is not undefined.
    const jsonString = match[1] || match[2];
    return JSON.parse(jsonString);
  } catch (e) {
    console.error("Malformed AI response:", text);
    throw new Error('Malformed AI response: ' + e.message);
  }
}

// The main proxy route
app.post('/gemini-proxy', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const base64 = req.body.base64Image;

  if (!apiKey) return res.status(500).json({ error: 'Missing Gemini API key on server' });
  if (!base64) return res.status(400).json({ error: 'Missing base64 image in request' });

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
              mimeType: 'image/jpeg' // Assuming jpeg, but your frontend can be more specific
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
    res.status(500).json({ error: `Proxy Server Error: ${err.message}` });
  }
});

// A simple root route to confirm the server is running
app.get('/', (_, res) => {
  res.send('Gemini Proxy is running.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
