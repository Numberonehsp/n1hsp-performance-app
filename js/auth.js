import { GOOGLE_CLIENT_ID, SCOPES } from './config.js';

let tokenClient = null;
let accessToken = null;

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
      callback: (response) => {
        if (response.error) {
          console.error('Auth error:', response.error);
          return;
        }
        accessToken = response.access_token;
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
  window.location.hash = '';
  window.location.reload();
}

export function isSignedIn() {
  return accessToken !== null;
}
