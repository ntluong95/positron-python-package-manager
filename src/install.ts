import * as vscode from "vscode";
import * as positron from "positron";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { refreshPackages } from "./refresh";
import { getPythonInterpreter, isLibPathWriteable } from "./utils";
import { PyPackageItem, SidebarProvider } from "./sidebar";
import { execFile } from "child_process";
import { promisify } from "util";

const execFilePromise = promisify(execFile);

// TODO: Provide two options to install package, either using python-envs.packages or pip install
// TODO: If install with UV for virtual environment, may need to first initialize the .venv first then run uv add packagename
export async function installPackages(
  sidebarProvider: SidebarProvider
): Promise<void> {
  // Always use custom install UI to give users choice of installation source
  await customInstallPackages(sidebarProvider);
}

// In-house fallback for pip install with multiple source options
async function customInstallPackages(
  sidebarProvider: SidebarProvider
): Promise<void> {
  // Get site-packages paths
  const paths = await getSitePackagesPaths();

  // Check if any path is writeable
  for (const sitePath of paths) {
    if (isLibPathWriteable(sitePath)) {
      await installUI(sitePath, sidebarProvider);
      return;
    }
  }

  // No writeable paths found
  vscode.window.showWarningMessage(
    "None of the site-packages directories are writeable. Please select a custom path or use a virtual environment."
  );
  void changeSitePackagesPath(sidebarProvider); // fire and forget
}

/**
 * Get site-packages paths from the Python interpreter
 */
async function getSitePackagesPaths(): Promise<string[]> {
  const pythonExec = await getPythonExecutable();
  if (!pythonExec) {
    return [];
  }

  try {
    const { stdout } = await execFilePromise(pythonExec, [
      "-c",
      "import site; import json; print(json.dumps(site.getsitepackages()))",
    ]);
    const paths: string[] = JSON.parse(stdout.trim());
    return paths;
  } catch (err) {
    console.error("Failed to get site-packages paths:", err);
    vscode.window.showErrorMessage(
      `Failed to read site-packages paths: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return [];
  }
}

/**
 * Show installation UI with method selection
 */
async function installUI(
  sitePath: string,
  sidebarProvider: SidebarProvider
): Promise<void> {
  // Check if Positron's python-envs.packages command is available
  const commands = await vscode.commands.getCommands(true);
  const hasPositronPackagesCommand = commands.includes("python-envs.packages");

  const options = [
    { label: "Install from PyPI (Recommended)", value: "pypi" },
    { label: "Install from GitHub", value: "github" },
    {
      label: "Install from local archive (.whl, .tar.gz, .zip)",
      value: "local",
    },
    {
      label: `Install to another directory (current: ${sitePath})`,
      value: "customPath",
    },
  ];

  // Add Positron's native package installer option if available
  if (hasPositronPackagesCommand) {
    options.unshift({
      label: "Use Positron's Package Installer",
      value: "positron",
    });
  }

  const selection = await vscode.window.showQuickPick(options, {
    title: "Select installation method",
    placeHolder: "Where would you like to install packages from?",
    ignoreFocusOut: true,
  });

  if (!selection) {
    return; // User cancelled
  }

  switch (selection.value) {
    case "positron":
      await installFromPositron();
      break;
    case "pypi":
      await installFromPyPI(sidebarProvider, sitePath);
      break;
    case "github":
      await installFromGitHub(sidebarProvider, sitePath);
      break;
    case "local":
      await installFromLocal(sidebarProvider, sitePath);
      break;
    case "customPath":
      void changeSitePackagesPath(sidebarProvider); // fire and forget
      break;
  }
}

/**
 * Install using Positron's native package installer
 */
async function installFromPositron(): Promise<void> {
  const resource = vscode.workspace.workspaceFolders?.[0]?.uri;
  try {
    await vscode.commands.executeCommand("python-envs.packages", resource);
  } catch (err) {
    console.error(err);
    vscode.window.showErrorMessage(
      "❌ Failed to open Positron's package installer."
    );
  }
}

/**
 * Install Python packages from PyPI
 */
async function installFromPyPI(
  sidebarProvider: SidebarProvider,
  targetPath?: string
): Promise<void> {
  const packageName = await vscode.window.showInputBox({
    title: "Install Python Packages from PyPI",
    prompt: "Enter package name(s) to install (separate multiple with space)",
    placeHolder: "e.g., numpy pandas scikit-learn",
    ignoreFocusOut: true,
  });

  if (!packageName?.trim()) {
    return; // User cancelled
  }

  const pythonExec = await getPythonExecutable();
  if (!pythonExec) {
    return;
  }

  const packages = packageName.trim().split(/\s+/);
  const installArgs = ["-m", "pip", "install"];

  if (targetPath) {
    installArgs.push("--target", targetPath);
  }

  installArgs.push(...packages);

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Installing ${
          packages.length > 1 ? "packages" : "package"
        } from PyPI...`,
        cancellable: false,
      },
      async () => {
        await execFilePromise(pythonExec, installArgs);
      }
    );

    vscode.window.showInformationMessage(
      `✅ Successfully installed: ${packages.join(", ")}`
    );
    await refreshPackages(sidebarProvider);
  } catch (err: any) {
    vscode.window.showErrorMessage(
      `❌ Failed to install package(s): ${err.message}`
    );
  }
}

/**
 * Install Python packages from GitHub repository
 */
async function installFromGitHub(
  sidebarProvider: SidebarProvider,
  targetPath?: string
): Promise<void> {
  const repo = await vscode.window.showInputBox({
    title: "Install from GitHub",
    prompt: "Enter GitHub repository URL or user/repo format",
    placeHolder:
      "e.g., git+https://github.com/user/repo.git or user/repo@branch",
    ignoreFocusOut: true,
  });

  if (!repo?.trim()) {
    return; // User cancelled
  }

  const pythonExec = await getPythonExecutable();
  if (!pythonExec) {
    return;
  }

  const repoInput = repo.trim();

  // Format the input for pip install
  let installTarget: string;
  if (repoInput.startsWith("git+") || repoInput.startsWith("http")) {
    // Already a proper git URL
    installTarget = repoInput;
  } else {
    // Assume user/repo format, convert to git URL
    const parts = repoInput.split("@");
    const repoPath = parts[0];
    const branch = parts[1] || "main";
    installTarget = `git+https://github.com/${repoPath}.git@${branch}`;
  }

  const installArgs = ["-m", "pip", "install"];

  if (targetPath) {
    installArgs.push("--target", targetPath);
  }

  installArgs.push(installTarget);

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Installing from GitHub...`,
        cancellable: false,
      },
      async () => {
        await execFilePromise(pythonExec, installArgs);
      }
    );

    vscode.window.showInformationMessage(
      `✅ Successfully installed from GitHub: ${repoInput}`
    );
    await refreshPackages(sidebarProvider);
  } catch (err: any) {
    vscode.window.showErrorMessage(
      `❌ Failed to install from GitHub: ${err.message}`
    );
  }
}

/**
 * Install Python packages from local archive file (.whl, .tar.gz, .zip)
 */
async function installFromLocal(
  sidebarProvider: SidebarProvider,
  targetPath?: string
): Promise<void> {
  const result = await vscode.window.showOpenDialog({
    filters: {
      "Python Packages": ["whl", "tar.gz", "zip"],
      "All Files": ["*"],
    },
    canSelectMany: false,
    openLabel: "Install package",
  });

  if (!result || !result[0]) {
    return; // User cancelled
  }

  const filePath = result[0].fsPath;

  const pythonExec = await getPythonExecutable();
  if (!pythonExec) {
    return;
  }

  const installArgs = ["-m", "pip", "install"];

  if (targetPath) {
    installArgs.push("--target", targetPath);
  }

  installArgs.push(filePath);

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Installing from local file...`,
        cancellable: false,
      },
      async () => {
        await execFilePromise(pythonExec, installArgs);
      }
    );

    vscode.window.showInformationMessage(
      `✅ Successfully installed from: ${path.basename(filePath)}`
    );
    await refreshPackages(sidebarProvider);
  } catch (err: any) {
    vscode.window.showErrorMessage(
      `❌ Failed to install from local file: ${err.message}`
    );
  }
}

/**
 * Helper function to get Python executable
 */
async function getPythonExecutable(): Promise<string | null> {
  const pythonExtension = vscode.extensions.getExtension("ms-python.python");
  if (!pythonExtension) {
    vscode.window.showErrorMessage("Python extension not found.");
    return null;
  }

  if (!pythonExtension.isActive) {
    await pythonExtension.activate();
  }

  const pythonExec =
    pythonExtension.exports.settings.getExecutionDetails().execCommand?.[0];
  if (!pythonExec) {
    vscode.window.showErrorMessage("No active Python interpreter found.");
    return null;
  }

  return pythonExec;
}

/**
 * Helper function to check if site-packages directory is writeable
 */
async function checkSitePackagesWriteable(
  pythonExec: string
): Promise<boolean> {
  try {
    const { stdout } = await execFilePromise(pythonExec, [
      "-c",
      "import site; print(site.getsitepackages()[0])",
    ]);
    const sitePackagesPath = stdout.trim();

    if (!isLibPathWriteable(sitePackagesPath)) {
      vscode.window.showErrorMessage(
        `❌ Cannot write to site-packages directory: ${sitePackagesPath}. ` +
          "You may need administrator/sudo privileges or use a virtual environment."
      );
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn("Could not verify site-packages writability:", err);
    // Continue with installation attempt
    return true;
  }
}

/**
 * Allow user to select or create a custom installation directory
 */
export async function changeSitePackagesPath(
  sidebarProvider: SidebarProvider
): Promise<void> {
  const existingPaths = await getSitePackagesPaths();

  const qp = vscode.window.createQuickPick();
  qp.title = "Select Installation Directory";
  qp.placeholder = "Choose an existing path or type a new one";
  qp.ignoreFocusOut = true;

  const baseItems: (vscode.QuickPickItem & { id?: string })[] = [
    ...existingPaths.map((p) => ({
      label: p,
      description: "Existing site-packages directory",
    })),
    {
      id: "browse",
      label: "📁 Browse for a new installation directory...",
      description: "Select a custom directory",
    },
  ];

  qp.items = baseItems;
  qp.show();

  qp.onDidAccept(async () => {
    const input = qp.value.trim().replace(/\\/g, "/");
    let finalPath: string | undefined;

    const selected = qp.selectedItems[0] as vscode.QuickPickItem & {
      id?: string;
    };

    // Case 1: Browse
    if (selected?.id === "browse") {
      const folder = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Use as Installation Directory",
      });

      if (folder?.length) {
        finalPath = folder[0].fsPath.replace(/\\/g, "/");
      }
    }

    // Case 2: Picked from existing list
    else if (selected) {
      finalPath = selected.label;
    }

    // Case 3: Manually typed
    else if (input) {
      if (fs.existsSync(input)) {
        finalPath = input.trim();
      } else {
        try {
          fs.mkdirSync(input, { recursive: true });
          finalPath = input;
        } catch (err) {
          vscode.window.showErrorMessage(
            `Failed to create directory: ${String(err)}`
          );
        }
      }
    }

    qp.hide();

    if (finalPath) {
      if (!isLibPathWriteable(finalPath)) {
        vscode.window.showErrorMessage(
          "The selected path is not writeable. Please choose another path."
        );
        void changeSitePackagesPath(sidebarProvider); // fire and forget
        return;
      }
      await installUI(finalPath, sidebarProvider);
    } else {
      vscode.window.showInformationMessage(
        "No installation directory selected, please try again."
      );
      void changeSitePackagesPath(sidebarProvider); // fire and forget
      return;
    }
  });
}

export async function uninstallPackage(
  item: PyPackageItem | undefined,
  sidebarProvider: SidebarProvider
): Promise<void> {
  if (!item) {
    const all = sidebarProvider.getPackages?.();
    if (!all || all.length === 0) {
      vscode.window.showInformationMessage(
        "No Python packages available to uninstall."
      );
      return;
    }

    const selection = await vscode.window.showQuickPick(
      all.map((pkg) => ({
        label: `${pkg.name} ${pkg.version}`,
        description: pkg.title,
        pkg,
      })),
      {
        title: "Select a package to uninstall",
        placeHolder: "Choose a package to uninstall",
        ignoreFocusOut: true,
      }
    );

    if (!selection) {
      return;
    }

    item = { pkg: selection.pkg } as PyPackageItem;
  }

  const pythonExec = await getPythonExecutable();
  if (!pythonExec) {
    return;
  }

  // Check if the site-packages directory is writeable
  if (!(await checkSitePackagesWriteable(pythonExec))) {
    return;
  }

  try {
    // 🚀 Run pip uninstall silently
    await execFilePromise(pythonExec, [
      "-m",
      "pip",
      "uninstall",
      "-y",
      item.pkg.name,
    ]);

    vscode.window.showInformationMessage(
      `✅ Successfully uninstalled ${item.pkg.name}`
    );
    sidebarProvider.refresh(await sidebarProvider.getPackages());
  } catch (err: any) {
    vscode.window.showErrorMessage(
      `❌ Failed to uninstall ${item.pkg.name}: ${err.message}`
    );
  }
}

export async function updatePackages(
  item: PyPackageItem | undefined,
  sidebarProvider: SidebarProvider
): Promise<void> {
  if (!item) {
    vscode.window.showInformationMessage("No package selected to update.");
    return;
  }

  const pythonExec = await getPythonExecutable();
  if (!pythonExec) {
    return;
  }

  // Check if the site-packages directory is writeable
  if (!(await checkSitePackagesWriteable(pythonExec))) {
    return;
  }

  try {
    await execFilePromise(pythonExec, [
      "-m",
      "pip",
      "install",
      "--upgrade",
      item.pkg.name,
    ]);
    vscode.window.showInformationMessage(`✅ Updated ${item.pkg.name}`);
    await refreshPackages(sidebarProvider);
  } catch (err: any) {
    vscode.window.showErrorMessage(
      `❌ Failed to update ${item.pkg.name}: ${err.message}`
    );
  }
}
