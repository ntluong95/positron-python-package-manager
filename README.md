<!-- Improved README for the Positron Python Package Manager extension -->

# Positron Python Package Manager (PyPkgMan)

Manage Python packages directly inside Positron / VS Code. PyPkgMan provides a tidy sidebar to view installed and loaded packages, quick actions to install/uninstall packages, integration with `pyproject.toml` and `requirements.txt`, and utilities to manage virtual environments through `uv`.

![screenshot](resources/screenshot.png)

## Overview

PyPkgMan aims to bring an RStudio-like package management experience to Positron and VS Code. Use the sidebar to inspect packages, run installs/uninstalls, check for outdated packages, and bootstrap environments from requirement files.

## Main features

- Sidebar view for Python packages (installed / loaded)
- Install / Uninstall packages from the view
- Search packages (fuzzy search)
- Quick-fix to install missing imports (Code Action)
- CodeLens and hover information for `pip-requirements` and `pyproject.toml`
- Integration with `uv` commands to create/manage environments and sync dependencies
- Optional decorations that show package version status in requirements files

## Quick links

- Documentation: `./docs/GETTING_STARTED.md` (and other guides in `./docs`)
- Changelog: `CHANGELOG.md`
- License: `LICENSE.txt`

## Requirements

- Positron version >= 2025.09.0-139 (or compatible VS Code host)
- Python available in the environment used by Positron
- `pip` available for installs
- Optional: `uv` for advanced environment management

## Install

From the Marketplace (recommended)

- Search for "Positron Python Package Manager" in the Positron / VS Code extension marketplace and install.

From source (development)

- Install dependencies and build the extension, then run in Extension Development Host (F5):

```powershell
# in the repository root
npm install
npm run watch
# Open the project in VS Code and press F5 to launch Extension Development Host
```

To create a packaged build (VSIX), run:

```powershell
npm run package
# then use the generated artifacts (if packaging tooling is present) to install as a VSIX
```

## Usage

See the full usage guide in `docs/USAGE.md` but common actions include:

- Open the activity bar icon titled "Python" to view the package sidebar
- Click the install icon on a package to install it into the current interpreter
- Use the command palette (Ctrl+Shift+P) and run commands such as:
  - `PyPkgMan: Install Missing Python Module` (quick-fix)
  - `PyPkgMan: Install Packages` (install from view)
  - `PyPkgMan: Check Outdated Packages`
  - `PyPkgMan: Refresh Packages`

## Commands and configuration

Full commands list and configuration keys are documented in `docs/COMMANDS.md` and `docs/USAGE.md`. Key configuration keys include:

- `pypiAssistant.codeLens` (boolean) — enable CodeLens for pip/pyproject files.
- `positronPythonPackageManager.enableVersionDecorations` (boolean) — show up-to-date/outdated decorations.
- `inlinePythonPackageInstaller.autoInstall` (boolean) — install missing modules automatically.
- `inlinePythonPackageInstaller.customPipCommand` (string) — custom pip command to use for installs.

## Contributing

See `docs/CONTRIBUTING.md` for development setup, tests, and contribution workflow. The project is MIT-licensed. Please follow the existing code style and run `npm run lint` before submitting PRs.

## Troubleshooting

- If the extension cannot determine the Python interpreter, ensure a Python extension/runtime is active in Positron and that the path is valid.
- For Windows, the extension attempts to map virtualenv `bin` paths to `Scripts` if necessary.

## Credits

Created by [ntluong95](https://github.com/ntluong95). Licensed under the MIT License.

## Files changed

- This README was expanded and new documentation files were added under `docs/`.

---

For the full guides, see the `docs/` directory in this repository.
