'use strict';

// Bread reads the request from the link's fragment, which browsers never send to a server, and takes the same fragment
// under its scheme, com.miden.wallet://request (canonicalRequestLink in 0xMiden/wallet, src/lib/bread-connect/capture.ts).
// Bread checks the request itself, so this page only passes on a fragment that names a version and a message.
function readRequest() {
  const fragment = window.location.hash;
  const params = new URLSearchParams(fragment.slice(1));
  return params.get('v') && params.get('m') ? fragment : null;
}

function platform() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  // Chrome on a large Android tablet asks for the desktop site, whose user agent names Linux, not Android. A
  // touchscreen Linux computer matches too, and cannot run Bread either way.
  if (/Android/.test(ua) || (/Linux/.test(ua) && navigator.maxTouchPoints > 1)) return 'android';
  return 'desktop';
}

function show(id, href) {
  const element = document.getElementById(id);
  element.href = href;
  element.hidden = false;
}

const appStore = document.getElementById('app-store').href;
const playStore = document.getElementById('play-store').href;
const request = readRequest();
const os = platform();

if (os !== 'desktop') {
  document.getElementById('stores').hidden = true;
  show('get', os === 'ios' ? appStore : playStore);
  // Any iOS app can register Bread's scheme, so only Android's intent, naming Bread's package, carries the request.
  // Android reads an intent URL's parameters after its last '#', so the request's own fragment stays in the data.
  if (request && os === 'android') {
    show(
      'open',
      'intent://request' +
        request +
        '#Intent;scheme=com.miden.wallet;package=com.miden.wallet;S.browser_fallback_url=' +
        encodeURIComponent(playStore) +
        ';end'
    );
  }
}

// Changing only the fragment does not load the page again, so the page reloads to follow it.
window.addEventListener('hashchange', () => window.location.reload());
