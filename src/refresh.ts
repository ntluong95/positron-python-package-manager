import * as vscode from 'vscode';
import * as positron from 'positron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SidebarProvider, PyPackageInfo } from './sidebar';
import { getObserver, getImportName, _installPythonPackage, getPythonInterpreter, waitForFile } from './utils';

export const execPromise = promisify(exec);

export interface ImportedPackageInfo {
  module: string;
  alias: string | null;
  members: string[];
}

export async function refreshPackages(sidebarProvider: SidebarProvider): Promise<void> {
  const observer = getObserver('Error refreshing packages: {0}');

  async function getImportedPackages(): Promise<ImportedPackageInfo[]> {
    const tmpPath = path.join(os.tmpdir(), `imported_packages_${Date.now()}.json`);
    const pyTmpPath = tmpPath.replace(/\\/g, '/');
    // const code = `__import__("module_inspector").extract_imported_packages(as_json=True)`;
    // const code = `import json,module_inspector;f=open("${pyTmpPath}","w");json.dump(module_inspector.extract_imported_packages(as_json=True),f);f.close()`;
    const code = `(lambda f: (__import__('json').dump(__import__('module_inspector').extract_imported_packages(as_json=True), f), f.close()))(open("${pyTmpPath}", "w"))`;


    try {
      await positron.runtime.executeCode(
        'python',
        code,
        false,
        undefined,
        positron.RuntimeCodeExecutionMode.Silent
      );
      
      await waitForFile(tmpPath);
      const contents = fs.readFileSync(tmpPath, 'utf-8');
    
      let parsed: any;
      try {
        parsed = JSON.parse(contents);
      } catch (err) {
        console.error('Failed to parse JSON contents:', err);
        parsed = []; // fallback
      }
    
      // Force parsed into array
      if (!Array.isArray(parsed)) {
        parsed = [parsed];
      }
    
      console.log('Parsed Imported Packages:', parsed);
      const parsed1 = JSON.parse(parsed);
      return parsed1;
    } catch (error) {
      throw error;
    }
  }

  try {
    const pythonPath = await getPythonInterpreter();
    if (!pythonPath) {
      sidebarProvider.refresh([]);
      throw new Error('No Python interpreter found.');
    }

    // 1. Get pip list first
    const pipCmd = `"${pythonPath}" -m pip list --format json`;
    let pipPackagesRaw: string;
    try {
      const pipResult = await execPromise(pipCmd);
      pipPackagesRaw = pipResult.stdout;
    } catch (err: any) {
      // Check for missing pip error
      if (err.toString().includes("No module named pip")) {
        const choice = await vscode.window.showErrorMessage(
          "The current Python interpreter does not have pip installed. Would you like to install pip using ensurepip?",
          "Install pip"
        );
        if (choice === "Install pip") {
          try {
            await execPromise(`"${pythonPath}" -m ensurepip`);
            vscode.window.showInformationMessage("pip installed successfully. Please try refreshing again.");
            // Optionally, you can call refreshPackages again here
            return refreshPackages(sidebarProvider);
          } catch (ensureErr) {
            vscode.window.showErrorMessage("Failed to install pip using ensurepip.");
            sidebarProvider.refresh([]);
            throw ensureErr;
          }
        } else {
          vscode.window.showWarningMessage("Skipping package refresh since pip is missing.");
          sidebarProvider.refresh([]);
          return;
        }
      } else {
        throw err;
      }
    }

    const pipPackages: { name: string; version: string }[] = JSON.parse(pipPackagesRaw);

    // 2. Check if module_inspector is installed
    const isModuleInspectorInstalled = pipPackages.some(pkg => pkg.name.toLowerCase() === 'module-inspector');
    if (!isModuleInspectorInstalled) {
      const install = await vscode.window.showWarningMessage(
        "The 'module_inspector' package is missing. Would you like to install it now?",
        "Install"
      );
      if (install === 'Install') {
        await _installPythonPackage('module-inspector');
      } else {
        vscode.window.showWarningMessage('Skipping imported package detection.');
        sidebarProvider.refresh([]);
        return;
      }
    }

    // 3. Get imported packages
    const importedPackages = await getImportedPackages();

    // 4. Build sidebar model
    const locationType = pythonPath.toLowerCase().includes('venv')
      ? 'VirtualEnv'
      : pythonPath.toLowerCase().includes('conda')
        ? 'Conda'
        : 'Global';

    const pkgInfo: PyPackageInfo[] = pipPackages.map(pkg => {
      //TODO Important to map mismatches package name
      const importName = getImportName(pkg.name);
      const matchingImport = importedPackages.find(info =>
        info.module === importName || info.alias === importName
      );
      const loaded = matchingImport !== undefined;

      return {
        name: pkg.name,
        version: pkg.version,
        latestVersion: undefined,
        libpath: '',
        locationtype: locationType,
        title: pkg.name,
        loaded: loaded,
        tooltip: matchingImport
          ? matchingImport.alias
            ? `Module imported as ${matchingImport.alias}`
            : matchingImport.members?.length
              ? `Sub-modules imported: ${matchingImport.members.slice(0, 5).join(', ')}${matchingImport.members.length > 5 ? ', ...' : ''}`
              : 'Module imported'
          : pkg.name
      };
    });

    sidebarProvider.refresh(pkgInfo);
    console.log('Refreshed package sidebar.');
  } catch (error) {
    vscode.window.showErrorMessage('Failed to refresh installed packages.');
    sidebarProvider.refresh([]);
    console.error('Error refreshing packages:', error);
  }
}

/**
 * Register refresh command.
 */
export function registerRefreshCommand(sidebarProvider: SidebarProvider) {
  return vscode.commands.registerCommand('positron-python-package-manager.refreshImported', async () => {
    await refreshPackages(sidebarProvider);
    vscode.window.showInformationMessage('Imported packages refreshed.');
  });
}
