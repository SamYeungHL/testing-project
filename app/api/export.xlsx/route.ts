import { NextResponse } from "next/server";
import { getDriveClient } from "@/lib/google-sheets";

export async function GET() {
  try {
    // XLSX file mode: download the raw binary from Drive
    const xlsxFileId = process.env.XLSX_FILE_ID;
    if (xlsxFileId) {
      const drive = getDriveClient();
      const fileMeta = await drive.files.get({ fileId: xlsxFileId, fields: "name" });
      const rawName = fileMeta.data?.name ?? "sheet-export.xlsx";
      const safeName = rawName.replace(/[\\/:*?"<>|]+/g, "-").trim() || "sheet-export.xlsx";

      const resp = await drive.files.get(
        { fileId: xlsxFileId, alt: "media" },
        { responseType: "arraybuffer" }
      );

      return new Response(Buffer.from(resp.data as ArrayBuffer), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${safeName}"`,
        },
      });
    }

    // Google Sheets mode: export via Drive API to preserve styles
    const sheetId = process.env.SHEET_ID;
    if (!sheetId) {
      return NextResponse.json(
        { error: "No file source configured" },
        { status: 400 }
      );
    }

    const drive = getDriveClient();
    const fileMeta = await drive.files.get({
      fileId: sheetId,
      fields: "name",
    });
    const rawName = fileMeta.data?.name ?? "sheet-export";
    const safeName =
      rawName.replace(/[\\/:*?"<>|]+/g, "-").trim() || "sheet-export";
    const fileName = safeName.toLowerCase().endsWith(".xlsx")
      ? safeName
      : `${safeName}.xlsx`;

    const exported = await drive.files.export(
      {
        fileId: sheetId,
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      { responseType: "arraybuffer" }
    );

    return new Response(Buffer.from(exported.data as ArrayBuffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to export sheet" },
      { status: 500 }
    );
  }
}
