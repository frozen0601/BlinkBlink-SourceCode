<p align="center">
  <img src="assets/icon.png" alt="BlinkBlink Logo" width="128" height="128">
</p>

# [BlinkBlink](https://blinkblinkapp.github.io/)

> **Healthy Eyes, Happy Life**

**BlinkBlink** is a lightweight, cross-platform desktop application designed to help you maintain eye health and productivity by preventing digital eye strain. It implements the **20-20-20 rule**: every 20 minutes, take a 20-second break and focus on something 20 feet away.

![Tray Screenshot](assets/screenshots/tray_light_mac.png)

## ✨ Features

- **20-20-20 rule enforcement** — a full-screen break overlay on every monitor, or a gentle reminder toast beforehand.
- **Fully customisable** — work duration, break duration, reminder lead time and notification sounds.
- **Smart schedule** — per-day working hours, including overnight shifts, so BlinkBlink only interrupts you when you are actually working.
- **Streak tracking** — current and best break streaks.
- **Cross-platform** — Windows, macOS and Linux, with each platform's native window effects where they exist.
- **System tray integration** — stays out of your way until you need it.
- **Private by design** — no accounts, no telemetry, no network traffic beyond the update check.

## 🚀 Installation

Download from [the website](https://blinkblinkapp.github.io/#download), or straight from
[Releases](https://github.com/frozen0601/BlinkBlink-Releases/releases).

| Platform | Package                                                   |
| -------- | --------------------------------------------------------- |
| Windows  | `.exe` installer (x64, ARM64)                             |
| macOS    | `.dmg` (Intel and Apple Silicon)                          |
| Linux    | `.AppImage`, `.deb`, `.rpm`, or `snap install blinkblink` |

macOS builds are currently unsigned, so after dragging the app to Applications:

```bash
xattr -c /Applications/BlinkBlink.app
```

## 🛠️ Development

Requires [Node.js](https://nodejs.org/) 20 or newer.

```bash
git clone https://github.com/frozen0601/BlinkBlink-SourceCode.git
cd BlinkBlink-SourceCode
npm install
npm start
```

### Scripts

| Command                     | What it does                                             |
| --------------------------- | -------------------------------------------------------- |
| `npm start`                 | Build and run in development                             |
| `npm run verify`            | Typecheck, lint, format check and unit tests             |
| `npm test`                  | Unit tests                                               |
| `npm run test:e2e`          | Playwright tests driving the real app                    |
| `npm run test:e2e:headless` | The same, under Xvfb                                     |
| `npm run dist:linux`        | Build AppImage, deb, rpm and snap                        |
| `npm run dist:dir`          | Unpacked build — fastest way to check a packaging change |

`npm run dist:mac` and `npm run dist:win` only work on their own platforms.
That is what CI is for — see below.

### Command-line flags

A second launch is handed to the running instance, so these work as a remote
control and are worth binding to desktop shortcuts:

```bash
blinkblink --take-break    # start a break now
blinkblink --settings      # open settings
blinkblink --stats         # open statistics
```

### Releasing

```bash
npm version patch && git push --follow-tags
```

GitHub Actions builds for all three platforms, publishes the installers to
[BlinkBlink-Releases](https://github.com/frozen0601/BlinkBlink-Releases), pushes
the snap to the Snap Store, and undrafts the release — at which point the
marketing site picks it up on its own. See [`docs/RELEASING.md`](docs/RELEASING.md)
for the required secrets and what to do when something fails.

### Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how it fits together, and the platform behaviour worth knowing before you change a window option
- [`docs/RELEASING.md`](docs/RELEASING.md) — the release pipeline
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — what is next, and an assessment of moving off Electron

## 🏗️ Tech stack

- **[Electron](https://www.electronjs.org/)** — cross-platform desktop shell
- **[TypeScript](https://www.typescriptlang.org/)** — strict mode throughout
- **[Webpack](https://webpack.js.org/)** — bundling for main, preload and each renderer
- **[Vitest](https://vitest.dev/)** and **[Playwright](https://playwright.dev/)** — unit and end-to-end tests
- **[electron-store](https://github.com/sindresorhus/electron-store)** — persistence

## 📄 License

**Source Available.** You are free to view, audit, and compile the code for
personal use. Redistribution and commercial use are prohibited without
permission. See [`LICENSE`](LICENSE).

## 👨‍💻 Author

**Wei-Cheng Huang** · [@frozen0601](https://github.com/frozen0601) · andywh1996@gmail.com

---

_Made with ❤️ for healthy eyes._
