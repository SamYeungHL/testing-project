// Shared parser used by both server (SSR) and client
export interface SalesRecord {
  itemName: string;
  itemId: string;
  date: string;
  quantity: number;
}

// Convert Excel serial date number to JS Date
function excelSerialToDate(serial: number): Date {
  // Excel epoch is 1900-01-01, but Excel incorrectly treats 1900 as a leap year
  const epoch = new Date(1899, 11, 30);
  return new Date(epoch.getTime() + serial * 86400000);
}

export function findMonthYear(rows: unknown[][]) {
  for (const row of rows) {
    for (const cell of row) {
      // String format: "01/2026" or "1/2026"
      if (typeof cell === "string" && /^\d{1,2}\/\d{4}$/.test(cell.trim())) {
        const [month, year] = cell.trim().split("/").map(Number);
        if (month >= 1 && month <= 12) return { month, year };
      }
      // Excel serial date number (e.g. 46023 = Jan 2026)
      if (typeof cell === "number" && cell > 40000 && cell < 60000) {
        const d = excelSerialToDate(cell);
        if (!isNaN(d.getTime())) {
          return { month: d.getMonth() + 1, year: d.getFullYear() };
        }
      }
    }
  }
  return null;
}

export function findDayHeaderRow(rows: unknown[][]) {
  for (const row of rows) {
    const dayCount = row.slice(5).filter((v) => {
      const n = Number(v);
      return Number.isInteger(n) && n >= 1 && n <= 31;
    }).length;
    if (dayCount >= 5) return row;
  }
  return null;
}

export function parseRecords(values: unknown[][]): SalesRecord[] {
  const monthYear = findMonthYear(values);
  const dayHeader = findDayHeaderRow(values);
  if (!monthYear || !dayHeader) return [];

  const records: SalesRecord[] = [];
  const { month, year } = monthYear;

  for (const row of values) {
    const itemName = String(row[0] ?? "").trim();
    const itemId = String(row[1] ?? "").trim();
    if (!itemName || !itemId) continue;

    const looksLikeItem =
      /\d{8,}/.test(itemId) || String(row[4] ?? "").includes("HK$");
    if (!looksLikeItem) continue;

    for (let col = 5; col < row.length; col++) {
      const qty = Number(row[col]);
      if (!Number.isFinite(qty) || qty <= 0) continue;

      const day = Number(dayHeader[col]);
      if (!Number.isInteger(day) || day < 1 || day > 31) continue;

      const date = new Date(year, month - 1, day);
      if (Number.isNaN(date.getTime())) continue;

      records.push({
        itemName,
        itemId,
        date: date.toISOString().slice(0, 10),
        quantity: qty,
      });
    }
  }

  records.sort(
    (a, b) => a.date.localeCompare(b.date) || a.itemName.localeCompare(b.itemName)
  );
  return records;
}
