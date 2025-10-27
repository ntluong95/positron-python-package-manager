# Commands — Positron Python Package Manager (PyPkgMan)

This page lists the primary commands exposed by the extension. Use the Command Palette (Ctrl+Shift+P) to run them by name or run them via keyboard shortcuts if you assign any.

## Core PyPkgMan commands

- `positron-python-package-manager.refreshPackages` — Refresh the package list in the sidebar.
- `positron-python-package-manager.searchPackages` — Prompt for a search/filter and apply it to the sidebar.
- `positron-python-package-manager.installPackages` — Install selected package(s) from the view.
- `positron-python-package-manager.uninstallPackage` — Uninstall the selected package.
- `positron-python-package-manager.updatePackage` — Update a package (if an update is available).
- `positron-python-package-manager.checkOutdatedPackages` — Scan and flag outdated packages.
- `positron-python-package-manager.openHelp` — Run `help(<module>)` in the runtime for the given package name.
- `positron-python-package-manager.toggleVersionDecorations` — Toggle version decorations on/off.

## Inline quick-fix

- `extension.installModule` — Command used by the missing-import quick-fix to install a Python module using the active interpreter.

## UV-related commands (environment management)

These commands are namespaced under `uv-*` and integrate with `uv` environment tooling:

- `uv-wingman.buildEnvironment` / `uv-wingman.buildEnvironment.ui` — Build environment from the opened file.
- `uv-wingman.installPackagesUV` / `uv-wingman.installPackagesUV.ui` — Install packages from the opened file using `uv`.
- `uv-wingman.writeRequirementsFile` / `uv-wingman.writeRequirementsFile.ui` — Write `requirements.txt` from the active environment.
- `uv-wingman.deleteEnvironment` / `uv-wingman.deleteEnvironment.ui` — Delete a managed environment.
- `uv.init`, `uv.sync`, `uv.upgrade`, `uv.cache.clean`, `uv.removePackage`, `uv.searchPackage`, `uv.generateLock`, `uv.upgradeDependencies`, `uv.manageVirtualEnv`, `uv.runScript`, `uv.addScriptDependency`, `uv.installPython`, `uv.pinPython`, `uv.installTool`, `uv.runTool`, `uv.add` — Various utility commands for uv workflows (see the `uv` docs or the extension's `uv` code for exact behavior).

## How to call a command programmatically

From extension code or another extension you can call:

```ts
vscode.commands.executeCommand(
  "positron-python-package-manager.refreshPackages"
);
```

See `package.json` for the full contributed commands list and the UI placements.
