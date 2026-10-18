import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { it } from 'node:test';

const path = file => new URL(`../${file}`, import.meta.url);
const json = file => JSON.parse(readFileSync(path(file), 'utf8'));

// Bread's team and bundle ID (ios/App/App.xcodeproj in 0xMiden/wallet) and its Android applicationId
// (android/app/build.gradle).
const APP_ID = 'LHU7B7J5WL.com.miden.bread';
const PACKAGE = 'com.miden.wallet';
// The certificates in the README's signing table: the upload key, then Google Play's app signing key, without which
// Android verifies no install from Google Play.
const CERTIFICATES = [
  '36:C8:B0:3B:C5:5D:45:19:64:A7:41:D4:36:C7:B4:7F:CC:AA:D9:A2:44:20:E1:DE:05:7A:8F:64:03:61:6D:29',
  '8B:C9:95:6B:54:07:27:1C:3B:97:A2:38:29:5D:A4:72:9E:1A:85:BB:39:1F:D7:D2:8C:74:5E:74:D2:12:B8:2D'
];

it('serves an Apple association file that opens /open and /request in Bread', () => {
  assert.deepEqual(json('.well-known/apple-app-site-association'), {
    applinks: {
      details: [
        {
          appIDs: [APP_ID],
          components: [
            { '/': '/open', comment: "Opens the page named by #url= in Bread's dApp browser" },
            { '/': '/request', comment: 'Answers a Bread Connect request from a native app' }
          ]
        }
      ]
    }
  });
});

it("serves an asset links file naming Bread with both of Bread's signing certificates", () => {
  const statements = json('.well-known/assetlinks.json');
  assert.equal(statements.length, 1);

  const [{ relation, target }] = statements;
  assert.deepEqual(relation, ['delegate_permission/common.handle_all_urls']);
  assert.equal(target.namespace, 'android_app');
  assert.equal(target.package_name, PACKAGE);

  const fingerprints = target.sha256_cert_fingerprints;
  assert.deepEqual(fingerprints, CERTIFICATES);
  for (const fingerprint of fingerprints) assert.match(fingerprint, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
});

it('publishes .well-known', () => {
  // Without .nojekyll, GitHub Pages builds the site with Jekyll, which leaves out dot directories.
  assert.ok(existsSync(path('.nojekyll')));
});
