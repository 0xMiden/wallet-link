import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

export const IPHONE = {
  name: 'an iPhone',
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  maxTouchPoints: 5
};
export const IPAD_DESKTOP_SITE = {
  name: 'an iPad asking for the desktop site',
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  maxTouchPoints: 5
};
export const ANDROID = {
  name: 'an Android phone',
  userAgent:
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  maxTouchPoints: 5
};
export const MAC = {
  name: 'a Mac',
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  maxTouchPoints: 0
};

/** A window at `link` that keeps the listeners the page adds, so a case can fire them, and counts its reloads. */
export function browserWindow(link) {
  const { search, hash } = new URL(link);
  const listeners = [];
  return {
    location: {
      search,
      hash,
      reloads: 0,
      reload() {
        this.reloads += 1;
      }
    },
    addEventListener: (type, listener) => listeners.push({ type, listener }),
    fire: type => listeners.filter(entry => entry.type === type).forEach(({ listener }) => listener())
  };
}

/**
 * Loads `html` as a browser opening `link` would: an element exists once the parser reaches it, and a script tag runs
 * the file it names right there, if the page's policy lets the page run its own scripts. Returns the elements that
 * have an id, with their `hidden`, `href` and `textContent`; a case that acts on the page after load passes its own
 * `window`. A page that reloads while it loads would reload forever, so that fails every case.
 */
export function loadPage(html, link, { userAgent, maxTouchPoints }, window = browserWindow(link)) {
  const dom = new Map();
  const context = vm.createContext({
    window,
    document: { getElementById: id => dom.get(id) ?? null },
    navigator: { userAgent, maxTouchPoints },
    URL,
    URLSearchParams
  });
  const policy = /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1];
  const runsOwnScripts = policy === undefined || /script-src [^;]*'self'/.test(policy);
  for (const [, name, attributes] of html.matchAll(/<([a-z0-9]+)\b([^>]*)>/g)) {
    const attribute = key => new RegExp(`\\s${key}="([^"]*)"`).exec(attributes)?.[1];
    const id = attribute('id');
    if (id) dom.set(id, { hidden: /\shidden(\s|=|$)/.test(attributes), href: attribute('href'), textContent: '' });
    if (name === 'script' && attribute('src') && runsOwnScripts) vm.runInContext(read(attribute('src')), context);
  }
  assert.equal(window.location.reloads, 0, 'the page reloads while it loads');
  return dom;
}
