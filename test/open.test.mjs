import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ANDROID, IPAD_DESKTOP_SITE, IPHONE, MAC, browserWindow, loadPage, read } from './browser.mjs';

const page = read('open.html');

// The pages Bread opens and refuses (parseOpenLink in 0xMiden/wallet, src/lib/dapp-browser/open-link.ts).
const ACCEPTED = [
  'https://app.example.com/',
  'https://app.example.com/swap?amount=1&to=mtst1abc#review',
  'HTTPS://App.Example.com/Pools',
  'https://app.example.com:8443/'
];
const REFUSED = [
  ['an http page', 'http://app.example.com/'],
  ['a script page', 'javascript:alert(1)'],
  ['a data page', 'data:text/html,hi'],
  ['credentials before the host', 'https://user@app.example.com/'],
  ['a password', 'https://:secret@app.example.com/'],
  ['not a URL', 'not a url'],
  ['an empty page', '']
];

const load = (link, agent, html = page, window = browserWindow(link)) => loadPage(html, link, agent, window);

/** The page's offers that show, in page order, so a failing comparison names the element. */
const offers = dom => ['get', 'open', 'stores', 'continue'].filter(id => !dom.get(id).hidden);

/** The page's heading as it reads, with the host open.js fills in. */
function heading(dom) {
  const headings = [...page.matchAll(/<h1\b[^>]*>(.*?)<\/h1>/g)];
  assert.equal(headings.length, 1, 'open.html has one heading');
  return headings[0][1].replace('<span id="host"></span>', dom.get('host').textContent).replace(/\s+/g, ' ');
}

const OPEN = 'https://bread.miden.xyz/open';
// The link the wallet adapter builds: the page travels in the fragment, which browsers never send to a server.
const breadLink = raw => `${OPEN}#url=${encodeURIComponent(raw)}`;
const tag = '<script src="open.js"></script>';
// Read without running the page, so a page that throws fails each case that loads it rather than the whole file.
const markup = load(OPEN, MAC, page.replace(tag, ''));
const APP_STORE = markup.get('app-store')?.href;
const PLAY_STORE = markup.get('play-store')?.href;

describe('the fallback page', () => {
  for (const raw of ACCEPTED) {
    const target = new URL(raw);

    it(`offers ${raw} on iOS through Bread's scheme`, () => {
      const dom = load(breadLink(raw), IPHONE);

      assert.deepEqual(offers(dom), ['get', 'open', 'continue']);
      assert.equal(heading(dom), `Open ${target.host} in Bread`);
      assert.equal(dom.get('continue').href, target.href);
      assert.equal(dom.get('open').href, `com.miden.wallet://open?url=${encodeURIComponent(target.href)}`);
      assert.equal(dom.get('get').href, APP_STORE);
    });

    it(`offers ${raw} on Android through an intent that falls back to Play`, () => {
      const dom = load(breadLink(raw), ANDROID);

      assert.deepEqual(offers(dom), ['get', 'open', 'continue']);
      assert.equal(dom.get('continue').href, target.href);
      assert.equal(
        dom.get('open').href,
        `intent://open?url=${encodeURIComponent(target.href)}` +
          `#Intent;scheme=com.miden.wallet;package=com.miden.wallet;S.browser_fallback_url=${encodeURIComponent(PLAY_STORE)};end`
      );
      assert.equal(dom.get('get').href, PLAY_STORE);
    });

    it(`offers ${raw} on a desktop next to every store`, () => {
      const dom = load(breadLink(raw), MAC);

      assert.deepEqual(offers(dom), ['stores', 'continue']);
      assert.equal(dom.get('continue').href, target.href);
    });
  }

  for (const [name, raw] of REFUSED) {
    for (const agent of [IPHONE, ANDROID, MAC]) {
      it(`does not offer ${name} on ${agent.name}`, () => {
        const dom = load(breadLink(raw), agent);

        assert.deepEqual(offers(dom), agent === MAC ? ['stores'] : ['get']);
        assert.equal(heading(dom), 'Open in Bread');
      });
    }
  }

  it('offers only the store without a page', () => {
    const dom = load(OPEN, IPHONE);

    assert.deepEqual(offers(dom), ['get']);
    assert.equal(heading(dom), 'Open in Bread');
    assert.equal(dom.get('get').href, APP_STORE);
  });

  it('ignores a page in the query', () => {
    const dom = load(`${OPEN}?url=${encodeURIComponent(ACCEPTED[0])}`, IPHONE);

    assert.deepEqual(offers(dom), ['get']);
    assert.equal(heading(dom), 'Open in Bread');
  });

  it('reloads when only the fragment changes', () => {
    const link = breadLink(ACCEPTED[0]);
    const tab = browserWindow(link);
    load(link, IPHONE, page, tab);

    tab.location.hash = new URL(breadLink(ACCEPTED[3])).hash;
    tab.fire('hashchange');

    assert.equal(tab.location.reloads, 1);
  });

  it(`treats ${IPAD_DESKTOP_SITE.name} as iOS`, () => {
    const dom = load(breadLink(ACCEPTED[0]), IPAD_DESKTOP_SITE);

    assert.deepEqual(offers(dom), ['get', 'open', 'continue']);
    assert.equal(dom.get('open').href, `com.miden.wallet://open?url=${encodeURIComponent(ACCEPTED[0])}`);
    assert.equal(dom.get('get').href, APP_STORE);
  });

  it('links the store listings of Bread', () => {
    assert.equal(APP_STORE, 'https://apps.apple.com/app/id6789341854');
    assert.equal(PLAY_STORE, 'https://play.google.com/store/apps/details?id=com.miden.wallet');
  });
});

describe('open.html', () => {
  const link = breadLink(ACCEPTED[0]);

  it('runs nothing without the script tag', () => {
    assert.deepEqual(offers(load(link, IPHONE, page.replace(tag, ''))), ['stores']);
  });

  it('runs open.js before the elements it reads when the tag is in head', () => {
    const html = page.replace(tag, '').replace('</head>', `${tag}\n</head>`);

    assert.throws(() => load(link, IPHONE, html), { name: 'TypeError' });
  });

  it("runs nothing when the policy blocks the page's own scripts", () => {
    assert.deepEqual(offers(load(link, IPHONE, page.replace("script-src 'self'", "script-src 'none'"))), ['stores']);
  });

  it("lets the hidden attribute win over the buttons' display", () => {
    assert.match(page, /\[hidden\] \{ display: none !important; \}/);
  });
});
