import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import type { FastifyReply } from 'fastify';

interface ReportData {
  totalTestRuns: number;
  totalTestCases: number;
  totalTestsExecuted: number;
  passRate: number;
  failRate: number;
  activeProjects: number;
  testRunsByStatus: { status: string; count: number }[];
  trendData: { date: string; passed: number; failed: number }[];
  topFailures: { testCaseId: string; title: string; failCount: number }[];
}

export async function exportToPDF(
  data: ReportData,
  reply: FastifyReply
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      reply.raw.setHeader(
        'Content-Type',
        'application/pdf'
      );
      reply.raw.setHeader(
        'Content-Disposition',
        'attachment; filename=test-report.pdf'
      );

      const doc = new PDFDocument({ margin: 50 });
      doc.pipe(reply.raw);

      // Title
      doc.fontSize(24).font('Helvetica-Bold').text('Test Execution Report', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica').text(`Generated: ${new Date().toISOString()}`, { align: 'center' });
      doc.moveDown(1.5);

      // Section: Summary
      doc.fontSize(16).font('Helvetica-Bold').text('Summary');
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);

      const summaryRows = [
        ['Total Test Runs', String(data.totalTestRuns)],
        ['Total Test Cases', String(data.totalTestCases)],
        ['Tests Executed', String(data.totalTestsExecuted)],
        ['Pass Rate', `${data.passRate}%`],
        ['Fail Rate', `${data.failRate}%`],
        ['Active Projects', String(data.activeProjects)],
      ];

      for (const [label, value] of summaryRows) {
        doc.fontSize(11).font('Helvetica-Bold').text(label, 50, doc.y, { continued: true, width: 200 });
        doc.font('Helvetica').text(`  ${value}`, { width: 300 });
        doc.moveDown(0.3);
      }
      doc.moveDown(1);

      // Section: Status Distribution
      doc.fontSize(16).font('Helvetica-Bold').text('Status Distribution');
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);

      for (const item of data.testRunsByStatus) {
        doc.fontSize(11).font('Helvetica-Bold').text(item.status, 50, doc.y, { continued: true, width: 300 });
        doc.font('Helvetica').text(`  ${item.count}`, { width: 200 });
        doc.moveDown(0.3);
      }
      doc.moveDown(1);

      // Section: Top Failures
      doc.fontSize(16).font('Helvetica-Bold').text('Top Failures');
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);

      const topFive = data.topFailures.slice(0, 5);
      if (topFive.length === 0) {
        doc.fontSize(11).font('Helvetica').text('No failures recorded.');
      } else {
        let rank = 1;
        for (const failure of topFive) {
          doc.fontSize(11).font('Helvetica-Bold').text(`${rank}. ${failure.title}`, 50, doc.y, { continued: true, width: 420 });
          doc.font('Helvetica').text(`  Failures: ${failure.failCount}`, { width: 150 });
          doc.moveDown(0.3);
          rank++;
        }
      }
      doc.moveDown(1);

      // Section: Trend (last 7 days)
      doc.fontSize(16).font('Helvetica-Bold').text('Trend (last 7 days)');
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);

      if (data.trendData.length === 0) {
        doc.fontSize(11).font('Helvetica').text('No trend data available.');
      } else {
        for (const entry of data.trendData) {
          doc.fontSize(11).font('Helvetica-Bold').text(entry.date, 50, doc.y, { continued: true, width: 150 });
          doc.font('Helvetica').text(`  Passed: ${entry.passed}  |  Failed: ${entry.failed}`, { width: 350 });
          doc.moveDown(0.3);
        }
      }

      doc.end();

      reply.raw.on('finish', () => resolve());
      reply.raw.on('error', (err: Error) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

export async function exportToExcel(
  data: ReportData,
  reply: FastifyReply
): Promise<void> {
  reply.raw.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  reply.raw.setHeader(
    'Content-Disposition',
    'attachment; filename=test-report.xlsx'
  );

  const workbook = new ExcelJS.Workbook();

  // Sheet 1: Summary
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 30 },
    { header: 'Value', key: 'value', width: 20 },
  ];

  summarySheet.addRow({ metric: 'Total Test Runs', value: data.totalTestRuns });
  summarySheet.addRow({ metric: 'Total Test Cases', value: data.totalTestCases });
  summarySheet.addRow({ metric: 'Tests Executed', value: data.totalTestsExecuted });
  summarySheet.addRow({ metric: 'Pass Rate (%)', value: data.passRate });
  summarySheet.addRow({ metric: 'Fail Rate (%)', value: data.failRate });
  summarySheet.addRow({ metric: 'Active Projects', value: data.activeProjects });

  // Style header row
  const summaryHeaderRow = summarySheet.getRow(1);
  summaryHeaderRow.font = { bold: true };

  // Sheet 2: Status Distribution
  const statusSheet = workbook.addWorksheet('Status');
  statusSheet.columns = [
    { header: 'Status', key: 'status', width: 25 },
    { header: 'Count', key: 'count', width: 15 },
  ];

  for (const item of data.testRunsByStatus) {
    statusSheet.addRow({ status: item.status, count: item.count });
  }

  const statusHeaderRow = statusSheet.getRow(1);
  statusHeaderRow.font = { bold: true };

  // Sheet 3: Top Failures
  const failuresSheet = workbook.addWorksheet('Top Failures');
  failuresSheet.columns = [
    { header: 'Test Case', key: 'testCase', width: 50 },
    { header: 'Fail Count', key: 'failCount', width: 15 },
  ];

  for (const failure of data.topFailures) {
    failuresSheet.addRow({ testCase: failure.title, failCount: failure.failCount });
  }

  const failuresHeaderRow = failuresSheet.getRow(1);
  failuresHeaderRow.font = { bold: true };

  // Sheet 4: Trend
  const trendSheet = workbook.addWorksheet('Trend');
  trendSheet.columns = [
    { header: 'Date', key: 'date', width: 20 },
    { header: 'Passed', key: 'passed', width: 15 },
    { header: 'Failed', key: 'failed', width: 15 },
  ];

  for (const entry of data.trendData) {
    trendSheet.addRow({ date: entry.date, passed: entry.passed, failed: entry.failed });
  }

  const trendHeaderRow = trendSheet.getRow(1);
  trendHeaderRow.font = { bold: true };

  await workbook.xlsx.write(reply.raw);
}
