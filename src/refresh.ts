// src/refresh.ts
import * as vscode from 'vscode';
import * as positron from 'positron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SidebarProvider, PyPackageInfo } from './sidebar';
import { getImportName, waitForFile } from './utils';

export const execPromise = promisify(exec);

interface PythonExtensionApi {
    ready: Promise<void>;
    settings: {
        getExecutionDetails(resource?: any): { execCommand: string[] | undefined };
    };
}

interface ImportedPackageInfo {
    module: string;
    alias: string | null;
    members: string[];
}

/**
 * Detects the type of Python installation (VirtualEnv, Conda, or Global)
 * based on the provided pythonPath.
 */
function detectLocationType(pythonPath: string): string {
    const pathLower = pythonPath.toLowerCase();
    if (pathLower.includes('venv') || pathLower.includes('.venv') || pathLower.includes('env')) {
        return 'VirtualEnv';
    }
    if (pathLower.includes('conda')) {
        return 'Conda';
    }
    return 'Global';
}

/**
 * Retrieves the active Python interpreter command using the MS Python extension.
 */
export async function getPythonInterpreter(): Promise<string | undefined> {
    const pythonExtension = vscode.extensions.getExtension<PythonExtensionApi>('ms-python.python');
    if (!pythonExtension) {
        vscode.window.showWarningMessage('Python extension not found.');
        return undefined;
    }
    if (!pythonExtension.isActive) {
        await pythonExtension.activate();
    }
    await pythonExtension.exports.ready;
    const execCommand = pythonExtension.exports.settings.getExecutionDetails()?.execCommand;
    // const pythonPath = execCommand?.join(' ');
    const pythonPath = execCommand?.[0];
    console.log("Detected Python interpreter:", pythonPath);
    return pythonPath;
}

/**
 * Executes a Python snippet in interactive mode to get the list of imported packages.
 *
 * The executed Python code is:
 *   from module_inspector import extract_imported_packages
 *   print(extract_imported_packages(as_json=True))
 *
 * Returns the parsed JSON output.
 */
async function getImportedPackages(): Promise<ImportedPackageInfo[]> {
    const code = `from module_inspector import extract_imported_packages; extract_imported_packages(as_json=True)`.trim();
    try {
        const output = await positron.runtime.executeCode(
            'python',
            code,
            true,
            undefined,
            positron.RuntimeCodeExecutionMode.Interactive
        );

        console.log("Output from interactive package query (raw):", output);

        let outputStr: string | undefined;

        if (typeof output === "string") {
            outputStr = output;
        } else if (output && typeof output["text/plain"] === "string") {
            outputStr = output["text/plain"];
        } else {
            outputStr = JSON.stringify(output);
        }

        // Now outputStr is something like: "'[ ... ]'"
        if (outputStr.startsWith("'") && outputStr.endsWith("'")) {
            outputStr = outputStr.slice(1, -1); // Strip the outer single quotes
        }

        const parsed = JSON.parse(outputStr);

        if (!Array.isArray(parsed)) {
            console.warn("⚠️ Imported packages result is not an array:", parsed);
            return [];
        }

        console.log("✅ Imported packages parsed correctly:", parsed);
        return parsed;
    } catch (error) {
        vscode.window.showErrorMessage("Failed to query imported packages: " + error);
        console.error("Error in getImportedPackages:", error);
        return [];
    }
}


/**
 * Refreshes the list of installed packages.
 *
 * 1. Obtains the active Python interpreter command.
 * 2. Runs pip (in a separate process) to get all installed packages.
 * 3. Queries the interactive session for the list of imported packages.
 * 4. Updates the package "loaded" state and refreshes the SidebarProvider.
 */
export async function refreshPackages(sidebarProvider: SidebarProvider): Promise<void> {
    try {
        const pythonPath = await getPythonInterpreter();
        if (!pythonPath) {
            sidebarProvider.refresh([]);
            throw new Error("No Python interpreter found");
        }

        // 1. Get installed packages
        const pipCmd = `"${pythonPath}" -m pip list --format json`;
        console.log("Executing:", pipCmd);
        const pipResult = await execPromise(pipCmd);
        console.log("pip list output:", pipResult.stdout);
        const parsed: { name: string; version: string }[] = JSON.parse(pipResult.stdout);

        // 2. Get imported packages (now structured)
        const importedPackages: ImportedPackageInfo[] = await getImportedPackages();

        

        const locationType = detectLocationType(pythonPath);

        const currentState = new Map<string, boolean>();
        sidebarProvider.getPackages().forEach(pkg => {
            currentState.set(pkg.name, pkg.loaded);
        });

        const pkgInfo: PyPackageInfo[] = parsed.map(pkg => {
            const importName = getImportName(pkg.name);

            const matchingImport = importedPackages.find(info => 
                info.module === importName ||
                info.alias === importName ||
                info.module === pkg.name ||
                info.alias === pkg.name
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
                    ? `Module Imported as ${matchingImport.alias}`
                    : matchingImport.members?.length
                        // show only 5 sub-modules only
                        ? `Sub-modules: ${matchingImport.members.slice(0, 5).join(', ')}${matchingImport.members.length > 5 ? ', ...' : ''}`
                        : `Module Imported`
                : pkg.name
        };
    });
        

        console.log("Final package info:", pkgInfo);
        sidebarProvider.refresh(pkgInfo);

    } catch (err) {
        console.error("Error in refreshPackages:", err);
        vscode.window.showErrorMessage('❌ Failed to refresh installed packages.');
        sidebarProvider.refresh([]);
    }
}


/**
 * Registers the refresh command.
 */
export function registerRefreshCommand(sidebarProvider: SidebarProvider) {
    return vscode.commands.registerCommand("positron-python-package-manager.refreshImported", async () => {
        await refreshPackages(sidebarProvider);
        vscode.window.showInformationMessage("Imported packages refreshed.");
    });
}
