import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import vm from 'node:vm';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const page = read('open.html');
const script = read('open.js');

const IPHONE = {
  name: 'an iPhone',
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  maxTouchPoints: 5
};
const IPAD_DESKTOP_SITE = {
  name: 'an iPad asking for the desktop site',
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  maxTouchPoints: 5
};
const ANDROID = {
  name: 'an Android phone',
  userAgent:
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  maxTouchPoints: 5
};
const MAC = {
  name: 'a Mac',
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  maxTouchPoints: 0
};

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

/** Every element of open.html that has an id, with its `hidden` and `href` as the markup sets them. */
function elements() {
  const found = new Map();
  for (const [, attributes] of page.matchAll(/<[a-z0-9]+\s([^>]*\bid="[^"]+"[^>]*)>/g)) {
    const id = /\bid="([^"]+)"/.exec(attributes)[1];
    const href = /\bhref="([^"]+)"/.exec(attributes)?.[1];
    found.set(id, { hidden: /(^|\s)hidden(\s|=|$)/.test(attributes), href, textContent: '' });
  }
  return found;
}

/** Runs open.js on open.html as a browser opening `link` would. */
function load(link, { userAgent, maxTouchPoints }) {
  const { search, hash } = new URL(link);
  const dom = elements();
  vm.runInNewContext(script, {
    window: { location: { search, hash } },
    document: { getElementById: id => dom.get(id) ?? null },
    navigator: { userAgent, maxTouchPoints },
    URL,
    URLSearchParams
  });
  return dom;
}

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
const { href: APP_STORE } = elements().get('app-store');
const { href: PLAY_STORE } = elements().get('play-store');

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
  const tag = '<script src="open.js"></script>';
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
