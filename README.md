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

- `pypiAssistant.codeLens`  
  _(boolean, default: `false`)_  
  Enable/disable latest package version CodeLens in `pip-requirements` and `pyproject.toml` files.

- `positronPythonPackageManager.enableVersionDecorations`  
  _(boolean, default: `false`)_  
  Enable decorations showing if package versions are up-to-date or outdated in `pip-requirements` and `pyproject.toml` files

- `inlinePythonPackageInstaller.autoInstall`
  _(boolean, default: `false`)_
  Automatically install missing Python modules without prompting.

- `inlinePythonPackageInstaller.customPipCommand`
  _(boolean, default: `pip install`)_
  Custom pip command to use for installing modules.

You can configure this setting in your VS Code settings (`settings.json`) or through the Settings UI.

---

## ⚠️ Known Issues

- Refresh package view will print the commmand and result into console
- Clicking on package's name doesn't show its documentation in Help pane due to the different in package name and module imported. For example, the package name is pyjanitor but it is imported as `import janitor`

---

## 💡 Future Ideas

- [ ] Update package to a specific version
- [ ] Provide multiple way to install packages from .whl, .tar.gz file

---

## 🙏 Attribution

Created by [ntluong95](https://github.com/ntluong95). Licensed under the MIT License.

## Files changed

- This README was expanded and new documentation files were added under `docs/`.

---

For the full guides, see the `docs/` directory in this repository.
