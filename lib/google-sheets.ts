import { google } from "googleapis";
import * as XLSX from "xlsx";

export function getGoogleAuth(scopes: string[]) {
  const credsEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  return credsEnv && credsEnv.trim().startsWith("{")
    ? new google.auth.GoogleAuth({ credentials: JSON.parse(credsEnv), scopes })
    : new google.auth.GoogleAuth({ scopes });
}

export function getSheetsClient() {
  const auth = getGoogleAuth([
    "https://www.googleapis.com/auth/spreadsheets",
  ]);
  return google.sheets({ version: "v4", auth });
}

export function getDriveClient() {
  const auth = getGoogleAuth([
    "https://www.googleapis.com/auth/drive.readonly",
  ]);
  return google.drive({ version: "v3", auth });
}

export async function getDefaultTabTitle(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string
) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });
  return meta.data?.sheets?.[0]?.properties?.title || "Sheet1";
}

export async function getFileName() {
  const fileId = process.env.XLSX_FILE_ID || process.env.SHEET_ID;
  if (!fileId) return "";
  const drive = getDriveClient();
  const meta = await drive.files.get({ fileId, fields: "name" });
  return meta.data?.name ?? "";
}

async function readXlsxFromDrive(fileId: string) {
  const drive = getDriveClient();
  const resp = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  const workbook = XLSX.read(Buffer.from(resp.data as ArrayBuffer), {
    type: "buffer",
  });
  const sheetName =
    process.env.XLSX_SHEET_NAME || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet tab not found: ${sheetName}`);
  return XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: "",
  });
}

export async function getSheetValues(requestedRange?: string) {
  // XLSX mode: download binary file from Drive and parse with xlsx
  const xlsxFileId = process.env.XLSX_FILE_ID;
  if (xlsxFileId) {
    const values = await readXlsxFromDrive(xlsxFileId);
    return { values, source: "xlsx" as const };
  }

  // Google Sheets mode: use Sheets API
  const sheetId = process.env.SHEET_ID;
  if (!sheetId) throw new Error("SHEET_ID or XLSX_FILE_ID not configured");

  const sheets = getSheetsClient();
  let range = requestedRange;
  if (!range) {
    const firstTitle = await getDefaultTabTitle(sheets, sheetId);
    range = `${firstTitle}!A1:Z1000`;
  }

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
  });
  return { values: resp.data.values || [], source: "google-sheets" as const };
}
