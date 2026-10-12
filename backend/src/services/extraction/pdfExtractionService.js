const fs = require('fs');
const pdfParse = require('pdf-parse');
const { normalizeText } = require('./textNormalizationService');
const { extractBufferOcrText, createOcrWorker, cleanOcrText } = require('./ocrExtractionService');
const { transcribeWithVision } = require('./visionOcrService');

/**
 * Checks whether extracted text for a page has sufficient meaningful words to avoid OCR
 * @param {string} text 
 * @returns {boolean}
 */
function isTextSufficientForClaimExtraction(text) {
  if (!text || typeof text !== 'string') return false;

  const trimmed = text.trim();
  if (trimmed.length < 25) return false;

  // Strip page markers, scanner stamps, and running footers before counting
  const cleaned = trimmed
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '')
    .replace(/^Page\s+\d+(\s+of\s+\d+)?$/gmi, '')
    .replace(/Scanned (by|with) [^\n\r]+/gi, '')
    .replace(/CamScanner/gi, '')
    .replace(/^\s*\d+\s*$/gm, '')
    .trim();

  const words = cleaned.split(/\s+/).filter(w => /[a-zA-Z]{2,}/.test(w));
  // Need at least 6 meaningful alphabetical words to form a factual claim
  return words.length >= 6;
}

/**
 * Extracts text from PDF files using digital text extraction with OCR fallback for scanned pages
 * @param {string} filePath Absolute path to PDF file
 * @returns {Promise<Object>} Extraction result with text, pages, extractionMethod
 */
async function extractPdfText(filePath) {
  if (!fs.existsSync(filePath)) {
    const err = new Error('PDF file not found on server');
    err.statusCode = 404;
    throw err;
  }

  const dataBuffer = fs.readFileSync(filePath);
  if (!dataBuffer || dataBuffer.length === 0) {
    return {
      text: '',
      textLength: 0,
      extractionMethod: 'normal',
      pageCount: 0,
      pages: [],
      requiresOcr: false,
      message: 'PDF file is empty.',
    };
  }

  // Validate PDF header signature
  const headerCheck = dataBuffer.slice(0, 10).toString();
  if (!headerCheck.includes('%PDF-')) {
    const err = new Error('Invalid PDF structure: File does not contain a valid PDF header.');
    err.statusCode = 422;
    throw err;
  }

  const PDFParseClass = pdfParse.PDFParse || pdfParse;
  let parser = null;
  let ocrWorker = null;

  try {
    parser = new PDFParseClass({ data: dataBuffer });
    let textRes;
    try {
      textRes = await parser.getText();
    } catch (err) {
      console.warn('[PdfExtractionService] PDF getText parsing failed:', err.message);
      const error = new Error(`Failed to parse PDF: ${err.message}`);
      error.statusCode = 422;
      throw error;
    }

    const totalPages = textRes.total || (Array.isArray(textRes.pages) ? textRes.pages.length : 1) || 1;
    const rawPagesArray = textRes.pages || [];

    const pageResults = [];
    let visionUsedCount = 0;
    let ocrUsedCount = 0;
    let normalUsedCount = 0;
    const ocrPagesList = [];

    for (let p = 1; p <= totalPages; p++) {
      const digitalPageText = rawPagesArray[p - 1]?.text || (totalPages === 1 ? textRes.text : '');
      const isDigitalSufficient = isTextSufficientForClaimExtraction(digitalPageText);

      if (isDigitalSufficient) {
        // Page has sufficient selectable digital text -> Skip OCR for this page
        normalUsedCount++;
        const cleanedDigital = normalizeText(digitalPageText);
        pageResults.push({
          pageNumber: p,
          method: 'normal',
          text: cleanedDigital,
          textLength: cleanedDigital.length,
          wordCount: cleanedDigital.split(/\s+/).filter(Boolean).length,
        });
      } else {
        // Page is scanned or has insufficient digital text -> Run OCR on page screenshot
        ocrPagesList.push(p);

        try {
          let pageImageBuffer = null;

          // Attempt 1: Render page screenshot via parser.getScreenshot
          try {
            const screenshotRes = await parser.getScreenshot({ partial: [p], scale: 1.5 });
            if (screenshotRes && Array.isArray(screenshotRes.pages) && screenshotRes.pages[0]?.data) {
              pageImageBuffer = screenshotRes.pages[0].data;
            }
          } catch (scErr) {
            console.warn(`[PdfExtractionService] Screenshot failed for page ${p}:`, scErr.message);
          }

          // Attempt 2: If screenshot was unavailable, check embedded images on page
          if (!pageImageBuffer) {
            try {
              const imageRes = await parser.getImage({ partial: [p] });
              if (imageRes && Array.isArray(imageRes.pages) && imageRes.pages[0]?.images?.[0]?.data) {
                pageImageBuffer = imageRes.pages[0].images[0].data;
              }
            } catch (imgErr) {
              console.warn(`[PdfExtractionService] Embedded image extraction failed for page ${p}:`, imgErr.message);
            }
          }

          if (pageImageBuffer) {
            let pageTextFound = false;

            // 1. High-accuracy Multimodal Vision OCR (for handwriting and complex scanned documents)
            if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '') {
              try {
                console.log(`[PdfExtractionService] Transcribing scanned/handwritten page ${p} with Gemini Vision...`);
                const visionRes = await transcribeWithVision(pageImageBuffer, 'image/png');
                if (visionRes.success && visionRes.text && visionRes.text.trim().length > 0) {
                  const cleanedVision = normalizeText(visionRes.text);
                  visionUsedCount++;
                  pageTextFound = true;
                  pageResults.push({
                    pageNumber: p,
                    method: 'gemini-vision',
                    text: cleanedVision,
                    textLength: cleanedVision.length,
                    confidence: visionRes.confidence || 98,
                    wordCount: cleanedVision.split(/\s+/).filter(Boolean).length,
                  });
                }
              } catch (visionErr) {
                console.warn(`[PdfExtractionService] Vision OCR failed on page ${p}, falling back to Tesseract:`, visionErr.message);
              }
            }

            // 2. Offline / Fallback: Tesseract.js OCR
            if (!pageTextFound) {
              if (!ocrWorker) {
                ocrWorker = await createOcrWorker();
              }
              const ocrRes = await extractBufferOcrText(pageImageBuffer, ocrWorker);
              const cleanedOcr = cleanOcrText(ocrRes.text);

              if (cleanedOcr && cleanedOcr.length > 0) {
                ocrUsedCount++;
                pageResults.push({
                  pageNumber: p,
                  method: 'ocr',
                  text: cleanedOcr,
                  textLength: cleanedOcr.length,
                  confidence: ocrRes.confidence || 0,
                  wordCount: cleanedOcr.split(/\s+/).filter(Boolean).length,
                });
              } else {
                // OCR produced no readable text on this page
                pageResults.push({
                  pageNumber: p,
                  method: 'ocr_unreadable',
                  text: '',
                  textLength: 0,
                  confidence: 0,
                  wordCount: 0,
                  warning: `Page ${p} could not be recognized reliably via OCR.`,
                });
              }
            }
          } else {
            // No image or screenshot could be rendered for this page
            pageResults.push({
              pageNumber: p,
              method: 'unreadable',
              text: digitalPageText ? normalizeText(digitalPageText) : '',
              textLength: (digitalPageText || '').length,
              wordCount: (digitalPageText || '').split(/\s+/).filter(Boolean).length,
            });
          }
        } catch (pageOcrErr) {
          console.error(`[PdfExtractionService] OCR failed on page ${p}:`, pageOcrErr.message);
          pageResults.push({
            pageNumber: p,
            method: 'failed',
            text: digitalPageText ? normalizeText(digitalPageText) : '',
            textLength: 0,
            wordCount: 0,
            error: pageOcrErr.message,
          });
        }
      }
    }

    // Determine overall document extraction method
    let finalExtractionMethod = 'normal';
    if (normalUsedCount > 0 && (visionUsedCount > 0 || ocrUsedCount > 0)) {
      finalExtractionMethod = 'mixed';
    } else if (visionUsedCount > 0) {
      finalExtractionMethod = 'gemini-vision';
    } else if (ocrUsedCount > 0) {
      finalExtractionMethod = 'ocr';
    } else {
      finalExtractionMethod = 'normal';
    }

    // Combine page texts preserving strict document page order
    const combinedPagesText = pageResults
      .map(pr => pr.text)
      .filter(Boolean)
      .join('\n\n');

    const normalizedFullText = normalizeText(combinedPagesText);

    return {
      text: normalizedFullText,
      textLength: normalizedFullText.length,
      extractionMethod: finalExtractionMethod,
      pageCount: totalPages,
      ocrPages: ocrPagesList,
      pages: pageResults,
      requiresOcr: finalExtractionMethod !== 'normal',
      qualityNotes: pageResults.filter(pr => pr.method === 'ocr_unreadable').length > 0
        ? 'Some pages could not be read reliably. Please upload a clearer document if necessary.'
        : null,
    };

  } catch (err) {
    console.error('[PdfExtractionService] PDF extraction failed:', err.message);
    const error = new Error(`Failed to extract text from PDF: ${err.message}`);
    error.statusCode = 422;
    throw error;
  } finally {
    if (parser && typeof parser.destroy === 'function') {
      await parser.destroy().catch(() => {});
    }
    if (ocrWorker) {
      await ocrWorker.terminate().catch(() => {});
    }
  }
}

module.exports = {
  isTextSufficientForClaimExtraction,
  extractPdfText,
};
