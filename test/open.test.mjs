import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import vm from 'node:vm';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const page = read('open.html');
const script = read('open.js');

const IPHONE = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  5
];
const IPAD_DESKTOP_SITE = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  5
];
const ANDROID = [
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  5
];
const MAC = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  0
];

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

function load(search, [userAgent, maxTouchPoints]) {
  const dom = elements();
  vm.runInNewContext(script, {
    window: { location: { search } },
    document: { getElementById: id => dom.get(id) ?? null },
    navigator: { userAgent, maxTouchPoints },
    URL,
    URLSearchParams
  });
  return dom;
}

const shown = (dom, id) => !dom.get(id).hidden;
const query = raw => `?url=${encodeURIComponent(raw)}`;
const { href: APP_STORE } = elements().get('app-store');
const { href: PLAY_STORE } = elements().get('play-store');

describe('the fallback page', () => {
  for (const raw of ACCEPTED) {
    const target = new URL(raw);

    it(`offers ${raw} on iOS through Bread's scheme`, () => {
      const dom = load(query(raw), IPHONE);

      assert.equal(dom.get('host').textContent, target.host);
      assert.ok(shown(dom, 'title-target') && !shown(dom, 'title-generic'));
      assert.equal(dom.get('continue').href, target.href);
      assert.equal(dom.get('open').href, `com.miden.wallet://open?url=${encodeURIComponent(target.href)}`);
      assert.equal(dom.get('get').href, APP_STORE);
      assert.ok(shown(dom, 'continue') && shown(dom, 'open') && shown(dom, 'get') && !shown(dom, 'stores'));
    });

    it(`offers ${raw} on Android through an intent that falls back to Play`, () => {
      const dom = load(query(raw), ANDROID);

      assert.equal(dom.get('continue').href, target.href);
      assert.equal(
        dom.get('open').href,
        `intent://open?url=${encodeURIComponent(target.href)}` +
          `#Intent;scheme=com.miden.wallet;package=com.miden.wallet;S.browser_fallback_url=${encodeURIComponent(PLAY_STORE)};end`
      );
      assert.equal(dom.get('get').href, PLAY_STORE);
      assert.ok(shown(dom, 'open') && shown(dom, 'get') && !shown(dom, 'stores'));
    });

    it(`offers ${raw} on a desktop next to every store`, () => {
      const dom = load(query(raw), MAC);

      assert.equal(dom.get('continue').href, target.href);
      assert.ok(shown(dom, 'continue') && shown(dom, 'stores') && !shown(dom, 'open') && !shown(dom, 'get'));
    });
  }

  for (const [name, raw] of REFUSED) {
    it(`does not offer ${name}`, () => {
      for (const agent of [IPHONE, ANDROID, MAC]) {
        const dom = load(query(raw), agent);

        assert.ok(!shown(dom, 'continue') && !shown(dom, 'open'));
        assert.ok(shown(dom, 'title-generic') && !shown(dom, 'title-target'));
      }
    });
  }

  it('offers only the store without a page', () => {
    const dom = load('', IPHONE);

    assert.equal(dom.get('get').href, APP_STORE);
    assert.ok(shown(dom, 'get') && !shown(dom, 'open') && !shown(dom, 'continue') && !shown(dom, 'stores'));
  });

  it('treats an iPad asking for the desktop site as iOS', () => {
    const dom = load(query(ACCEPTED[0]), IPAD_DESKTOP_SITE);

    assert.equal(dom.get('open').href, `com.miden.wallet://open?url=${encodeURIComponent(ACCEPTED[0])}`);
    assert.equal(dom.get('get').href, APP_STORE);
  });

  it('links the store listings of Bread', () => {
    assert.equal(APP_STORE, 'https://apps.apple.com/app/id6789341854');
    assert.equal(PLAY_STORE, 'https://play.google.com/store/apps/details?id=com.miden.wallet');
  });
});
