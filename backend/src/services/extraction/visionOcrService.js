const sharp = require('sharp');
const https = require('https');
const dns = require('dns').promises;

// Robust public DNS resolver to guard against local network DHCP DNS timeouts
const publicResolver = new dns.Resolver();
publicResolver.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);

let cachedGoogleIp = null;
let lastIpResolveTime = 0;

/**
 * Resolves generativelanguage.googleapis.com IP directly via public DNS with caching
 * Falls back to standard hostname if custom resolution fails
 */
async function getGenerativeLanguageHost() {
  const now = Date.now();
  if (cachedGoogleIp && (now - lastIpResolveTime < 300000)) {
    return cachedGoogleIp;
  }
  try {
    const addresses = await publicResolver.resolve4('generativelanguage.googleapis.com');
    if (addresses && addresses.length > 0) {
      cachedGoogleIp = addresses[0];
      lastIpResolveTime = now;
      return cachedGoogleIp;
    }
  } catch (err) {
    // If public DNS query fails, fall back to standard OS hostname resolution
  }
  return 'generativelanguage.googleapis.com';
}

/**
 * Dispatches an HTTPS POST request to the Google Generative Language API
 * @param {string} modelName
 * @param {string} apiKey
 * @param {Object} payload
 * @returns {Promise<{status: number, data?: Object, error?: string}>}
 */
async function sendGeminiPost(modelName, apiKey, payload) {
  const host = await getGenerativeLanguageHost();
  const path = `/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const postData = JSON.stringify(payload);

  return new Promise((resolve) => {
    const req = https.request({
      host: host,
      port: 443,
      path: path,
      method: 'POST',
      headers: {
        'Host': 'generativelanguage.googleapis.com',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
      servername: 'generativelanguage.googleapis.com',
      timeout: 16000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 408, error: 'Request timed out' });
    });

    req.on('error', (err) => {
      resolve({ status: 500, error: err.message });
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Transcribes handwritten or printed document images using Google Gemini Multimodal Vision API
 * @param {Buffer} imageBuffer 
 * @param {string} [mimeType='image/jpeg']
 * @returns {Promise<{success: boolean, text?: string, error?: string, extractionMethod?: string, confidence?: number}>}
 */
async function transcribeWithVision(imageBuffer, mimeType = 'image/jpeg') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return {
      success: false,
      reason: 'NO_API_KEY',
      error: 'GEMINI_API_KEY is not configured in .env',
    };
  }

  // Pre-process and resize large camera photos for optimal handwriting OCR and fast network transport
  let bufferToSend = imageBuffer;
  try {
    bufferToSend = await sharp(imageBuffer)
      .rotate() // Auto-orient based on camera EXIF tags
      .resize(1300, 1300, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch (sharpErr) {
    console.warn('[VisionOcrService] Sharp resize warning, using raw buffer:', sharpErr.message);
    bufferToSend = imageBuffer;
  }

  const base64Data = bufferToSend.toString('base64');
  const safeMime = 'image/jpeg';

  const prompt = `Transcribe ONLY the handwritten and printed text visible on this document page.
Rules:
1. Preserve all question numbers, section titles (e.g. 1a, 1b, CA1 Test), headings, and lists faithfully.
2. Maintain natural paragraph breaks and sentence structure.
3. Do NOT provide commentary, corrections, explanations, or conversational introductions (e.g. do NOT say "Here is the transcription").
4. Output strictly the transcribed content.`;

  // Multimodal vision models in priority order
  const modelsToTry = [
    'gemini-3.6-flash',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
  ];

  for (const modelName of modelsToTry) {
    try {
      console.log(`[VisionOcrService] Transcribing document page with ${modelName}...`);
      const payload = {
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: safeMime,
                  data: base64Data,
                },
              },
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2500,
        },
      };

      const res = await sendGeminiPost(modelName, apiKey.trim(), payload);

      if (res.status === 200 && res.data) {
        const rawText = res.data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText && rawText.trim().length > 0) {
          // Clean conversational preamble or markdown code fences
          const cleanText = rawText
            .replace(/^```[a-z]*\r?\n/i, '')
            .replace(/\r?\n```$/g, '')
            .replace(/^(?:Here is the transcription[^\n]*|Below is the transcription[^\n]*|Transcribed text:)\s*\n+/i, '')
            .replace(/^---+[\r\n]+/gm, '')
            .trim();

          console.log(`[VisionOcrService] Successfully transcribed via ${modelName} (${cleanText.length} characters)`);
          return {
            success: true,
            text: cleanText,
            extractionMethod: `gemini-vision (${modelName})`,
            confidence: 98,
          };
        }
      } else {
        const msg = res.data?.error?.message || res.error || `HTTP ${res.status}`;
        console.warn(`[VisionOcrService] ${modelName} failed (${res.status}): ${msg}`);
      }
    } catch (err) {
      console.warn(`[VisionOcrService] ${modelName} unexpected error: ${err.message}`);
    }
  }

  return {
    success: false,
    reason: 'ALL_MODELS_FAILED',
    error: 'All Gemini Vision models were temporarily unavailable or returned empty text.',
  };
}

module.exports = {
  transcribeWithVision,
};
