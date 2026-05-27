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
// Retries up to 4 times with exponential backoff on 429 (rate limit) responses.
export async function readSheetPublic(range, _attempt = 0) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?key=${PUBLIC_API_KEY}`;
  const res = await fetch(url);
  if (res.status === 429 && _attempt < 4) {
    // Exponential backoff: 1s, 2s, 4s, 8s
    const delay = 1000 * Math.pow(2, _attempt);
    await new Promise(r => setTimeout(r, delay));
    return readSheetPublic(range, _attempt + 1);
  }
  if (!res.ok) {
    const msg = res.status === 429
      ? 'Too many requests — please wait a moment and refresh.'
      : `Sheets public read failed: ${res.status}`;
    throw new Error(msg);
  }
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
