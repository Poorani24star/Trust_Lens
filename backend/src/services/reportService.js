const { getDb } = require('../config/firebaseAdmin');
const { FieldValue } = require('firebase-admin/firestore');

/**
 * Converts Firestore Timestamps to ISO 8601 string representation
 */
function serializeTimestamps(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  if (typeof obj.toDate === 'function') {
    return obj.toDate().toISOString();
  }
  if (typeof obj._seconds === 'number') {
    return new Date(obj._seconds * 1000).toISOString();
  }
  if (typeof obj.seconds === 'number') {
    return new Date(obj.seconds * 1000).toISOString();
  }

  if (Array.isArray(obj)) {
    return obj.map(serializeTimestamps);
  }

  const serialized = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val.toDate === 'function') {
      serialized[key] = val.toDate().toISOString();
    } else if (val && (typeof val?._seconds === 'number' || typeof val?.seconds === 'number')) {
      const sec = val._seconds ?? val.seconds;
      serialized[key] = new Date(sec * 1000).toISOString();
    } else if (val && typeof val === 'object') {
      serialized[key] = serializeTimestamps(val);
    } else {
      serialized[key] = val;
    }
  }

  return serialized;
}

function sanitizeForFirestore(obj) {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== 'object') return obj;
  if (typeof obj.toDate === 'function') return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore);
  }

  const cleaned = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    cleaned[key] = val === undefined ? null : sanitizeForFirestore(val);
  }
  return cleaned;
}

const memoryReportCache = new Map();

/**
 * Saves a completed analysis report to Cloud Firestore (with in-memory fallback for quota resilience)
 */
async function createReport(user, reportType, title, documentMeta, summaryMeta, detailedResults, uploadId = null) {
  const db = getDb();
  const normalizedReportType = (reportType || '').toLowerCase().replace('_', '-');
  const isErrorDetection = normalizedReportType === 'error-detection';
  const domain = isErrorDetection ? (documentMeta?.domain || summaryMeta?.domain || 'Computer Science') : null;
  const primaryTopic = isErrorDetection ? (documentMeta?.primaryTopic || summaryMeta?.primaryTopic || 'General Computer Science') : null;
  const detectedTopics = isErrorDetection ? (documentMeta?.detectedTopics || summaryMeta?.detectedTopics || []) : [];
  const now = new Date().toISOString();
  const fallbackId = `rep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const reportData = sanitizeForFirestore({
    id: fallbackId,
    reportId: fallbackId,
    userId: user.uid,
    userName: user.name || user.email || 'User',
    userEmail: user.email || '',
    reportType: normalizedReportType,
    title,
    status: 'completed',
    uploadId: uploadId || null,
    domain,
    primaryTopic,
    detectedTopics,
    document: documentMeta,
    summary: summaryMeta,
    createdAt: now,
    updatedAt: now,
    findings: isErrorDetection ? detailedResults : [],
    documentPairs: !isErrorDetection ? detailedResults : [],
  });

  memoryReportCache.set(fallbackId, reportData);

  if (!db) {
    console.warn('[ReportService] DB not initialized, stored in memory cache:', fallbackId);
    return fallbackId;
  }

  try {
    // Idempotency check: if report for this uploadId already exists for this user, return existing report ID
    if (uploadId) {
      const existingSnap = await db
        .collection('reports')
        .where('userId', '==', user.uid)
        .where('uploadId', '==', uploadId)
        .limit(1)
        .get();

      if (!existingSnap.empty) {
        const existingId = existingSnap.docs[0].id;
        console.log(`[ReportService] Idempotency hit: Report for uploadId ${uploadId} already exists (${existingId}).`);
        return existingId;
      }
    }

    const reportRef = db.collection('reports').doc();
    const firestoreData = { ...reportData, id: reportRef.id, reportId: reportRef.id };
    delete firestoreData.findings;
    delete firestoreData.documentPairs;

    await reportRef.set(firestoreData);

    // Write detailed findings / document pairs to subcollections
    if (isErrorDetection && Array.isArray(detailedResults)) {
      const batch = db.batch();
      const findingsRef = reportRef.collection('findings');

      for (const item of detailedResults) {
        const docId = item.statementId || `statement_${item.index}`;
        batch.set(findingsRef.doc(docId), sanitizeForFirestore(item));
      }
      await batch.commit();
    } else if (normalizedReportType === 'copied-content' && Array.isArray(detailedResults)) {
      const pairsRef = reportRef.collection('documentPairs');
      const CHUNK_SIZE = 15;
      for (let i = 0; i < detailedResults.length; i += CHUNK_SIZE) {
        const chunk = detailedResults.slice(i, i + CHUNK_SIZE);
        const batch = db.batch();
        for (const pair of chunk) {
          const docId = pair.pairId || `pair_${i + 1}`;
          batch.set(pairsRef.doc(docId), sanitizeForFirestore(pair));
        }
        await batch.commit();
      }
    }

    if (fallbackId !== reportRef.id) {
      memoryReportCache.delete(fallbackId);
    }
    memoryReportCache.set(reportRef.id, { ...reportData, id: reportRef.id, reportId: reportRef.id });
    return reportRef.id;
  } catch (dbErr) {
    console.warn('[ReportService] Firestore write notice (retaining in local session cache):', dbErr.message);
    return fallbackId;
  }

  // Log report completion activity safely (non-blocking)
  try {
    const { logActivity, ACTIVITY_ACTIONS, ACTIVITY_CATEGORIES } = require('./activityService');
    const formattedType = normalizedReportType === 'copied-content' ? 'Copied Content' : 'Error Detection';
    await logActivity({
      action: ACTIVITY_ACTIONS.REPORT_ANALYSIS_COMPLETED,
      category: ACTIVITY_CATEGORIES.REPORT,
      message: `A ${formattedType} analysis report "${title}" was generated by ${user.name || user.email || 'User'}.`,
      actorId: user.uid,
      targetId: reportRef.id,
      user: user.name || user.email || 'User',
      userName: user.name || user.email || 'User',
      role: user.role || 'student',
      status: 'completed',
      metadata: {
        reportId: reportRef.id,
        reportType: normalizedReportType,
        title,
        status: 'completed',
      },
    });
  } catch (logErr) {
    console.error('[ReportService] Failed to log report completion activity:', logErr.message);
  }

  return reportRef.id;
}

/**
 * Lists reports belonging to the authenticated user with optional filters, search, and pagination
 */
async function listUserReports(userUid, filters = {}) {
  const db = getDb();
  let reports = [];

  if (db) {
    try {
      const query = db.collection('reports').where('userId', '==', userUid);
      const snapshot = await query.get();
      snapshot.forEach(doc => {
        const data = doc.data();
        reports.push({
          id: doc.id,
          ...serializeTimestamps(data),
        });
      });
    } catch (dbErr) {
      console.warn('[ReportService] listUserReports Firestore query fallback:', dbErr.message);
    }
  }

  // Merge in-memory cached reports for this user
  for (const [id, rData] of memoryReportCache.entries()) {
    if (rData.userId === userUid && !reports.some(r => r.id === id)) {
      reports.push({
        id,
        ...rData,
      });
    }
  }

  // Client-side filtering on type (normalized for hyphens and underscores)
  if (filters.type && filters.type !== 'all') {
    const targetType = filters.type.toLowerCase().replace('_', '-');
    reports = reports.filter(r => {
      const rt = (r.reportType || r.type || '').toLowerCase().replace('_', '-');
      return rt === targetType;
    });
  }

  // Client-side filtering on status
  if (filters.status && filters.status !== 'all') {
    const targetStatus = filters.status.toLowerCase();
    reports = reports.filter(r => (r.status || 'completed').toLowerCase() === targetStatus);
  }

  // Client-side search filtering on title
  if (filters.search && typeof filters.search === 'string') {
    const searchLower = filters.search.toLowerCase().trim();
    reports = reports.filter(r => r.title && r.title.toLowerCase().includes(searchLower));
  }

  // Sort descending by createdAt
  reports.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  // Simple limit pagination
  const limit = filters.limit ? Math.min(parseInt(filters.limit, 10), 50) : 10;
  const hasMore = reports.length > limit;
  const paginatedReports = reports.slice(0, limit);

  return {
    reports: paginatedReports,
    pagination: {
      hasMore,
      nextCursor: hasMore ? paginatedReports[paginatedReports.length - 1].id : null,
    },
  };
}

/**
 * Retrieves full details for a single report including subcollection findings/documentPairs
 */
async function getUserReportById(reportId, userUid) {
  const cachedReport = memoryReportCache.get(reportId);
  const db = getDb();

  if (cachedReport && !db) {
    if (cachedReport.userId !== userUid) {
      const err = new Error('You do not have permission to access this report');
      err.statusCode = 403;
      throw err;
    }
    return cachedReport;
  }

  try {
    const docRef = db.collection('reports').doc(reportId);
    const doc = await docRef.get();

    if (!doc.exists) {
      if (cachedReport) {
        if (cachedReport.userId !== userUid) {
          const err = new Error('You do not have permission to access this report');
          err.statusCode = 403;
          throw err;
        }
        return cachedReport;
      }
      const err = new Error('Report not found');
      err.statusCode = 404;
      throw err;
    }

    const data = doc.data();

    // Strict ownership check
    if (data.userId !== userUid) {
      const err = new Error('You do not have permission to access this report');
      err.statusCode = 403;
      throw err;
    }

    const report = {
      id: doc.id,
      ...serializeTimestamps(data),
    };

    // Fetch detailed subcollection data
    const normalizedType = (data.reportType || data.type || '').toLowerCase().replace('_', '-');
    if (normalizedType === 'error-detection') {
      const findingsSnap = await docRef.collection('findings').get();
      const findings = [];
      findingsSnap.forEach(fDoc => {
        findings.push(serializeTimestamps(fDoc.data()));
      });
      // Sort findings by index ascending
      findings.sort((a, b) => (a.index || 0) - (b.index || 0));
      report.findings = findings;
    } else if (normalizedType === 'copied-content') {
      const pairsSnap = await docRef.collection('documentPairs').get();
      const documentPairs = [];
      pairsSnap.forEach(pDoc => {
        documentPairs.push(serializeTimestamps(pDoc.data()));
      });
      if (documentPairs.length > 0) {
        report.documentPairs = documentPairs;
        report.pairResults = documentPairs;
      } else if (cachedReport && Array.isArray(cachedReport.documentPairs) && cachedReport.documentPairs.length > 0) {
        report.documentPairs = cachedReport.documentPairs;
        report.pairResults = cachedReport.documentPairs;
      } else if (Array.isArray(report.documentPairs) && report.documentPairs.length > 0) {
        report.pairResults = report.documentPairs;
      } else {
        report.documentPairs = [];
        report.pairResults = [];
      }
    }

    return report;
  } catch (err) {
    if (err.statusCode === 403) throw err;
    if (cachedReport) {
      if (cachedReport.userId !== userUid) {
        const authErr = new Error('You do not have permission to access this report');
        authErr.statusCode = 403;
        throw authErr;
      }
      return cachedReport;
    }
    throw err;
  }
}

/**
 * Deletes a report and all of its associated subcollection documents
 */
async function deleteUserReport(reportId, userUid, userRole = null) {
  const db = getDb();
  const isAdmin = userRole === 'admin';

  if (!db) {
    if (memoryReportCache.has(reportId)) {
      const cached = memoryReportCache.get(reportId);
      if (cached.userId !== userUid && !isAdmin) {
        const err = new Error('You do not have permission to delete this report');
        err.statusCode = 403;
        throw err;
      }
      memoryReportCache.delete(reportId);
      return { success: true, message: 'Report deleted successfully' };
    }
    const err = new Error('Report not found');
    err.statusCode = 404;
    throw err;
  }

  const docRef = db.collection('reports').doc(reportId);
  const doc = await docRef.get();

  if (!doc.exists) {
    if (memoryReportCache.has(reportId)) {
      const cached = memoryReportCache.get(reportId);
      if (cached.userId !== userUid && !isAdmin) {
        const err = new Error('You do not have permission to delete this report');
        err.statusCode = 403;
        throw err;
      }
      memoryReportCache.delete(reportId);
      return { success: true, message: 'Report deleted successfully' };
    }
    const err = new Error('Report not found');
    err.statusCode = 404;
    throw err;
  }

  const data = doc.data();

  // Strict ownership check (owner or admin)
  if (data.userId !== userUid && !isAdmin) {
    const err = new Error('You do not have permission to delete this report');
    err.statusCode = 403;
    throw err;
  }

  // Delete subcollection documents
  const batch = db.batch();

  try {
    const findingsSnap = await docRef.collection('findings').get();
    findingsSnap.forEach(fDoc => batch.delete(fDoc.ref));
  } catch (fErr) {
    console.warn('[ReportService] findings deletion fallback notice:', fErr.message);
  }

  try {
    const pairsSnap = await docRef.collection('documentPairs').get();
    pairsSnap.forEach(pDoc => batch.delete(pDoc.ref));
  } catch (pErr) {
    console.warn('[ReportService] documentPairs deletion fallback notice:', pErr.message);
  }

  batch.delete(docRef);
  await batch.commit();

  // Also remove from in-memory cache if present
  memoryReportCache.delete(reportId);

  return {
    success: true,
    message: 'Report deleted successfully',
  };
}

/**
 * Computes summary statistics for the user's Reports & History dashboard
 */
async function getUserReportStats(userUid) {
  const db = getDb();
  let totalReports = 0;
  let errorDetectionReports = 0;
  let copiedContentReports = 0;
  let recentReports = 0;
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const seenIds = new Set();

  if (db) {
    try {
      const snapshot = await db.collection('reports').where('userId', '==', userUid).get();
      snapshot.forEach(doc => {
        const data = doc.data();
        seenIds.add(doc.id);
        totalReports++;

        const normType = (data.reportType || data.type || '').toLowerCase().replace('_', '-');
        if (normType === 'error-detection') errorDetectionReports++;
        if (normType === 'copied-content') copiedContentReports++;

        const createdAtMs = data.createdAt && typeof data.createdAt.toDate === 'function' 
          ? data.createdAt.toDate().getTime() 
          : (data.createdAt ? new Date(data.createdAt).getTime() : 0);

        if (createdAtMs >= sevenDaysAgo) {
          recentReports++;
        }
      });
    } catch (dbErr) {
      console.warn('[ReportService] Error fetching user report stats from Firestore:', dbErr.message);
    }
  }

  // Include any session memory reports
  for (const [id, memRep] of memoryReportCache.entries()) {
    if (memRep.userId === userUid && !seenIds.has(id)) {
      seenIds.add(id);
      totalReports++;
      const normType = (memRep.reportType || memRep.type || '').toLowerCase().replace('_', '-');
      if (normType === 'error-detection') errorDetectionReports++;
      if (normType === 'copied-content') copiedContentReports++;
      const createdAtMs = memRep.createdAt ? new Date(memRep.createdAt).getTime() : 0;
      if (createdAtMs >= sevenDaysAgo) {
        recentReports++;
      }
    }
  }

  return {
    totalReports,
    errorDetectionReports,
    copiedContentReports,
    recentReports,
  };
}

/**
 * Searches for an existing report by userId and temporaryUploadId to prevent duplicate creation
 */
async function findReportByUploadId(userUid, uploadId) {
  const db = getDb();
  if (!db || !uploadId) return null;

  try {
    const snap = await db.collection('reports')
      .where('userId', '==', userUid)
      .where('document.temporaryUploadId', '==', uploadId)
      .limit(1)
      .get();

    if (snap.empty) return null;
    return snap.docs[0].id;
  } catch (err) {
    console.error('[ReportService] Error finding report by upload ID:', err.message);
    return null;
  }
}

function getMemoryReports() {
  return Array.from(memoryReportCache.values());
}

module.exports = {
  createReport,
  listUserReports,
  getUserReportById,
  deleteUserReport,
  getUserReportStats,
  findReportByUploadId,
  getMemoryReports,
  serializeTimestamps,
};
