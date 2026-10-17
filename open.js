'use strict';

// Must accept exactly the pages Bread opens (parseOpenLink in 0xMiden/wallet, src/lib/dapp-browser/open-link.ts):
// this page must not offer a link the app refuses. The link carries the page in its fragment, which browsers never
// send to a server.
function readTarget() {
  const raw = new URLSearchParams(window.location.hash.slice(1)).get('url');
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function platform() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

function show(id, href) {
  const element = document.getElementById(id);
  element.href = href;
  element.hidden = false;
}

const appStore = document.getElementById('app-store').href;
const playStore = document.getElementById('play-store').href;
const target = readTarget();
const os = platform();

if (target) {
  document.getElementById('host').textContent = target.host;
  show('continue', target.href);
}

if (os !== 'desktop') {
  document.getElementById('stores').hidden = true;
  show('get', os === 'ios' ? appStore : playStore);
  if (target) {
    const scheme = 'open?url=' + encodeURIComponent(target.href);
    // An intent URL lets Chrome fall back to the Play listing instead of failing when Bread is missing.
    show(
      'open',
      os === 'ios'
        ? 'com.miden.wallet://' + scheme
        : 'intent://' +
            scheme +
            '#Intent;scheme=com.miden.wallet;package=com.miden.wallet;S.browser_fallback_url=' +
            encodeURIComponent(playStore) +
            ';end'
    );
  }
}
