export type ExcelCell = string | number | null;

export interface ExcelSheet {
  name: string;
  rows: ExcelCell[][];
  /** Column widths, in characters */
  cols: number[];
}

type XLSXModule = typeof import("xlsx");

export async function exportToExcel(
  data: Record<string, unknown>[],
  filename: string,
  sheetName = "Sheet1"
) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/** Separate from the download so it can be tested; null cells are left empty */
export function sheetsToWorkbook(XLSX: XLSXModule, sheets: ExcelSheet[]) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    ws["!cols"] = sheet.cols.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  return wb;
}

/** Several sheets in one file, each laid out row by row */
export async function exportSheetsToExcel(sheets: ExcelSheet[], filename: string) {
  const XLSX = await import("xlsx");
  XLSX.writeFile(sheetsToWorkbook(XLSX, sheets), `${filename}.xlsx`);
}
