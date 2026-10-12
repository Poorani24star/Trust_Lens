require('dotenv').config();
const { extractDocumentText } = require('../services/extraction/documentExtractionService');
const { registerUpload } = require('../services/uploadRegistryService');
const { analyzeErrorDetectionDocument } = require('../services/errorDetection/errorDetectionService');

async function runEndToEndVerification() {
  console.log('=== STARTING TRUSTLENS MULTIMODAL VISION OCR VERIFICATION ===\n');

  // Test 1: Handwritten PDF Assignment
  const pdfPath = 'uploads/25MX333_NAGA_SRUTHI_M_HCI_ASSIGNMENT_4-1790597970681-699662.pdf';
  console.log('1. Testing Scanned/Handwritten PDF Extraction:', pdfPath);
  const pdfResult = await extractDocumentText(pdfPath, '25MX333_NAGA_SRUTHI_M_HCI_ASSIGNMENT_4.pdf', 'application/pdf');

  console.log('PDF Extraction Result:');
  console.log('- Method:', pdfResult.extraction.extractionMethod);
  console.log('- Page Count:', pdfResult.extraction.pageCount);
  console.log('- Total Chars:', pdfResult.extraction.textLength);
  console.log('- Requires OCR:', pdfResult.extraction.requiresOcr);

  const pdfText = pdfResult.extraction.text;
  const hasExpectedHciPhrases = pdfText.includes('Interaction Design Process') || pdfText.includes('Identify User Needs') || pdfText.includes('Human - Computer Interaction');
  console.log('- Contains Expected HCI Content:', hasExpectedHciPhrases ? 'PASS' : 'FAIL');

  if (!hasExpectedHciPhrases) {
    throw new Error('PDF extraction did not contain expected HCI assignment phrases.');
  }

  // Test 2: Handwritten Camera Photo Image
  const imgPath = 'uploads/WhatsApp_Image_2026-09-28_at_4_30_36_PM-1790595155774-883493.jpeg';
  console.log('\n2. Testing Camera Photo Image Extraction:', imgPath);
  const imgResult = await extractDocumentText(imgPath, 'student_cloud_test.jpeg', 'image/jpeg');

  console.log('Image Extraction Result:');
  console.log('- Method:', imgResult.extraction.extractionMethod);
  console.log('- Total Chars:', imgResult.extraction.textLength);
  console.log('- Confidence:', imgResult.extraction.confidence);

  const imgText = imgResult.extraction.text;
  const hasCloudParallelism = imgText.includes('Data Parallelism') && imgText.includes('1000 high-resolution photos');
  console.log('- Contains Expected Cloud Content:', hasCloudParallelism ? 'PASS' : 'FAIL');

  if (!hasCloudParallelism) {
    throw new Error('Image extraction did not contain expected Data Parallelism test notes.');
  }

  // Test 3: Full Error Detection Pipeline on Handwritten Document
  console.log('\n3. Testing Full Error Detection Analysis Pipeline on Handwritten Note...');
  const user = { uid: 'e2e-vision-tester', role: 'student' };
  const uploadSession = registerUpload(user.uid, 'single', [
    {
      originalName: 'student_cloud_test.jpeg',
      uploadPath: 'c:/trustlens/backend/' + imgPath,
      mimeType: 'image/jpeg',
      size: 163594,
    }
  ]);

  const analysisRes = await analyzeErrorDetectionDocument(user, uploadSession.uploadId);
  console.log('Analysis Pipeline Result:');
  console.log('- Success:', analysisRes.success);
  console.log('- Report ID:', analysisRes.reportId);
  console.log('- Domain:', analysisRes.domain);
  console.log('- Primary Topic:', analysisRes.primaryTopic);
  console.log('- Statements Analyzed:', analysisRes.summary?.totalStatementsAnalyzed);
  console.log('- Findings Count:', analysisRes.findings?.length);

  console.log('\n=== ALL MULTIMODAL VISION OCR CHECKS PASSED SUCCESSFULLY ===');
}

runEndToEndVerification().catch(err => {
  console.error('\n*** VERIFICATION FAILED ***\n', err);
  process.exit(1);
});
