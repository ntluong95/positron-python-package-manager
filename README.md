# Positron Python Package Manager (PyPkgMan)

Manage Python packages directly inside Positron IDE, a fork of VSCode. PyPkgMan provides a tidy sidebar to view installed and loaded packages, quick actions to install/uninstall packages, integration with `pyproject.toml` and `requirements.txt`, and utilities to manage virtual environments through `uv`.

---

## 🚀 Features

### Package Management

- ✅ 🔍 View all **installed packages** and **loaded packages** in a tidy sidebar. When hovering the loaded packages'name, a tooltip will show to display the information of name alias, sub-modules imported
- ✅ 🚀 **Install** and **Uninstall** packages directly from pane with a single click
- ✅ 🔍 **Search** installed packages by name or title (fuzzy search supported)
- ✅ ⚙️ Check the box to import packages. Due to the complexity of importing package conventions in Python, check the box will import the entire package. Importing python package usually requires to be declared explicitly
- ✅ 💡 Provides quick-fix actions to install missing packages

![](https://raw.githubusercontent.com/ntluong95/positron-python-package-manager/refs/heads/main/resources/screenshot.png)

![](https://raw.githubusercontent.com/ntluong95/positron-python-package-manager/refs/heads/main/resources/inline-installing.png)

### Virtual Environment Management with uv

- ✅ 💡 Right click on `pyproject.toml` file to manage the virtual environment
- ✅ 🔍 Explore metadata of **Python packages** defined in `pyprojects.toml` and `requirements.txt` file
- ✅ 🚀 **Create** virtual environment and **Install** packages directly from `pyprojects.toml` and `requirements.txt` file with uv

![](https://raw.githubusercontent.com/ntluong95/positron-python-package-manager/refs/heads/main/resources/pyproject.png)

---

## 🛠 Requirements

- Positron version `2025.09.0-139` or later
- `uv` if you want to manage virtual environment
- `pip` and `module-inspector` must be installed in the Python runtime.
- Python installed and working inside Positron
- This extension must run in the **workspace** (remote/WSL/container supported ✅)

---

## ⚙️ Extension Settings

This extension provides the following setting:

- `pypiAssistant.codeLens`: _(boolean, default: `false`)_  
  Enable/disable latest package version CodeLens in `pip-requirements` and `pyproject.toml` files.

- `positronPythonPackageManager.enableVersionDecorations`: _(boolean, default: `false`)_  
  Enable decorations showing if package versions are up-to-date or outdated in `pip-requirements` and `pyproject.toml` files

- `inlinePythonPackageInstaller.autoInstall`: _(boolean, default: `false`)_
  Automatically install missing Python modules without prompting.

- `inlinePythonPackageInstaller.customPipCommand`: _(string, default: `pip install`)_
  Custom pip command to use for installing modules.

You can configure this setting in your VS Code settings (`settings.json`) or through the Settings UI.

---

## ⚠️ Known Issues

- Clicking on package's name doesn't show its documentation in Help pane due to the different in package name and module imported. For example, the package name is pyjanitor but it is imported as `import janitor`

---

## 💡 Future Ideas

- [ ] Update package to a specific version
- [ ] Provide multiple way to install packages from .whl, .tar.gz file

---

## 🙏 Attribution

Created by [ntluong95](https://github.com/ntluong95)  
Licensed under the [MIT License](./LICENSE)

---
