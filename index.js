// Filename: index.js (or server.js)

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();

app.use(cors({ origin: 'https://qr-barcode-imei.netlify.app' }));
app.use(express.json({ limit: '10mb' }));

// Helper function to find and parse JSON from a string
const extractAndParseJson = (text) => {
  try {
    const startIndex = text.indexOf('{');
    const endIndex = text.lastIndexOf('}');
    if (startIndex === -1 || endIndex === -1) {
      throw new Error("No JSON object found in the string.");
    }
    const jsonString = text.substring(startIndex, endIndex + 1);
    return JSON.parse(jsonString);
  } catch (error) {
    console.error("Failed during JSON extraction/parsing:", error);
    throw new Error("Malformed JSON response from AI.");
  }
};

// Centralized function to call the Gemini API
async function callGoogleApi(apiKey, payload) {
    const GOOGLE_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const response = await fetch(GOOGLE_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error("Error from Google API:", errorBody);
        throw new Error(`Google API responded with status ${response.status}`);
    }
    return response.json();
}


app.post('/gemini-proxy', async (req, res) => {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'API key not configured on the server.' });
  }

  try {
    // --- First Attempt: Get all data ---
    let data = await callGoogleApi(GEMINI_API_KEY, req.body);
    let parsedJson;

    if (data.candidates && data.candidates.length > 0) {
        const textResponse = data.candidates[0].content.parts[0].text;
        parsedJson = extractAndParseJson(textResponse);
    } else {
        throw new Error("AI did not provide an initial response.");
    }

    // --- Check if IMEI is missing and perform Targeted Extraction if needed ---
    if (!parsedJson.imei) {
        console.warn("IMEI missing. Initiating Targeted Extraction for IMEI...");

        const imeiPrompt = "Analyze the attached image. Find the long numeric string next to the 'IMEI#' label. Respond with ONLY that number, nothing else.";
        const imeiPayload = {
            contents: [{ parts: [ { text: imeiPrompt }, req.body.contents[0].parts[1] ] }] // Re-use the image data
        };

        const imeiData = await callGoogleApi(GEMINI_API_KEY, imeiPayload);

        if (imeiData.candidates && imeiData.candidates.length > 0) {
            const imeiText = imeiData.candidates[0].content.parts[0].text;
            // Clean up the response to get only the number
            parsedJson.imei = imeiText.replace(/\D/g, ''); // Removes all non-digit characters
            console.log("Successfully extracted IMEI on second attempt:", parsedJson.imei);
        } else {
            console.error("Targeted IMEI extraction failed to get a candidate.");
        }
    }
    
    // Return the final, potentially combined, JSON object
    return res.json(parsedJson);

  } catch (error) {
    console.error('Proxy Server Final Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Proxy server with Targeted Extraction listening on port ${PORT}`);
});
