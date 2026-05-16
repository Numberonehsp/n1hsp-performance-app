import { SHEET_ID, PUBLIC_API_KEY } from './config.js';

// Read all data rows from a named tab.
// Row 1 is treated as headers; rows 2+ become objects keyed by header.
export async function readSheet(tabName) {
  const response = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: tabName,
  });
  const rows = response.result.values || [];
  if (rows.length < 2) return [];
  const [headers, ...dataRows] = rows;
  return dataRows.map(row =>
    Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']))
  );
}

// Read raw row arrays from a range using the public API key — no OAuth required.
// Returns an array of arrays (row 0 is the header row if present).
// Callers are responsible for header extraction and object mapping.
export async function readSheetPublic(range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?key=${PUBLIC_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sheets public read failed: ${res.status}`);
  const data = await res.json();
  return data.values || [];
}

// Append one row to a named tab.
// values: array in the same column order as the tab headers.
export async function appendRow(tabName, values) {
  await gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!A1`,
    valueInputOption: 'USER_ENTERED',
    resource: { values: [values] },
  });
}
