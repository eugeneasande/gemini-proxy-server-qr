
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// Extract and parse JSON safely
function extractAndParseJson(text) {
  try {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end === -1) throw new Error('No JSON array found');
    return JSON.parse(text.substring(start, end + 1));
  } catch (e) {
    console.error('JSON parsing error:', e);
    throw new Error('Malformed AI response.');
  }
}

// Call Gemini API
async function callGeminiAPI(apiKey, payload) {
  const URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Gemini error:', text);
    throw new Error(`Gemini API failed: ${res.status}`);
  }

  return await res.json();
}

// Main endpoint
app.post('/scan-imeis', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Missing API key' });

  const imageData = req.body.base64Image;
  if (!imageData) return res.status(400).json({ error: 'Image data missing' });

  const prompt = `
From the image, extract barcode numbers that are explicitly labeled "IMEI 1". 
Ignore all others like "IMEI 2", "S/N", "MEID". 
Return a JSON array in this format:
[{"imei": "123456789012345"}, {"imei": "987654321098765"}]
`;

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              data: imageData,
              mimeType: 'image/jpeg'
            }
          }
        ]
      }
    ]
  };

  try {
    const result = await callGeminiAPI(apiKey, payload);
    const text = result.candidates[0]?.content?.parts[0]?.text || '';
    const imeiArray = extractAndParseJson(text);
    res.json(imeiArray);
  } catch (err) {
    console.error('Final error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Test route
app.get('/', (req, res) => {
  res.send('IMEI Gemini Backend is running.');
});

// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend live on port ${PORT}`));
