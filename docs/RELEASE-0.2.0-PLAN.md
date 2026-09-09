# Shipping 0.2.0 — the first release through the new pipeline

Several things land at once: a new version, more download formats, a new CI/CD
pipeline, and a marketing site that has to understand the new release shape.
Order matters, because each piece assumes the one before it.

The last **published** release is **0.1.2**. `package.json` said 0.1.3, but that
version was never released, so 0.1.2 is what every existing user is running.

Delete this file once 0.2.0 is out.

---

## Progress

- [x] **App pull request merged into `main`** — [#1](https://github.com/frozen0601/BlinkBlink-SourceCode/pull/1),
      plus [#6](https://github.com/frozen0601/BlinkBlink-SourceCode/pull/6) for a
      lockfile that made every `npm ci` fail.
- [x] **`RELEASES_TOKEN` secret** — set up.
- [x] **The universal macOS build proven** — electron-builder pulled both the
      x64 and arm64 Electron binaries and merged them into
      `BlinkBlink-<version>-universal.dmg`. This config had never been run
      before; it is no longer taken on trust.
- [ ] **Marketing site pull request** — written and verified, but the push is
      blocked: the Claude GitHub App's installation on the `BlinkBlinkApp`
      organisation is read-only. Apply the patch from a clone on your own
      machine. See [`marketing-site-followup.md`](marketing-site-followup.md).
      Not release-blocking — see step 1.
- [ ] **Review a test build**, then cut the release.

## What only you can do

Two links, about two minutes. Everything else is automated.

### A. Create the token

GitHub does not let anything but you mint a credential for your account, so
this one step is unavoidable.

**Click:** https://github.com/settings/tokens/new?scopes=repo&description=BlinkBlink%20release%20automation

That link pre-fills a classic token named "BlinkBlink release automation" with
the `repo` scope, which is what the release needs.

1. Set **Expiration** to whatever you are comfortable with — "No expiration" is
   simplest; 1 year means redoing this once a year.
2. Scroll down, click **Generate token**.
3. Copy the token. It is shown once.

The scope has to be `repo` rather than something narrower because the release
publishes to `BlinkBlink-Releases` — a _different_ repository from this one, so
the built-in `GITHUB_TOKEN` cannot reach it — and the version-bump workflow
pushes a tag back here. A push made with `GITHUB_TOKEN` deliberately does not
trigger further workflows, so a tag pushed with it would never start a release.

<details>
<summary>If you would rather use a fine-grained token</summary>

Go to https://github.com/settings/personal-access-tokens/new, then:

- **Repository access** → Only select repositories → pick
  `frozen0601/BlinkBlink-Releases` **and** `frozen0601/BlinkBlink-SourceCode`
- **Permissions** → Repository permissions → **Contents: Read and write**

Both repositories, because the release publishes to one and the version-bump
workflow pushes a tag to the other. A push made with GitHub's built-in token
deliberately does not trigger further workflows, so the tag would never start a
release.

</details>

### B. Save it as a secret

**Click:** https://github.com/frozen0601/BlinkBlink-SourceCode/settings/secrets/actions/new

1. **Name:** `RELEASES_TOKEN` — exactly this, it is case sensitive.
2. **Secret:** paste the token.
3. **Add secret**.

That is the whole setup. Nothing else is required to cut a release.

### Optional: the Snap Store

Only if you want the snap pushed automatically. On your Fedora machine:

```bash
snapcraft export-login --snaps=blinkblink \
  --acls package_access,package_push,package_update,package_release -
```

Paste the output as a second secret named `SNAPCRAFT_STORE_CREDENTIALS`.

Skip it and nothing breaks: the `.snap` is still built and attached to the
release, the workflow logs a warning instead of failing, and you can upload it
by hand as before.

---

## Then, in order

### 1. Merge the marketing site PR

The site reads the newest published release live, so it should understand the
new release shape before one exists. It fixes the Linux download options, a bug
where a prerelease could be shown as the current version, and the `xattr -c`
instruction.

Not release-blocking on its own: 0.2.0 ships a single universal DMG, so nobody
can be handed a build for the wrong processor even with the old page. Worth
landing first anyway.

### 2. Merge the app PR into `main` — done

Two things only work from the default branch: the **Run workflow** button for
Test build, and the **Bump version and tag** workflow. Both are available now.

### 3. Take a final test build and install it over your current app

Actions → **Test build** → **Run workflow**. When it finishes, download the
macOS artifact from the run summary.

(`[test-build]` anywhere in a commit message on `main` or a `claude/**` branch
starts the same build, which is how one gets run without the button.)

Install it **over your existing 0.1.2**, not onto a clean machine — that is the
path every real user takes, and the one that exercises the settings migration.
Then check:

- Your settings and streaks survived. The store migrates on first launch; a
  lost streak would be a migration bug worth catching now.
- A full cycle: reminder → break overlay → summary. The blur should look right
  and the progress bar along the bottom of the break screen should animate.
- **The reminder now arrives as a system notification by default.** On an
  unsigned build macOS will not draw its "Skip this break" button — that is
  expected and documented. If no notification appears at all, check Focus / Do
  Not Disturb and notification permission for BlinkBlink; suppression is
  undetectable from inside the app, and Settings → Reminder style → _BlinkBlink
  toast_ is the fallback.
- Switch to the toast once to check its new **×** button: closing it should
  hide the reminder without cancelling the break behind it.
- The break screen should show only "Take A Break", the eyes, and Skip — no
  subtitle, no counting seconds.
- Leave the machine idle past five minutes and confirm the break waits for you
  rather than firing at an empty chair.
- Settings opens and nothing is disabled that should not be.

### 4. Cut the release

```bash
npm version minor && git push --follow-tags
```

0.1.3 → 0.2.0. Minor rather than patch: new settings, new packaging formats, a
new reminder mechanism. (The version in `package.json` is already 0.1.3 even
though 0.1.3 was never published, so this produces 0.2.0 either way.)

Or run **Bump version and tag** from the Actions tab and pick `minor`, which
does the same thing on a runner.

### 5. Watch it, and look at the draft before it goes public

The workflow creates a draft release, builds on three runners, uploads, pushes
the snap, then undrafts. If any build fails the release stays a draft, so a
half-finished release never becomes visible.

Before it undrafts, the asset list should hold: one `.dmg` and one `.zip` (both
universal), one `.exe`, an `.AppImage`, `.deb`, `.rpm`, `.snap`, and the
`latest*.yml` files `electron-updater` reads. The `.zip` is not a download
option on the site; `electron-updater` needs it.

### 6. Afterwards

- Download from the site on your Mac. It is reading the real release now.
- From an installed 0.1.2, use **Check for updates** and confirm it offers
  0.2.0 and downloads something that opens.
- Check the Snap Store listing picked up the new revision.

---

## Decisions already made for you, and why

### macOS ships one universal DMG, not one per architecture

This was the only part of the release that could hand someone a build that does
not start.

Users on 0.1.2 run an updater that picks a macOS download with
`assets.find(a => a.name.endsWith('.dmg'))` — first match wins, no architecture
check. That code is already on their machines and cannot be fixed
retroactively. With two DMGs in a release, every existing Mac user who clicks
**Check for updates** gets a coin flip, and an arm64 build on an Intel Mac does
not launch at all.

A single universal DMG cannot be picked wrongly, by old clients or new ones.
The cost is size: roughly 190 MB instead of 120 MB, on bandwidth GitHub gives
away.

Reverting to per-architecture builds is a one-line change in `package.json`
once nobody is left on a pre-0.2.0 updater. `pickAssetForArch` already handles
both shapes, and there is a test for the universal case.

### Windows keeps the installer 0.1.2 shipped with

One-click, per-user, desktop and Start Menu shortcuts — exactly as before.
Switching installer type mid-upgrade is the classic way to end up with two
copies installed side by side, and Windows is the one platform neither of us
can test. `appId` is unchanged for the same reason: NSIS derives its uninstall
registry key from it.

The one Windows change that matters is that `setAppUserModelId` now matches
`appId`, so toasts are no longer silently dropped. That needs the Start Menu
shortcut, which the installer creates.

### Windows ships x64 only

`electron-updater` reads a single `latest.yml` with no per-architecture entry
and picks by file extension alone, so publishing an ARM64 installer alongside
would hand it to x64 machines on auto-update. Windows on ARM runs the x64 build
under emulation, so nothing is lost.

---

## Other risks, and what was done about them

**Settings migration** runs on every existing install. It is written to tolerate
anything the old version could have written and clamps values the timer could
not honour — but step 3 is where you would actually notice a problem.

**Linux snap users** are unaffected: snap upgrades on its own, and the app now
says so rather than pretending to self-update.

**The first snap upload through CI** may need the store credentials to carry the
right ACLs. If it fails the release still completes; only the store push is
skipped, and the `.snap` is attached to the release for manual upload.

---

## If something goes wrong

**"Tag v0.2.0 does not match package.json version".** The tag was made without
`npm version`. Delete the tag, fix the version, tag again.

**Release stuck as a draft.** A build failed. Fix it, delete the draft, and
re-run the workflow with the same tag — it reuses an existing release rather
than creating a duplicate.

**Published something broken.** Delete the release and the tag. Clients only
ever see the newest published release, so removing it rolls everyone back to
0.1.2.

**Site still shows the old version.** It reads the GitHub API on load and the
response is cached; hard-refresh. If it persists, check the release actually
undrafted — a draft is invisible to anonymous API callers.

**Workflow fails with a 403 or "not found" on the releases repo.** The token is
missing, misnamed, or lacks access to `BlinkBlink-Releases`. The secret must be
named exactly `RELEASES_TOKEN`.
