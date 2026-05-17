export function getRoute() {
  const hash = window.location.hash.slice(1) || 'dashboard';
  const [path, query] = hash.split('?');
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  return { path, params };
}

export function navigate(path, params = {}) {
  const query = new URLSearchParams(params).toString();
  window.location.hash = query ? `${path}?${query}` : path;
}

export function isViewerRoute() {
  return window.location.hash.startsWith('#view/');
}

export function getViewerTeamId() {
  // '#view/team_1' → 'team_1'
  return window.location.hash.replace('#view/', '').split('?')[0].trim();
}
