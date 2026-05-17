import { GOOGLE_CLIENT_ID, SCOPES } from './config.js';

let tokenClient = null;
let accessToken = null;
let currentUserEmail = null;

export function getCurrentUserEmail() {
  return currentUserEmail;
}

// Call once on app load.
// onReady: called when gapi + GIS are loaded and sign-in button is ready.
// onSignedIn: called after the user successfully authenticates.
export function initAuth(onReady, onSignedIn) {
  gapi.load('client', async () => {
    await gapi.client.init({});
    await gapi.client.load('https://sheets.googleapis.com/$discovery/rest?version=v4');

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: async (response) => {
        if (response.error) {
          console.error('Auth error:', response.error);
          return;
        }
        accessToken = response.access_token;
        gapi.client.setToken({ access_token: accessToken });

        // Fetch user email from userinfo endpoint
        try {
          const r = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${accessToken}`);
          const info = await r.json();
          currentUserEmail = (info.email || '').toLowerCase().trim();
        } catch (e) {
          console.warn('Could not fetch user email:', e);
          currentUserEmail = null;
        }

        onSignedIn();
      },
    });

    onReady();
  });
}

export function requestSignIn() {
  tokenClient.requestAccessToken({ prompt: '' });
}

export function signOut() {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken, () => {});
    accessToken = null;
  }
  currentUserEmail = null;
  window.location.hash = '';
  window.location.reload();
}

export function isSignedIn() {
  return accessToken !== null;
}
