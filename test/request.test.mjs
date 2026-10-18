import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ANDROID, IPAD_DESKTOP_SITE, IPHONE, MAC, browserWindow, loadPage, read } from './browser.mjs';

const page = read('request.html');
const load = (link, agent, html = page, window = browserWindow(link)) => loadPage(html, link, agent, window);

const REQUEST = 'https://bread.miden.xyz/request';
// A request link as the Bread Connect clients write it: the message travels in the fragment.
const FRAGMENT = '#v=1&m=eyJ0eXBlIjoiY29ubmVjdCJ9';
const LINK = REQUEST + FRAGMENT;
const tag = '<script src="request.js"></script>';
// Read without running the page, so a page that throws fails each case that loads it rather than the whole file.
const markup = load(REQUEST, MAC, page.replace(tag, ''));
const APP_STORE = markup.get('app-store')?.href;
const PLAY_STORE = markup.get('play-store')?.href;

/** The page's offers that show, in page order, so a failing comparison names the element. */
const offers = dom => ['get', 'open', 'stores'].filter(id => !dom.get(id).hidden);

/** The link Android hands Bread for an intent URL: Intent.parseUri reads the parameters after the last '#'. */
function intentData(url) {
  const last = url.lastIndexOf('#');
  assert.ok(url.startsWith('#Intent;', last), 'the intent parameters follow the last #');
  const scheme = /;scheme=([^;]+);/.exec(url.slice(last))?.[1];
  return `${scheme}:${url.slice('intent:'.length, last)}`;
}

describe('the request page', () => {
  it("hands the request to Bread's scheme on iOS", () => {
    const dom = load(LINK, IPHONE);

    assert.deepEqual(offers(dom), ['get', 'open']);
    assert.equal(dom.get('open').href, `com.miden.wallet://request${FRAGMENT}`);
    assert.equal(dom.get('get').href, APP_STORE);
  });

  it('hands the request to Bread on Android through an intent that falls back to Play', () => {
    const dom = load(LINK, ANDROID);

    assert.deepEqual(offers(dom), ['get', 'open']);
    assert.equal(
      dom.get('open').href,
      `intent://request${FRAGMENT}` +
        `#Intent;scheme=com.miden.wallet;package=com.miden.wallet;S.browser_fallback_url=${encodeURIComponent(PLAY_STORE)};end`
    );
    assert.equal(intentData(dom.get('open').href), `com.miden.wallet://request${FRAGMENT}`);
    assert.equal(dom.get('get').href, PLAY_STORE);
  });

  it('lists the phone apps on a desktop', () => {
    assert.deepEqual(offers(load(LINK, MAC)), ['stores']);
  });

  for (const [name, fragment] of [
    ['no fragment', ''],
    ['no message', '#v=1'],
    ['no version', '#m=eyJ9'],
    ['an empty message', '#v=1&m=']
  ]) {
    for (const agent of [IPHONE, ANDROID]) {
      it(`offers only the store for ${name} on ${agent.name}`, () => {
        assert.deepEqual(offers(load(REQUEST + fragment, agent)), ['get']);
      });
    }
  }

  it('ignores a request in the query', () => {
    assert.deepEqual(offers(load(`${REQUEST}?${FRAGMENT.slice(1)}`, IPHONE)), ['get']);
  });

  it('reloads when only the fragment changes', () => {
    const tab = browserWindow(LINK);
    load(LINK, IPHONE, page, tab);

    tab.location.hash = '#v=1&m=eyJ0eXBlIjoicmVxdWVzdCJ9';
    tab.fire('hashchange');

    assert.equal(tab.location.reloads, 1);
  });

  it(`treats ${IPAD_DESKTOP_SITE.name} as iOS`, () => {
    const dom = load(LINK, IPAD_DESKTOP_SITE);

    assert.deepEqual(offers(dom), ['get', 'open']);
    assert.equal(dom.get('open').href, `com.miden.wallet://request${FRAGMENT}`);
  });

  it('links the store listings of Bread', () => {
    assert.equal(APP_STORE, 'https://apps.apple.com/app/id6789341854');
    assert.equal(PLAY_STORE, 'https://play.google.com/store/apps/details?id=com.miden.wallet');
  });
});

describe('request.html', () => {
  it('runs nothing without the script tag', () => {
    assert.deepEqual(offers(load(LINK, IPHONE, page.replace(tag, ''))), ['stores']);
  });

  it("runs nothing when the policy blocks the page's own scripts", () => {
    assert.deepEqual(offers(load(LINK, IPHONE, page.replace("script-src 'self'", "script-src 'none'"))), ['stores']);
  });

  it("lets the hidden attribute win over the buttons' display", () => {
    assert.match(page, /\[hidden\] \{ display: none !important; \}/);
  });
});
