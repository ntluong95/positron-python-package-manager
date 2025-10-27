# Getting started — Positron Python Package Manager (PyPkgMan)

This short guide walks you through installing and launching the Positron Python Package Manager extension for Positron/VS Code.

## Prerequisites

- Positron (or VS Code) compatible with extension host engine listed in `package.json` (vscode engine ^1.99.0).
- A working Python runtime accessible from Positron.
- `pip` available in the Python runtime for install/uninstall operations.
- (Optional) `uv` installed for advanced environment management.

## Install

From the marketplace

1. Open Positron / VS Code.
2. Open the Extensions view (Ctrl+Shift+X).
3. Search for "Positron Python Package Manager" and install.

From source (developer workflow)

1. Clone the repository and open it in Positron/VS Code.
2. Install dependencies and build.

```powershell
npm install
npm run watch
```

3. Start the Extension Development Host (F5) to run the extension in a sandboxed window.

## Packaging (optional)

To build production artifacts (webpack build):

```powershell
npm run package
```

This triggers a production webpack build (see `package.json`). If you need a VSIX you can add `vsce` or `@vscode/vsce` packaging steps.

## First run

1. With the extension installed or running in the Extension Development Host, open a workspace containing a `pyproject.toml` or `requirements.txt` file to see the package sidebar.
2. Open the activity bar and click the "Python" icon (labelled `Python`) to open the PyPkgMan view.
3. Use the view title actions to refresh packages, check outdated packages, or install packages.

## Where to go next

- See `docs/USAGE.md` for detailed usage and examples.
- See `docs/COMMANDS.md` to discover command palette entries and keyboard-friendly operations.
- See `docs/CONTRIBUTING.md` for development and testing instructions.

## Troubleshooting

- If packages don't appear, confirm Positron's Python runtime is set and can run `pip list`.
- If the Quick-Fix install action cannot determine the interpreter, check your Python extension settings in Positron.

Enjoy managing Python packages directly from Positron!
