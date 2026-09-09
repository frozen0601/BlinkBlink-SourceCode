# Shipping 0.2.0 — the first release through the new pipeline

Several things change at once here: a new version, more download formats, a new
CI/CD pipeline, and a marketing site that has to understand the new release
shape. The order matters, because each piece assumes the one before it.

Delete this file once 0.2.0 is out.

---

## The one decision to make first

### macOS: two DMGs, or one universal DMG?

This is the only genuinely risky part of the release, and it is worth
understanding before picking.

Existing users are on **0.1.3, whose updater picks a macOS download with
`assets.find(a => a.name.endsWith('.dmg'))`** — first match wins, no
architecture check. That code is already installed on their machines and cannot
be fixed retroactively. So the moment a release contains two DMGs, every
existing Mac user who clicks "Check for updates" gets a coin flip, and an arm64
build on an Intel Mac **does not launch at all**.

|                               | Two DMGs (current config)                        | One universal DMG                   |
| ----------------------------- | ------------------------------------------------ | ----------------------------------- |
| Existing 0.1.3 users updating | Coin flip; Intel users can get a broken download | Always correct                      |
| New users via the site        | Correct (site detects arch)                      | Always correct                      |
| Download size                 | ~120 MB                                          | ~190 MB                             |
| Config change needed          | none                                             | `mac.target` arch → `["universal"]` |

**Recommendation: ship 0.2.0 as a universal DMG.** It removes the only failure
mode that can hand a user a build that will not start, and it costs bandwidth
that GitHub gives away. The new code already handles it: `pickAssetForArch`
falls back to an asset with no architecture marker, and there is a test for
exactly the `BlinkBlink-universal.dmg` case.

Once nobody is left on a pre-0.2.0 updater, switching back to per-architecture
DMGs is safe and saves the size. That is a decision for 0.3.0 or later.

To do it, change `build.mac.target` in `package.json`:

```json
{ "target": "dmg", "arch": ["universal"] }
```

If you would rather keep two DMGs, that is defensible — just say so in the
release notes and expect a few "it says the app is damaged" reports from Intel
Mac users.

---

## Step by step

### 1. Add the `RELEASES_TOKEN` secret — nothing works without it

**This is the only hard blocker, and only you can do it.**

Create a fine-grained personal access token with **Contents: Read and write** on
both `frozen0601/BlinkBlink-Releases` and `frozen0601/BlinkBlink-SourceCode`,
then add it as `RELEASES_TOKEN` under Settings → Secrets and variables →
Actions in `BlinkBlink-SourceCode`.

Both repositories, because the release publishes to one and the version-bump
workflow pushes a tag to the other. A push made with the default `GITHUB_TOKEN`
deliberately does not trigger further workflows, so the tag would never start a
release.

Optional: `SNAPCRAFT_STORE_CREDENTIALS` (`snapcraft export-login`). Without it
the snap is still built and attached to the release; only the store push is
skipped, with a warning rather than a failure.

### 2. Merge the marketing site PR **before** publishing anything

The site reads the newest non-draft release live. Publish first and the old page
serves wrong-architecture downloads for however long the gap lasts.

If you go universal, this is less urgent — but merge it anyway, since it also
fixes the Linux formats, the prerelease banner bug, and the `xattr -c`
instruction.

### 3. Merge the app PR to `main`

Two things only work from the default branch: the **Run workflow** button for
Test build, and the **Bump version and tag** workflow.

### 4. Take one last test build and actually install it

From Actions → Test build → Run workflow, or a commit containing `[test-build]`.
Then, on your Mac:

- Install over your existing 0.1.3 rather than onto a clean machine. This is the
  path every real user takes, and it is the one that exercises the store
  migration.
- Check your settings and streaks survived. `schemaVersion` 2 normalises the old
  file on first launch; a lost streak would be a migration bug worth catching
  now.
- Watch a full cycle: reminder toast → break overlay → summary. Confirm the
  vibrancy backdrop looks right and the countdown bar animates.
- Leave the machine idle past the threshold and confirm the break waits for you.
- Open Settings and confirm nothing is disabled that should not be.

### 5. Cut the release

```bash
npm version minor && git push --follow-tags
```

0.1.3 → 0.2.0. Minor rather than patch: new settings, new packaging formats, a
new reminder mechanism.

Or run **Bump version and tag** from the Actions tab and pick `minor`.

### 6. Watch it, and check the draft before it goes public

The release workflow creates a draft, builds on three runners, uploads, pushes
the snap, then undrafts. If a build fails the release stays a draft, so a
half-finished release never becomes visible.

Between the builds finishing and the undraft, look at the draft's asset list.
Expect a `.dmg` (universal, or one per architecture), a `.exe`, `.AppImage`,
`.deb`, `.rpm`, `.snap`, and the `latest*.yml` files `electron-updater` needs.

### 7. After it is public

- Load the site and download from it on your Mac. It is reading the real
  release now.
- From an installed 0.1.3, use **Check for updates** and confirm it offers 0.2.0
  and downloads something that opens.
- Check the Snap Store listing picked up the new revision.

---

## Known risks, and what was done about them

**Windows upgrades cannot be tested before release.** The NSIS config is
deliberately kept at the settings 0.1.3 shipped with — one-click installer,
per-user, desktop and Start Menu shortcuts. Switching installer type mid-upgrade
is the classic way to end up with two copies installed side by side, and this is
the one platform with no way to check. `appId` is unchanged for the same reason:
NSIS derives its uninstall registry key from it.

The one Windows change that matters is that `setAppUserModelId` now matches
`appId`, so toasts are no longer silently dropped. That needs the Start Menu
shortcut, which the installer creates.

**Old macOS clients.** Covered above; the universal DMG is the mitigation.

**Linux users on the snap** are unaffected — snap upgrades independently, and
the app tells them so rather than pretending to self-update.

**Settings migration** runs on every existing install. It is written to be
tolerant of anything the old version could have written, and clamps values the
timer could not honour, but step 4 is where you would actually notice a problem.

**First snap upload through CI** may need the store credentials to carry the
right ACLs. If it fails, the release still completes — only the store push is
skipped — and the `.snap` is attached to the release for manual upload.

---

## If something goes wrong

**Release stuck as a draft.** A build failed. Fix it, delete the draft, re-run
the workflow with the same tag; `prepare` reuses an existing release rather than
duplicating it.

**Published something broken.** Delete the release and the tag, then re-cut.
Clients only ever see the newest non-draft release, so removing it rolls
everyone back to 0.1.3.

**Site still shows the old version.** It reads the GitHub API on load and the
response is cached; hard-refresh. If it persists, check the release is actually
undrafted — a draft is invisible to anonymous API callers.
