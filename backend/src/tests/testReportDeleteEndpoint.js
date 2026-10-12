const http = require('http');
const { createReport } = require('../services/reportService');

function apiCall(method, path, token, body = null) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (postData) {
      headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request({
      hostname: '127.0.0.1',
      port: 5000,
      path: path,
      method: method,
      headers: headers,
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function loginUser(email, password) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 9099,
      path: '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        const authData = JSON.parse(b);
        if (!authData.idToken) return reject(new Error('Login failed: ' + b));
        resolve({ token: authData.idToken, localId: authData.localId });
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify({ email, password }));
    req.end();
  });
}

async function testDeleteReport() {
  console.log('=== TESTING REPORT DELETE FUNCTIONALITY ===\n');

  // 1. Login as student
  console.log('1. Logging in as student1@example.com...');
  const student = await loginUser('student1@example.com', 'Password123!');
  console.log('Student token acquired.');

  // 2. Fetch student reports
  console.log('\n2. Fetching student reports from /api/reports...');
  const reportsRes = await apiCall('GET', '/api/reports', student.token);
  console.log('Reports fetch status:', reportsRes.status);
  const reports = reportsRes.data?.reports || [];
  console.log(`Found ${reports.length} report(s).`);

  let targetReportId = null;
  if (reports.length > 0) {
    targetReportId = reports[0].id;
    console.log(`Selected report to test delete: ${targetReportId} ("${reports[0].title || 'Untitled'}")`);
  } else {
    // Save a dummy report directly to test
    const { createReport } = require('../services/reportService');
    const createdId = await createReport(
      { uid: student.localId, email: 'student1@example.com', name: 'Student 1', role: 'student' },
      'error-detection',
      'Temporary Test Report for Deletion',
      { originalName: 'test_delete_doc.pdf' },
      { totalStatements: 1, verified: 1 },
      [{ index: 0, statement: 'Test statement', classification: 'supported' }]
    );
    targetReportId = createdId;
    console.log(`Created test report for deletion: ${targetReportId}`);
  }

  // 3. Confirm target report exists
  console.log('\n3. Confirming report exists before deletion...');
  const checkBefore = await apiCall('GET', `/api/reports/${targetReportId}`, student.token);
  console.log('Report lookup status:', checkBefore.status);
  if (checkBefore.status !== 200) {
    throw new Error('Report could not be retrieved before deletion test.');
  }

  // 4. Test unauthorized deletion (another user attempting to delete student report)
  console.log('\n4. Testing security: Attempting deletion by an unauthorized user...');
  const unauthorizedUser = await loginUser('faculty1@example.com', 'Password123!');
  // If faculty is not an admin, they should get 403 Forbidden
  const profileRes = await apiCall('GET', '/api/users/me', unauthorizedUser.token);
  if (profileRes.data?.user?.role !== 'admin') {
    const unauthDelete = await apiCall('DELETE', `/api/reports/${targetReportId}`, unauthorizedUser.token);
    console.log('Unauthorized deletion status (expected 403):', unauthDelete.status);
    if (unauthDelete.status !== 403) {
      throw new Error(`Expected 403 Forbidden on unauthorized delete, got ${unauthDelete.status}`);
    }
    console.log('Security check PASS: Non-owner cannot delete report.');
  } else {
    console.log('User is admin, skipping 403 check.');
  }

  // 5. Delete the report as the owner
  console.log('\n5. Deleting report as the owner via DELETE /api/reports/:id...');
  const deleteRes = await apiCall('DELETE', `/api/reports/${targetReportId}`, student.token);
  console.log('Delete response status:', deleteRes.status);
  console.log('Delete response body:', deleteRes.data);

  if (deleteRes.status !== 200 || !deleteRes.data?.success) {
    throw new Error(`Failed to delete report: ${JSON.stringify(deleteRes.data)}`);
  }
  console.log('Deletion confirmed with 200 OK and success: true.');

  // 6. Verify report is gone
  console.log('\n6. Verifying report no longer exists (expect 404)...');
  const checkAfter = await apiCall('GET', `/api/reports/${targetReportId}`, student.token);
  console.log('Post-delete lookup status:', checkAfter.status);
  if (checkAfter.status !== 404) {
    throw new Error(`Expected 404 Not Found after deletion, got ${checkAfter.status}`);
  }
  console.log('Verification check PASS: Report returned 404 Not Found.');

  // 7. Test Admin deletion permission
  console.log('\n7. Testing Admin deletion permission...');
  const admin = await loginUser('admin@demo.com', 'Password123!');
  const adminTestReportId = await createReport(
    { uid: student.localId, email: 'student1@example.com', name: 'Student 1', role: 'student' },
    'error-detection',
    'Report to be deleted by Admin',
    { originalName: 'admin_delete_test.pdf' },
    { totalStatements: 1, verified: 1 },
    [{ index: 0, statement: 'Admin delete test', classification: 'supported' }]
  );
  console.log(`Created student report for admin deletion test: ${adminTestReportId}`);

  const adminDeleteRes = await apiCall('DELETE', `/api/reports/${adminTestReportId}`, admin.token);
  console.log('Admin delete response status:', adminDeleteRes.status);
  if (adminDeleteRes.status !== 200 || !adminDeleteRes.data?.success) {
    throw new Error(`Admin failed to delete report: ${JSON.stringify(adminDeleteRes.data)}`);
  }
  console.log('Admin deletion verified with 200 OK.');

  console.log('\n=== ALL REPORT DELETE TESTS PASSED ===');
}

testDeleteReport().catch(err => {
  console.error('\n*** TEST FAILED ***\n', err);
  process.exit(1);
});
