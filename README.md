# wallet-link

The link host for Bread, the Miden mobile wallet. Served at `https://bread.miden.xyz`, it holds the files that let a link `https://bread.miden.xyz/open#url=<page>` open the page in Bread's dApp browser. The page travels in the link's fragment, which browsers never send to a server. Bread opens only https pages without credentials in the URL, and asks before opening a site it does not list.

Native apps reach Bread through Bread Connect links, `https://bread.miden.xyz/request#v=1&m=<message>`, whose sealed message also travels in the fragment. The protocol is specified in `packages/bread-connect/PROTOCOL.md` in [0xMiden/wallet](https://github.com/0xMiden/wallet).

| File | Read by | Must match, in [0xMiden/wallet](https://github.com/0xMiden/wallet) |
| --- | --- | --- |
| `.well-known/apple-app-site-association` | iOS, through Apple's CDN, so `/open` and `/request` links open Bread | the app ID `LHU7B7J5WL.com.miden.bread`: the team and bundle ID in `ios/App/App.xcodeproj` |
| `.well-known/assetlinks.json` | Android, to verify that Bread may open `/open` and `/request` links | the package `com.miden.wallet` (`applicationId` in `android/app/build.gradle`) and every certificate that signs a build users install |
| `open.html`, `open.js` | browsers, when Bread is not installed | the pages Bread opens (`parseOpenLink` in `src/lib/dapp-browser/open-link.ts`) and its URL scheme `com.miden.wallet` |
| `request.html`, `request.js` | browsers, when a request link does not open Bread | the request link's scheme form `com.miden.wallet://request#…` (`canonicalRequestLink` in `src/lib/bread-connect/capture.ts`) |

`.nojekyll` stops GitHub Pages from building the site with Jekyll, which would leave out `.well-known`.

## Signing certificates

`assetlinks.json` lists the SHA-256 fingerprint of each certificate Android should accept:

| SHA-256 | Certificate |
| --- | --- |
| `36:C8:B0:3B:C5:5D:45:19:64:A7:41:D4:36:C7:B4:7F:CC:AA:D9:A2:44:20:E1:DE:05:7A:8F:64:03:61:6D:29` | upload key, which signs release builds before they go to Google Play, so it covers a release build installed directly |

Google Play re-signs what it delivers with the app signing key, so links open Bread from Play installs only once that key's SHA-256, shown on the App integrity page of Play Console, is listed too.

## Hosting

GitHub Pages serves the root of `main`. `bread.miden.xyz` is a CNAME record for `0xmiden.github.io`, and the custom domain is set in this repository's Pages settings.

To check a deployment:

- `curl -sI https://bread.miden.xyz/.well-known/apple-app-site-association` answers 200 without a redirect, as do `/.well-known/assetlinks.json`, `/open` and `/request`.
- Apple's CDN copy, which iOS reads: `https://app-site-association.cdn-apple.com/a/v1/bread.miden.xyz`
- Google's check of the Android statement: `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://bread.miden.xyz&relation=delegate_permission/common.handle_all_urls`

## Tests

`node --test` (Node 22, no dependencies) checks both association files and loads `open.html` and `request.html` as a browser does, running each page's script where its tag sits, on iOS, Android and desktop: `open.html` for each page Bread opens or refuses, `request.html` for request links with and without a message.
