const express = require('express');
const path = require('path');
const {google} = require('googleapis');
const XLSX = require('xlsx');
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function getGoogleAuth(scopes) {
  const credsEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  // Cloud Run secrets can be injected either as file paths or inline JSON.
  return credsEnv && credsEnv.trim().startsWith('{')
    ? new google.auth.GoogleAuth({
        credentials: JSON.parse(credsEnv),
        scopes
      })
    : new google.auth.GoogleAuth({ scopes });
}

function getSheetsClient() {
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
  return google.sheets({version: 'v4', auth});
}

function getDriveClient() {
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/drive.readonly']);
  return google.drive({ version: 'v3', auth });
}

function toClientSheetError(err, action) {
  const causeMsg = (err && err.cause && err.cause.message) ? String(err.cause.message) : '';
  const msg = err && err.message ? String(err.message) : '';
  const full = `${causeMsg} ${msg}`.toLowerCase();

  if (full.includes('not supported for this document')) {
    return {
      status: 400,
      error: 'This file is not a native Google Sheet. Open it in Google Sheets and use File -> Save as Google Sheets, then update SHEET_ID to the new file ID.'
    };
  }

  if (full.includes('unable to parse range')) {
    return {
      status: 400,
      error: 'The sheet tab name in range is invalid. Update the range (default is Sheet1!A1:Z1000) to match your actual tab name.'
    };
  }

  return {
    status: 500,
    error: action === 'read' ? 'Failed to read sheet data' : 'Failed to append row'
  };
}

function extractGoogleFileId(input) {
  if (!input) return '';
  const fromSpreadsheets = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (fromSpreadsheets) return fromSpreadsheets[1];
  const fromDriveFile = input.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
  if (fromDriveFile) return fromDriveFile[1];
  const fromQuery = input.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  if (fromQuery) return fromQuery[1];
  return '';
}

function getXlsxDownloadUrl() {
  if (process.env.XLSX_FILE_ID) {
    return `https://drive.google.com/uc?export=download&id=${process.env.XLSX_FILE_ID}`;
  }

  if (!process.env.XLSX_URL) return '';

  const url = process.env.XLSX_URL;
  const fileId = extractGoogleFileId(url);
  if (fileId) return `https://drive.google.com/uc?export=download&id=${fileId}`;
  return url;
}

async function readXlsxValues() {
  const xlsxUrl = getXlsxDownloadUrl();
  if (!xlsxUrl) {
    throw new Error('XLSX_URL or XLSX_FILE_ID not configured');
  }

  const resp = await fetch(xlsxUrl, { redirect: 'follow' });
  if (!resp.ok) {
    throw new Error(`Failed to download XLSX (${resp.status})`);
  }

  const arrayBuffer = await resp.arrayBuffer();
  const workbook = XLSX.read(Buffer.from(arrayBuffer), { type: 'buffer' });
  const sheetName = process.env.XLSX_SHEET_NAME || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error(`Sheet tab not found: ${sheetName}`);
  }

  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
}

async function getDefaultTabTitle(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title'
  });
  return meta.data?.sheets?.[0]?.properties?.title || 'Sheet1';
}

async function getCurrentValues(requestedRange) {
  const sheetId = process.env.SHEET_ID;
  if (sheetId) {
    const sheets = getSheetsClient();
    let range = requestedRange;
    if (!range) {
      const firstTitle = await getDefaultTabTitle(sheets, sheetId);
      range = `${firstTitle}!A1:Z1000`;
    }

    const resp = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
    return { values: resp.data.values || [], source: 'google-sheets' };
  }

  const values = await readXlsxValues();
  return { values, source: 'xlsx' };
}

// Read rows from the sheet. Expects SHEET_ID env var and optional range query.
app.get('/api/sheet', async (req, res) => {
  const requestedRange = req.query.range;
  try {
    const { values, source } = await getCurrentValues(requestedRange);
    return res.json({values, source});
  } catch (err) {
    console.error(err);
    const clientErr = toClientSheetError(err, 'read');
    return res.status(clientErr.status).json({error: clientErr.error});
  }
});

app.get('/api/export.xlsx', async (req, res) => {
  try {
    const sheetId = process.env.SHEET_ID;

    // If running in native Google Sheets mode, export through Drive to preserve styles.
    if (sheetId) {
      const drive = getDriveClient();
      const fileMeta = await drive.files.get({ fileId: sheetId, fields: 'name' });
      const rawName = (fileMeta.data && fileMeta.data.name) ? fileMeta.data.name : 'sheet-export';
      const safeName = rawName.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'sheet-export';
      const fileName = safeName.toLowerCase().endsWith('.xlsx') ? safeName : `${safeName}.xlsx`;

      const exported = await drive.files.export(
        {
          fileId: sheetId,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        },
        { responseType: 'arraybuffer' }
      );

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      return res.send(Buffer.from(exported.data));
    }

    // XLSX source mode fallback: download and return the original file bytes.
    const xlsxUrl = getXlsxDownloadUrl();
    if (!xlsxUrl) {
      return res.status(400).json({error: 'No export source configured'});
    }

    const resp = await fetch(xlsxUrl, { redirect: 'follow' });
    if (!resp.ok) {
      return res.status(500).json({error: `Failed to download source XLSX (${resp.status})`});
    }

    const arrayBuffer = await resp.arrayBuffer();
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
    const fileName = `sheet-export-xlsx-${stamp}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error(err);
    const clientErr = toClientSheetError(err, 'read');
    return res.status(clientErr.status).json({error: clientErr.error});
  }
});

// Append a row to the sheet. Expects JSON body: {values: [..]}
app.post('/api/sheet/append', async (req, res) => {
  const sheetId = process.env.SHEET_ID;
  if (!sheetId) {
    return res.status(400).json({error: 'Append is only supported in Google Sheets mode. XLSX mode is read-only.'});
  }
  const values = req.body.values;
  if (!Array.isArray(values)) return res.status(400).json({error: 'values must be an array'});
  try {
    const sheets = getSheetsClient();
    const firstTitle = await getDefaultTabTitle(sheets, sheetId);
    const resp = await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${firstTitle}!A1:Z1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [values] }
    });
    return res.json({result: resp.data});
  } catch (err) {
    console.error(err);
    const clientErr = toClientSheetError(err, 'append');
    return res.status(clientErr.status).json({error: clientErr.error});
  }
});

app.get('/_health', (req, res) => res.send('ok'));

app.listen(PORT, () => {
  console.log(`simple-site listening on ${PORT}`);
});
