import * as vscode from "vscode";
import * as positron from "positron";
import * as path from "path";
import * as fs from "fs";
import { refreshPackages } from "./refresh";
import { refreshOutdatedPackages } from "./update";
import { SidebarProvider, PyPackageItem } from "./sidebar";
import { installPackages, uninstallPackage, updatePackages } from "./install";
import { getChangeForegroundEvent, getLoadLibraryEvent } from "./events";
import { getImportName, getPythonInterpreter, PyPI } from "./utils";
import dayjs from "dayjs";
import { ProjectNameRequirement } from "pip-requirements-js";
import { RequirementsParser } from "./parser";
import {
  buildEnv,
  installPackagesUV,
  writeRequirements,
  removeEnv,
} from "./uv/commands";
import {
  createEnvIcon,
  installPackagesIcon,
  writeEnvIcon,
  deleteEnvIcon,
} from "./uv/statusBarItems";
import { registerCommands } from "./uv/commands";
import { registerPackageManager } from "./uv/packageManager";
import {
  initializeDecoration,
  outdatedDecorationType,
  upToDateDecorationType,
} from "./decorations";
import { addVersionComparisonDecorations } from "./packageManager";

export function activate(context: vscode.ExtensionContext) {
  initializeDecoration();
  registerCommands(context);

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(async (document) => {
      const enableDecorations = vscode.workspace
        .getConfiguration("positronPythonPackageManager")
        .get("enableVersionDecorations", true);
      if (
        enableDecorations &&
        (document.languageId === "pip-requirements" ||
          (document.languageId === "toml" &&
            document.fileName.endsWith("pyproject.toml")))
      ) {
        await addVersionComparisonDecorations(document);
      }
    }),
    vscode.workspace.onDidChangeTextDocument(async (event) => {
      const enableDecorations = vscode.workspace
        .getConfiguration("positronPythonPackageManager")
        .get("enableVersionDecorations", true);
      if (
        enableDecorations &&
        (event.document.languageId === "pip-requirements" ||
          (event.document.languageId === "toml" &&
            event.document.fileName.endsWith("pyproject.toml")))
      ) {
        await addVersionComparisonDecorations(event.document);
      }
    }),
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      const enableDecorations = vscode.workspace
        .getConfiguration("positronPythonPackageManager")
        .get("enableVersionDecorations", true);
      if (
        enableDecorations &&
        editor &&
        (editor.document.languageId === "pip-requirements" ||
          (editor.document.languageId === "toml" &&
            editor.document.fileName.endsWith("pyproject.toml")))
      ) {
        await addVersionComparisonDecorations(editor.document);
      }
    })
  );
  // --------------------------------------------------------------------------
  // Inline Missing Module Installer Setup
  // --------------------------------------------------------------------------

  // Create an output channel to log installation events.
  const outputChannel = vscode.window.createOutputChannel(
    "Python Module Installer"
  );
  context.subscriptions.push(outputChannel);

  // Register the command to install missing modules (triggered via a code action).
  const installModuleCommand = vscode.commands.registerCommand(
    "extension.installModule",
    async (moduleName: string) => {
      const config = vscode.workspace.getConfiguration(
        "missingPackageInstaller"
      );
      // Read settings for auto-install and custom pip command
      // Get the current Python interpreter from the Python extension.
      const pythonPath = await getPythonInterpreter();
      if (!pythonPath) {
        vscode.window.showErrorMessage(
          "Could not determine the Python interpreter."
        );
        return;
      }

      // On Windows, adjust the interpreter path if needed.
      let actualPythonPath = pythonPath;
      if (process.platform === "win32") {
        // Check if the file exists. If not, try replacing "\bin\" with "\Scripts\".
        if (!fs.existsSync(actualPythonPath)) {
          if (
            actualPythonPath.toLowerCase().includes(`${path.sep}bin${path.sep}`)
          ) {
            const alternative = actualPythonPath.replace(
              new RegExp(`${path.sep}bin${path.sep}`, "gi"),
              `${path.sep}Scripts${path.sep}`
            );
            if (fs.existsSync(alternative)) {
              actualPythonPath = alternative;
            }
          }
        }
      }
      console.log("Using Python interpreter:", actualPythonPath);

      // Detect environment type for logging or further customization if needed.
      const locationType = actualPythonPath.toLowerCase().includes("venv")
        ? "VirtualEnv"
        : actualPythonPath.toLowerCase().includes("conda")
        ? "Conda"
        : "Global";
      console.log(`Detected environment type: ${locationType}`);
      console.log("Using interpreter:", pythonPath);
      // Read settings for auto-install and custom pip command
      const autoInstall = config.get<boolean>("autoInstall", false);

      // Build an install command using the active interpreter, but consult
      // the user's custom pip command setting if present.
      // The `missingPackageInstaller.customPipCommand` setting is expected
      // to be a pip-style command, e.g. `pip install` (default). If the value
      // contains the placeholder `{python}` it will be replaced with the
      // interpreter path (PowerShell-friendly on Windows). Otherwise we run
      // the configured command through the active interpreter using
      // `python -m <customCmd>` to ensure the interpreter's pip is used.
      const customPipCommand = config.get<string>(
        "customPipCommand",
        "pip install"
      );

      let installCommand: string;
      // Prefer the adjusted actual interpreter path (Windows bin -> Scripts fix)
      const interpreterPath = actualPythonPath || pythonPath;

      // Support a few common scenarios for custom commands:
      // 1) A template containing `{python}` — we replace it with the resolved
      //    interpreter path (PowerShell-safe on Windows) and then inject the
      //    module name (or use `{module}` if provided).
      // 2) A direct CLI (e.g. `conda install`, `poetry add`, `uv add`) — run
      //    the command directly and append/replace `{module}` as needed.
      // 3) A normal pip-style command (default) — run it through the active
      //    interpreter as `python -m <cmd> <module>` to ensure the target env
      //    is used.

      const cmdTemplate = customPipCommand.trim();
      const modulePlaceholder = "{module}";
      const normalizedFirstToken = cmdTemplate.split(/\s+/)[0].toLowerCase();

      const directCLIWhitelabel = new Set([
        "conda",
        "mamba",
        "micromamba",
        "poetry",
        "uv",
        "pipx",
        "pipenv",
      ]);

      if (cmdTemplate.includes("{python}")) {
        // Fully-controlled template where user dictates how python is invoked.
        let cmd = cmdTemplate;
        if (process.platform === "win32") {
          cmd = cmd.replace(/\{python\}/g, `& "${interpreterPath}"`);
        } else {
          cmd = cmd.replace(/\{python\}/g, `"${interpreterPath}"`);
        }
        if (cmd.includes(modulePlaceholder)) {
          cmd = cmd.replace(new RegExp(modulePlaceholder, "g"), moduleName);
        } else {
          cmd = `${cmd} ${moduleName}`;
        }
        installCommand = cmd.trim();
      } else if (directCLIWhitelabel.has(normalizedFirstToken)) {
        // Treat as a direct CLI (do not prefix with `python -m`). Respect
        // `{module}` placeholder if provided.
        let cmd = cmdTemplate;
        if (cmd.includes(modulePlaceholder)) {
          cmd = cmd.replace(new RegExp(modulePlaceholder, "g"), moduleName);
        } else {
          cmd = `${cmd} ${moduleName}`;
        }
        installCommand = cmd.trim();
      } else {
        // Fallback: run the configured command as a module under the active
        // interpreter. This preserves prior behavior for `pip install` and
        // supports flags like `--upgrade`.
        const cmd = cmdTemplate;
        if (process.platform === "win32") {
          installCommand = `& "${interpreterPath}" -m ${cmd} ${moduleName}`;
        } else {
          installCommand = `"${interpreterPath}" -m ${cmd} ${moduleName}`;
        }
      }

      // Reuse a single dedicated terminal for installs to avoid spawning a new
      // shell each time. Look for an existing terminal with a fixed name and
      // create it if missing.
      const installerTerminalName = "Python Module Installer";
      let terminal = vscode.window.terminals.find(
        (t) => t.name === installerTerminalName
      );
      if (!terminal) {
        terminal = vscode.window.createTerminal(installerTerminalName);
      }

      if (autoInstall) {
        terminal.sendText(installCommand);
        terminal.show();
        outputChannel.appendLine(
          `Installing module: ${moduleName} using ${locationType}`
        );
      } else {
        const selection = await vscode.window.showInformationMessage(
          `Module '${moduleName}' is missing. Would you like to install it?`,
          "Yes",
          "No"
        );
        if (selection === "Yes") {
          terminal.sendText(installCommand);
          terminal.show();
          outputChannel.appendLine(`Installing module: ${moduleName}`);
        } else {
          outputChannel.appendLine(
            `Installation of module '${moduleName}' was declined.`
          );
        }
      }
    }
  );
  context.subscriptions.push(installModuleCommand);

  // Register a Code Action provider to offer a quick-fix when an import is missing.
  const codeActionProvider = vscode.languages.registerCodeActionsProvider(
    { language: "python", scheme: "file" },
    new MissingImportProvider(outputChannel),
    { providedCodeActionKinds: MissingImportProvider.providedCodeActionKinds }
  );
  context.subscriptions.push(installModuleCommand, codeActionProvider);

  // --------------------------------------------------------------------------
  // Positron Python Package Manager Setup
  // --------------------------------------------------------------------------

  const sidebarProvider = new SidebarProvider();

  // 🔥 Refresh package list on runtime/session change
  context.subscriptions.push(
    // getRegisterRuntimeEvent(),
    getChangeForegroundEvent(),
    getLoadLibraryEvent()
  );

  console.log("Positron Python Package Manager extension activated!");

  // 📦 Create sidebar tree
  const treeView = vscode.window.createTreeView("pythonPackageView", {
    treeDataProvider: sidebarProvider,
    showCollapseAll: false,
    canSelectMany: false,
  });

  treeView.onDidChangeCheckboxState((event) => {
    for (const [item, newState] of event.items) {
      sidebarProvider.handleCheckboxChange(item, newState);
    }
  });

  treeView.onDidChangeVisibility((event) => {
    if (event.visible) {
      refreshPackages(sidebarProvider);
    }
  });

  context.subscriptions.push(treeView);

  // 📚 Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "positron-python-package-manager.refreshPackages",
      () => {
        refreshPackages(sidebarProvider);
      }
    ),

    vscode.commands.registerCommand(
      "positron-python-package-manager.searchPackages",
      async () => {
        const input = await vscode.window.showInputBox({
          prompt: vscode.l10n.t(
            "Search Python packages — press Esc to clear filter, Enter to apply"
          ),
          value: sidebarProvider.getFilter(),
          placeHolder: vscode.l10n.t(
            'e.g. numpy, pandas, or "loaded" for loaded packages'
          ),
        });
        sidebarProvider.setFilter(input ?? "");
      }
    ),

    vscode.commands.registerCommand(
      "positron-python-package-manager.installPackages",
      () => {
        installPackages(sidebarProvider);
      }
    ),

    vscode.commands.registerCommand(
      "positron-python-package-manager.uninstallPackage",
      (item: PyPackageItem | undefined) => {
        uninstallPackage(item, sidebarProvider);
      }
    ),

    vscode.commands.registerCommand(
      "positron-python-package-manager.updatePackage",
      (item: PyPackageItem | undefined) => {
        updatePackages(item, sidebarProvider);
      }
    ),

    vscode.commands.registerCommand(
      "positron-python-package-manager.checkOutdatedPackages",
      async () => {
        await refreshOutdatedPackages(sidebarProvider);
      }
    ),

    vscode.commands.registerCommand(
      "positron-python-package-manager.openHelp",
      (pkgName: string) => {
        const importName = getImportName(pkgName);
        const pyCode = `import ${importName}; help(${importName})`;
        positron.runtime.executeCode(
          "python",
          pyCode,
          false,
          undefined,
          positron.RuntimeCodeExecutionMode.Silent
        );
      }
    ),

    vscode.commands.registerCommand(
      "positron-python-package-manager.toggleVersionDecorations",
      async () => {
        const config = vscode.workspace.getConfiguration(
          "positronPythonPackageManager"
        );
        const currentValue = config.get("enableVersionDecorations", true);
        await config.update(
          "enableVersionDecorations",
          !currentValue,
          vscode.ConfigurationTarget.Global
        );

        // Refresh decorations for all open documents
        if (!currentValue) {
          // If we're turning decorations on, add them to all open documents
          for (const editor of vscode.window.visibleTextEditors) {
            if (
              editor.document.languageId === "pip-requirements" ||
              (editor.document.languageId === "toml" &&
                editor.document.fileName.endsWith("pyproject.toml"))
            ) {
              await addVersionComparisonDecorations(editor.document);
            }
          }
        } else {
          // If we're turning decorations off, clear them from all open documents
          for (const editor of vscode.window.visibleTextEditors) {
            if (
              editor.document.languageId === "pip-requirements" ||
              (editor.document.languageId === "toml" &&
                editor.document.fileName.endsWith("pyproject.toml"))
            ) {
              editor.setDecorations(outdatedDecorationType, []);
              editor.setDecorations(upToDateDecorationType, []);
            }
          }
        }

        vscode.window.showInformationMessage(
          `Version decorations ${!currentValue ? "enabled" : "disabled"}`
        );
      }
    )
  );

  // --------------------------------------------------------------------------
  // PackageMetadata - Partial model of the package response returned by PyPI
  // --------------------------------------------------------------------------

  requirementsParser = new RequirementsParser();
  pypi = new PyPI();
  const hoverProvider = new PyPIHoverProvider(requirementsParser, pypi);
  const codeLensProvider = new PyPICodeLensProvider(requirementsParser, pypi);
  vscode.languages.registerCodeLensProvider(
    "pip-requirements",
    codeLensProvider
  );
  vscode.languages.registerHoverProvider("pip-requirements", hoverProvider);

  // Register for TOML files, but only pyproject.toml specifically
  vscode.languages.registerCodeLensProvider(
    { language: "toml", pattern: "**/pyproject.toml" },
    codeLensProvider
  );
  vscode.languages.registerHoverProvider(
    { language: "toml", pattern: "**/pyproject.toml" },
    hoverProvider
  );

  // --------------------------------------------------------------------------
  // uv support - Manage uv dependencies
  // --------------------------------------------------------------------------

  console.log('Congratulations, your extension "uv Wingman" is now active!');

  // const listener = (editor: vscode.TextEditor | undefined): void => {
  //     console.log("Active window changed", editor);

  //     createEnvIcon.hide(); //REVIEW Hide the status bar
  //     installPackagesIcon.hide();
  //     writeEnvIcon.hide();
  //     deleteEnvIcon.hide();
  // };

  // const fileChangeSubscription = vscode.window.onDidChangeActiveTextEditor(listener);

  const buildCommand = vscode.commands.registerCommand(
    "uv-wingman.buildEnvironment",
    buildEnv
  );
  const installPackagesCommand = vscode.commands.registerCommand(
    "uv-wingman.installPackagesUV",
    installPackagesUV
  );
  const writeCommand = vscode.commands.registerCommand(
    "uv-wingman.writeRequirementsFile",
    writeRequirements
  );
  const deleteCommand = vscode.commands.registerCommand(
    "uv-wingman.deleteEnvironment",
    removeEnv
  );

  // UI-friendly duplicates that just call the originals - display in Editor Action bar
  const buildCommandUI = vscode.commands.registerCommand(
    "uv-wingman.buildEnvironment.ui",
    () => {
      vscode.commands.executeCommand("uv-wingman.buildEnvironment");
    }
  );

  const installPackagesCommandUI = vscode.commands.registerCommand(
    "uv-wingman.installPackagesUV.ui",
    () => {
      vscode.commands.executeCommand("uv-wingman.installPackagesUV");
    }
  );

  const writeCommandUI = vscode.commands.registerCommand(
    "uv-wingman.writeRequirementsFile.ui",
    () => {
      vscode.commands.executeCommand("uv-wingman.writeRequirementsFile");
    }
  );

  const deleteCommandUI = vscode.commands.registerCommand(
    "uv-wingman.deleteEnvironment.ui",
    () => {
      vscode.commands.executeCommand("uv-wingman.deleteEnvironment");
    }
  );

  context.subscriptions.push(
    // fileChangeSubscription,
    buildCommand,
    installPackagesCommand,
    writeCommand,
    deleteCommand,
    buildCommandUI,
    installPackagesCommandUI,
    writeCommandUI,
    deleteCommandUI
  );

  // registerCommands(context); // REMOVED: Already called at line 37
  registerPackageManager(context);
}

// --------------------------------------------------------------------------
// MissingImportProvider - Handles quick-fix suggestions for missing imports.
// --------------------------------------------------------------------------
class MissingImportProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ];
  private outputChannel: vscode.OutputChannel;
  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.CodeAction[] | undefined {
    // Check if the line contains an import statement.
    const line = document.lineAt(range.start.line);
    const importMatch = line.text.match(/^import (\w+)|^from (\w+) import/);
    if (!importMatch) {
      return undefined;
    }
    const moduleName = importMatch[1] || importMatch[2];

    // Only offer the quick-fix if there's an unresolved-import diagnostic.
    // This prevents false positives and ensures we only suggest installs when
    // the language server (Pylance, Pyright, Jedi, etc.) reports a problem.
    const diagnostics = vscode.languages.getDiagnostics(document.uri);
    const diagnosticsForLine = diagnostics.filter(
      (d) =>
        d.range.intersection(range) !== undefined ||
        d.range.start.line === range.start.line
    );

    const hasUnresolvedImport = diagnosticsForLine.some((d) => {
      // Heuristics for common language server messages:
      // - Pylance/Pyright: code === 'reportMissingImports' or message includes 'could not be resolved'
      // - Other servers may use different messages; adjust as needed.
      const msg = (d.message || "").toLowerCase();
      if (d.code === "reportMissingImports") {
        return true;
      }
      return (
        msg.includes("could not be resolved") ||
        msg.includes("unresolved import") ||
        msg.includes("no module named") ||
        msg.includes("cannot find module") ||
        msg.includes("module not found") ||
        msg.includes("cannot resolve imported") ||
        msg.includes("not find import of")
      );
    });

    if (!hasUnresolvedImport) {
      return undefined;
    }

    // Create a quick-fix action to install the missing module.
    const installAction = new vscode.CodeAction(
      `Install missing module '${moduleName}'`,
      vscode.CodeActionKind.QuickFix
    );
    installAction.command = {
      command: "extension.installModule",
      title: "Install Module",
      arguments: [moduleName],
    };
    return [installAction];
  }
}

// --------------------------------------------------------------------------
// PackageMetadata - Partial model of the package response returned by PyPI
// --------------------------------------------------------------------------

/* Partial model of the package response returned by PyPI. */
export interface PackageMetadata {
  info: {
    name: string;
    summary: string;
    home_page: string;
    author: string;
    author_email: string;
    package_url: string;
    license: string;
    version: string;
    release_url: string;
  };
  releases: Record<string, { upload_time: string }[]>;
}

let requirementsParser: RequirementsParser;
let pypi: PyPI;

function linkify(text: string, link?: string): string {
  return link ? `[${text}](${link})` : text;
}

export class PyPIHoverProvider implements vscode.HoverProvider {
  constructor(
    public requirementsParser: RequirementsParser,
    public pypi: PyPI
  ) {}

  public async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | null> {
    const requirementWithRange = this.requirementsParser.getAtPosition(
      document,
      position
    );
    if (!requirementWithRange) {
      return null;
    }
    const metadata = await pypi.fetchPackageMetadata(requirementWithRange[0]);
    if (metadata === null) {
      return null;
    }
    return new vscode.Hover(this.formatPackageMetadata(metadata));
  }

  private formatPackageMetadata(metadata: PackageMetadata): string {
    const { info, releases } = metadata;
    const summarySubPart: string = info.summary
      ? ` – ${linkify(info.summary, info.home_page)}`
      : "";
    const metadataPresentation: string[] = [
      `**${linkify(info.name, info.package_url)}${summarySubPart}**`,
    ];
    const emailSubpart: string = info.author_email
      ? ` (${info.author_email})`
      : "";
    const authorSubpart: string | null =
      info.author && info.author_email
        ? `By ${info.author}${emailSubpart}.`
        : null;
    const licenseSubpart: string | null = info.license
      ? `License: ${info.license}.`
      : null;
    if (authorSubpart || licenseSubpart) {
      metadataPresentation.push(
        [authorSubpart, licenseSubpart].filter(Boolean).join(" ")
      );
    }
    metadataPresentation.push(
      `Latest version: ${linkify(
        info.version,
        info.release_url
      )} (released on ${dayjs(releases[info.version][0].upload_time).format(
        "D MMMM YYYY"
      )}).`
    );
    return metadataPresentation.join("\n\n");
  }
}

class PyPICodeLens extends vscode.CodeLens {
  requirement: ProjectNameRequirement;

  constructor(range: vscode.Range, requirement: ProjectNameRequirement) {
    super(range);
    this.requirement = requirement;
  }
}

export class PyPICodeLensProvider
  implements vscode.CodeLensProvider<PyPICodeLens>
{
  constructor(
    public requirementsParser: RequirementsParser,
    public pypi: PyPI
  ) {}

  public provideCodeLenses(document: vscode.TextDocument): PyPICodeLens[] {
    const codeLensEnabled = vscode.workspace
      .getConfiguration("pythonProject")
      .get("codeLens");
    if (!codeLensEnabled) {
      return [];
    }
    const requirements = this.requirementsParser.getAll(document);
    return requirements.map(
      ([requirement, range]) => new PyPICodeLens(range, requirement)
    );
  }

  public async resolveCodeLens(
    codeLens: PyPICodeLens,
    _: vscode.CancellationToken
  ): Promise<PyPICodeLens> {
    let title: string;
    try {
      const metadata = await pypi.fetchPackageMetadata(codeLens.requirement);
      title = this.formatPackageMetadata(metadata);
    } catch (e) {
      title = (e as Error).message;
    }
    codeLens.command = {
      command: "",
      title,
    };
    return codeLens;
  }

  private formatPackageMetadata(metadata: PackageMetadata): string {
    const { info } = metadata;
    return `Latest version: ${info.version}`;
  }
}

export function deactivate() {
  requirementsParser.clear();
  pypi.clear();
  console.log('Extension "uv Wingman" has been deactivated.');
}
