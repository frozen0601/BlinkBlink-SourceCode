# Releasing BlinkBlink

Releases are built and published by GitHub Actions. You no longer need a
Windows machine, a Mac and a Linux box on hand — a tag is enough.

## The short version

```bash
npm version patch          # or minor / major — creates the commit and the tag
git push --follow-tags
```

That is the whole process. Or, from the GitHub UI, run the **Bump version and
tag** workflow and pick patch/minor/major; it does the same thing on a runner.

## What happens next

The **Release** workflow picks up the `v*` tag and:

1. Checks the tag matches `package.json`, then creates a **draft** release in
   [`frozen0601/BlinkBlink-Releases`](https://github.com/frozen0601/BlinkBlink-Releases).
   Creating it up front is deliberate — otherwise three build jobs race to
   create the same release.
2. Builds, in parallel:

    | Runner           | Artifacts                                  |
    | ---------------- | ------------------------------------------ |
    | `macos-latest`   | `.dmg` and `.zip`, both **x64 and arm64**  |
    | `windows-latest` | NSIS `.exe`, x64 and arm64                 |
    | `ubuntu-latest`  | `.AppImage`, `.deb`, `.rpm`, `.snap` (x64) |

3. Uploads every artifact into the draft release, along with the `latest*.yml`
   files `electron-updater` needs.
4. Pushes the `.snap` to the Snap Store's stable channel, if credentials are
   configured.
5. **Undrafts** the release. This is the step that makes it public — the
   marketing site reads the newest non-draft release from the GitHub API, so
   the download buttons update on their own from here.

Watch it under the repository's Actions tab. If a build job fails the release
stays a draft, so a half-finished release is never published.

## One-time setup

Add these under **Settings → Secrets and variables → Actions** in
`frozen0601/BlinkBlink-SourceCode`.

### `RELEASES_TOKEN` — required

A fine-grained personal access token. Releases go to a _different_ repository
from the one running the workflow, and the automatic `GITHUB_TOKEN` cannot
reach it.

- Repository access: `frozen0601/BlinkBlink-Releases` **and**
  `frozen0601/BlinkBlink-SourceCode`
- Permissions: **Contents: Read and write**

`BlinkBlink-SourceCode` is on the list because the version-bump workflow pushes
a tag, and a push made with `GITHUB_TOKEN` deliberately does not trigger other
workflows — so the tag would never start a release.

### `SNAPCRAFT_STORE_CREDENTIALS` — optional

```bash
snapcraft export-login --snaps=blinkblink --acls package_access,package_push,package_update,package_release -
```

Paste the output as the secret value. Without it the snap is still built and
attached to the release, it just is not pushed to the store, and the workflow
logs a warning rather than failing.

### macOS signing — optional

| Secret                                                     | What it is                         |
| ---------------------------------------------------------- | ---------------------------------- |
| `MAC_CSC_LINK`                                             | Base64 of your Developer ID `.p12` |
| `MAC_CSC_KEY_PASSWORD`                                     | Its password                       |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | Notarisation                       |

Without these the macOS build is unsigned — exactly what ships today — and the
workflow says so in its log. Two things stay broken while it is unsigned:

- Users must run `xattr -c /Applications/BlinkBlink.app` after installing, as
  the site already instructs.
- macOS will not draw the **Skip this break** button on a system notification.
  The app knows this (`isCodeSigned()` is baked in at build time) and defaults
  to its own reminder toast, which has the button on every platform.

Signing needs the $99/year Apple Developer Program. It is the single biggest
remaining papercut for macOS users; everything else about the release flow
works without it.

## Building locally

You can still build by hand. On Fedora everything except the snap works out of
the box:

```bash
npm run dist:linux     # AppImage, deb, rpm, snap
npm run dist:dir       # unpacked only — fastest way to check a packaging change
```

`npm run dist:mac` and `npm run dist:win` only work on their own platforms
(Windows installers need Wine on Linux, and macOS builds must be made on
macOS). That is precisely what CI is for.

To smoke-test what you built:

```bash
npx electron-builder --dir
BLINKBLINK_PACKAGED_PATH=release/linux-unpacked/blinkblink \
  xvfb-run -a npx playwright test tests/e2e/packaged.spec.ts
```

## Checklist before tagging

`npm run verify` covers the first three; CI runs all of them on the PR.

- [ ] `npm run verify` — typecheck, lint, formatting, unit tests
- [ ] `npm run test:e2e` (or `test:e2e:headless` on a headless box)
- [ ] The version in `package.json` is the one you mean to ship
- [ ] The release notes on the draft read sensibly before it is undrafted

## If something goes wrong

**The release is stuck as a draft.** A build job failed. Fix it, delete the
draft, and re-run the workflow with the same tag — `prepare` reuses an existing
release rather than duplicating it.

**"Tag vX does not match package.json version Y".** The tag was created without
`npm version`. Delete the tag, fix the version, tag again.

**The snap upload fails with an authentication error.** Snap Store credentials
expire. Re-run `snapcraft export-login` and update the secret.

**The site still shows the old version.** It reads the GitHub API on page load
and the response is cached; hard-refresh. If it persists, check the release is
actually undrafted — a draft is invisible to the API for anonymous callers.
