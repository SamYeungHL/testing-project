import { getSheetValues, getFileName } from "@/lib/google-sheets";
import { parseRecords, findMonthYear } from "@/lib/parse-sheet";
import { ActionButtons } from "./action-buttons";

export const dynamic = "force-dynamic";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export default async function HomePage() {
  let records: Awaited<ReturnType<typeof parseRecords>> = [];
  let error = "";
  let fileName = "";
  let monthLabel = "";

  try {
    const [{ values }, name] = await Promise.all([
      getSheetValues(),
      getFileName(),
    ]);
    fileName = name;
    const my = findMonthYear(values as unknown[][]);
    if (my) {
      monthLabel = `${MONTH_NAMES[my.month - 1]} ${my.year}`;
    }
    records = parseRecords(values as unknown[][]);
  } catch (err) {
    console.error(err);
    error = "Failed to load sheet data";
  }

  return (
    <div className="container">
      <header className="page-header">
        <h1>{fileName || "Sales List"}</h1>
        {monthLabel && <div className="month-label">{monthLabel}</div>}
        <div className="subtitle">{records.length} items</div>
      </header>

      <ActionButtons />

      {error ? (
        <div className="empty-state">
          <div className="icon">⚠️</div>
          <p>{error}</p>
        </div>
      ) : records.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📋</div>
          <p>No item records found in this sheet.</p>
        </div>
      ) : (
        <div className="record-list">
          {records.map((r, i) => (
            <div className="record-card" key={i}>
              <div className="record-left">
                <div className="item-name">{r.itemName}</div>
                <div className="record-date">{r.date}</div>
              </div>
              <div className="quantity">{r.quantity}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
