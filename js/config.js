// Replace GOOGLE_CLIENT_ID and SHEET_ID with your values from Task 1
export const GOOGLE_CLIENT_ID = '916433882107-hat21936crrnkhgdrmabv1kmlf0a7cbv.apps.googleusercontent.com';
export const SHEET_ID = '1j_E4xAEBmx8TpumZYTI76PLhQ9E_htud-yCbMqUw9kM';
export const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email';
export const ADMINS_TAB = 'admins';
export const PUBLIC_API_KEY = 'AIzaSyCvJ3P7gVeoayPpMUd7Vj3Tjh87h5T5NoQ';

// Metrics present for all team types
export const METRICS_ALL = ['height', 'weight', 'cmj', 'sprint_20m', 'mas'];

// Metrics present for Senior teams only
export const METRICS_SENIOR = ['body_fat_pct', 'body_fat_mass', 'skeletal_muscle_mass'];

// Full metric metadata used by reports and entry form
export const METRIC_CONFIG = {
  height:               { label: 'Height',               unit: 'cm', higherIsBetter: true,  type: 'number' },
  weight:               { label: 'Weight',               unit: 'kg', higherIsBetter: false, type: 'number' },
  cmj:                  { label: 'CMJ',                  unit: 'cm', higherIsBetter: true,  type: 'number' },
  sprint_20m:           { label: '20m Sprint',           unit: 's',  higherIsBetter: false, type: 'number' },
  mas:                  { label: 'MAS Run (1200m)',       unit: '',   higherIsBetter: false, type: 'time'   },
  body_fat_pct:         { label: 'Body Fat %',           unit: '%',  higherIsBetter: false, type: 'number' },
  body_fat_mass:        { label: 'Body Fat Mass',        unit: 'kg', higherIsBetter: false, type: 'number' },
  skeletal_muscle_mass: { label: 'Skeletal Muscle Mass', unit: 'kg', higherIsBetter: true,  type: 'number' },
};
