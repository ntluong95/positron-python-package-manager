import * as vscode from 'vscode';
import * as positron from 'positron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SidebarProvider, PyPackageInfo } from './sidebar';
import { getObserver, getImportName, _installPythonPackage, getPythonInterpreter } from './utils';

export const execPromise = promisify(exec);

export interface ImportedPackageInfo {
  module: string;
  alias: string | null;
  members: string[];
}


/**
 * Checks if module_inspector is installed.
 */
async function isModuleInspectorInstalled(): Promise<boolean> {
  try {
    const result = await positron.runtime.executeCode(
      'python',
      `import module_inspector`,
      false,
      undefined,
      positron.RuntimeCodeExecutionMode.Silent
    );
    console.log('module_inspector is installed.');
    return true;
  } catch (error) {
    console.warn('module_inspector not found.');
    return false;
  }
}

/**
 * Retrieves imported packages using module_inspector.
 */
async function getImportedPackages(): Promise<ImportedPackageInfo[]> {
  const code = `from module_inspector import extract_imported_packages; extract_imported_packages(as_json=True)`;
  try {
    const output = await positron.runtime.executeCode(
      'python',
      code,
      true,
      undefined,
      positron.RuntimeCodeExecutionMode.Interactive
    );

    console.log('Output from module_inspector:', output);

    let outputStr: string | undefined;
    if (typeof output === 'string') {
      outputStr = output;
    } else if (output && typeof output["text/plain"] === 'string') {
      outputStr = output["text/plain"];
    } else {
      outputStr = JSON.stringify(output);
    }

    if (outputStr.startsWith("'") && outputStr.endsWith("'")) {
      outputStr = outputStr.slice(1, -1);
    }

    const parsed = JSON.parse(outputStr);

    if (!Array.isArray(parsed)) {
      console.warn('Imported packages result is not an array.');
      return [];
    }

    return parsed;
  } catch (error) {
    console.error('Failed to get imported packages:', error);
    throw error;
  }
}


/**
 * Refreshes installed and imported Python packages in sidebar.
 */
export async function refreshPackages(sidebarProvider: SidebarProvider): Promise<void> {
  const observer = getObserver('Error refreshing packages: {0}');
  try {
    const pythonPath = await getPythonInterpreter();
    if (!pythonPath) {
      sidebarProvider.refresh([]);
      throw new Error('No Python interpreter found.');
    }

    // 1. Check if module_inspector installed
    const installed = await isModuleInspectorInstalled();
    if (!installed) {
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

    // 2. Get pip list
    const pipCmd = `"${pythonPath}" -m pip list --format json`;
    const pipResult = await execPromise(pipCmd);
    const pipPackages: { name: string; version: string }[] = JSON.parse(pipResult.stdout);

    // 3. Get imported packages
    const importedPackages = await getImportedPackages();

    // 4. Build sidebar model
    const locationType = pythonPath.toLowerCase().includes('venv') ? 'VirtualEnv' : pythonPath.toLowerCase().includes('conda') ? 'Conda' : 'Global';

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
