# 📦 Positron Python Package Manager

Manage your Python extensions from within [Positron](https://positron.posit.co/) — the RStudio-style package manager for the modern data science IDE.

![](https://raw.githubusercontent.com/ntluong95/positron-python-package-manager/refs/heads/main/resources/screenshot.png)

![](https://raw.githubusercontent.com/ntluong95/positron-python-package-manager/refs/heads/main/resources/inline-installing.png)

![](https://raw.githubusercontent.com/ntluong95/positron-python-package-manager/refs/heads/main/resources/pyproject.png)

---

## 🚀 Features

- ✅ 🔍 View all **installed Python packages** in a tidy sidebar
- ✅ 🔍 View all **loaded Python packages**. When hovering the loaded packages'name, a tooltip will show to display the information of name alias, sub-modules imported
- ✅ 🔍 Explore metadata of **Python packages** defined in `pyprojects.toml` and `requirements.txt` file
- ✅ 💡 Provides quick-fix actions to install missing packages
- ✅ 💡 Right click on `pyproject.toml` file to manage the virtual environment
- ✅ 🚀 **Create** virtual environment and **Install** packages directly from `pyprojects.toml` and `requirements.txt` file with uv
- ✅ 🚀 **Install** packages directly from pane
- ✅ 🚀 **Uninstall** packages with a single click
- ✅ 🔍 **Search** by name or title (fuzzy search supported)
- ✅ ⚙️ Check the box to import packages. Due to the complexity of importing package conventions in Python, check the box will import the entire package. Importing python package usually requires to be declared explicitly

---

## 🛠 Requirements

- Positron version `2025.04.0-250` or later
- `uv` if you want to manage v
- `pip` and `module-inspector` must be installed in the Python runtime.
- Python installed and working inside Positron
- This extension must run in the **workspace** (remote/WSL/container supported ✅)

---

## ⚙️ Extension Settings

This extension currently has no user-facing settings — it's fully automatic.

---


## ⚠️ Known Issues

- Refresh package view will print the commmand and result into console
- Clicking on package's name doesn't show its documentation in Help pane due to the different in package name and module imported. For example, the package name is pyjanitor but it is imported as `import janitor`

---

## 🙏 Attribution

Created by [ntluong95](https://github.com/ntluong95)  
Licensed under the [MIT License](./LICENSE)

---

## 💡 Future Ideas

- [ ] Update package to a specific version
- [ ] Provide multiple way to install packages from .whl, .tar.gz file
---

## 🧠 Why Positron?

Because it’s time for a modern, polyglot, VS Code-based Data Science IDE — and this extension brings one of RStudio's most beloved panels to the future.
