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

  Custom pip command to use for installing modules.

You can configure this setting in your VS Code settings (`settings.json`) or through the Settings UI.

---

## 🔧 Customizing the installer command

PPM lets you customize how the quick-fix installer runs via the workspace setting `inlinePythonPackageInstaller.customPipCommand` (default: `pip install`). The extension supports two template placeholders:

- `{python}` — replaced with the resolved Python interpreter path (PowerShell-safe on Windows). Use this when you need the interpreter inserted into the command explicitly.
- `{module}` — replaced with the package/module name being installed.

Examples

- Default (recommended):

  ```json
  "inlinePythonPackageInstaller.customPipCommand": "pip install"
  ```

  This runs: `"<interpreter>" -m pip install <module>` so the install targets the active interpreter.

- Add flags (still using pip through the interpreter):

  ```json
  "inlinePythonPackageInstaller.customPipCommand": "pip install --upgrade"
  ```

  Runs: `"<interpreter>" -m pip install --upgrade <module>`

- Use the interpreter directly (full control):

  ```json
  "inlinePythonPackageInstaller.customPipCommand": "{python} -m pip install --no-cache-dir {module}"
  ```

  Runs exactly what you specify, replacing `{python}` and `{module}`.

- Poetry (direct CLI):

  ```json
  "inlinePythonPackageInstaller.customPipCommand": "poetry add {module} --dev"
  ```

  Runs `poetry add <module> --dev` directly; make sure `poetry` is on PATH or provide a full path.

- Conda (direct CLI):

  ```json
  "inlinePythonPackageInstaller.customPipCommand": "conda install -y {module}"
  ```

Notes and caveats

- If you pick a direct CLI (poetry/conda/uv), the command runs as-is in the integrated terminal — ensure the tool is available on PATH in the shell used by the terminal.
- For shells that require activation (e.g., conda activate), prefer using `{python}` to target the interpreter or configure an activation+install template that works in a non-interactive integrated terminal.
- On Windows, the extension injects the interpreter using PowerShell-friendly quoting (e.g. `& "C:\\path\\to\\python.exe"`).
- If you need a very custom environment setup (activation, shell functions), consider creating a small wrapper script that performs activation then runs the install, and point `customPipCommand` to that script.

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
