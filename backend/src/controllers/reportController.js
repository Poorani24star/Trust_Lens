const reportService = require('../services/reportService');

/**
 * GET /api/reports
 * Lists reports for authenticated user
 */
async function listReports(req, res, next) {
  try {
    const result = await reportService.listUserReports(req.user.uid, req.query);
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  }
}

/**
 * GET /api/reports/stats/summary
 * Retrieves summary statistics for Reports & History dashboard
 */
async function getReportStats(req, res, next) {
  try {
    let stats;
    if (req.user?.role === 'admin') {
      const adminService = require('../services/adminService');
      const dash = await adminService.getDashboardStats();
      const rep = dash?.reports || {};
      stats = {
        totalReports: rep.total || 0,
        errorDetectionReports: rep.errorDetection || 0,
        copiedContentReports: rep.copiedContent || 0,
        recentReports: rep.total || 0,
      };
    } else {
      stats = await reportService.getUserReportStats(req.user.uid);
    }
    return res.status(200).json({
      success: true,
      stats,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  }
}

/**
 * GET /api/reports/:reportId
 * Retrieves full report details with subcollections
 */
async function getReportById(req, res, next) {
  try {
    const report = await reportService.getUserReportById(req.params.reportId, req.user.uid);
    return res.status(200).json({
      success: true,
      report,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  }
}

/**
 * DELETE /api/reports/:reportId
 * Deletes report document and all associated subcollection documents
 */
async function deleteReport(req, res, next) {
  try {
    const result = await reportService.deleteUserReport(req.params.reportId, req.user.uid, req.user.role);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  }
}

module.exports = {
  listReports,
  getReportStats,
  getReportById,
  deleteReport,
};
