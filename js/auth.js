/**
 * Google Identity Services (GIS) authentication module.
 * Client-side only — stores user profile in localStorage.
 */

const USER_KEY = 'dokiSekai:user';
const listeners = new Set();

export function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setUser(user) {
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_KEY);
  }
  listeners.forEach((fn) => fn(user));
}

export function onAuthChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Decode JWT payload (no verification — display only) */
function decodeJwtPayload(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

/** Called by Google GIS after credential response */
function handleCredentialResponse(response) {
  const payload = decodeJwtPayload(response.credential);
  if (!payload) return;

  const user = {
    id: payload.sub,
    name: payload.name || '',
    email: payload.email || '',
    picture: payload.picture || '',
    loggedInAt: new Date().toISOString(),
  };
  setUser(user);
}

export function logout() {
  setUser(null);
  // Revoke Google session if available
  if (window.google?.accounts?.id) {
    google.accounts.id.disableAutoSelect();
  }
}

/**
 * Initialize Google Sign-In.
 * Requires a meta tag or global GOOGLE_CLIENT_ID.
 */
export function initGoogleAuth() {
  const clientId =
    document.querySelector('meta[name="google-client-id"]')?.content
    || window.GOOGLE_CLIENT_ID
    || '';

  if (!clientId) {
    console.warn('[auth] Google Client ID not configured');
    return;
  }

  // Load GIS script if not already present
  if (!document.getElementById('google-gis-script')) {
    const script = document.createElement('script');
    script.id = 'google-gis-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => setupGIS(clientId);
    document.head.appendChild(script);
  } else if (window.google?.accounts?.id) {
    setupGIS(clientId);
  }
}

function setupGIS(clientId) {
  google.accounts.id.initialize({
    client_id: clientId,
    callback: handleCredentialResponse,
    auto_select: true,
  });
}

/** Render the Google Sign-In button into a container element */
export function renderGoogleButton(container) {
  if (!window.google?.accounts?.id) {
    // GIS not loaded yet — retry after a short delay
    const timer = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(timer);
        google.accounts.id.renderButton(container, {
          type: 'standard',
          shape: 'pill',
          theme: 'filled_black',
          size: 'large',
          text: 'signin_with',
          width: 280,
        });
      }
    }, 200);
    // Stop trying after 10s
    setTimeout(() => clearInterval(timer), 10000);
    return;
  }

  google.accounts.id.renderButton(container, {
    type: 'standard',
    shape: 'pill',
    theme: 'filled_black',
    size: 'large',
    text: 'signin_with',
    width: 280,
  });
}
