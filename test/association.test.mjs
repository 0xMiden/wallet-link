import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { it } from 'node:test';

const path = file => new URL(`../${file}`, import.meta.url);
const json = file => JSON.parse(readFileSync(path(file), 'utf8'));

// Bread's team and bundle ID (ios/App/App.xcodeproj in 0xMiden/wallet) and its Android applicationId
// (android/app/build.gradle).
const APP_ID = 'LHU7B7J5WL.com.miden.bread';
const PACKAGE = 'com.miden.wallet';

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

it('serves an asset links file naming Bread with well-formed certificate fingerprints', () => {
  const statements = json('.well-known/assetlinks.json');
  assert.equal(statements.length, 1);

  const [{ relation, target }] = statements;
  assert.deepEqual(relation, ['delegate_permission/common.handle_all_urls']);
  assert.equal(target.namespace, 'android_app');
  assert.equal(target.package_name, PACKAGE);

  const fingerprints = target.sha256_cert_fingerprints;
  assert.ok(fingerprints.length > 0);
  assert.equal(new Set(fingerprints).size, fingerprints.length);
  for (const fingerprint of fingerprints) assert.match(fingerprint, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
});

it('publishes .well-known', () => {
  // Without .nojekyll, GitHub Pages builds the site with Jekyll, which leaves out dot directories.
  assert.ok(existsSync(path('.nojekyll')));
});
