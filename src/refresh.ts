import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SidebarProvider, PyPackageInfo } from './sidebar';
import { getImportName } from './utils';

const execPromise = promisify(exec);

interface PythonExtensionApi {
    ready: Promise<void>;
    settings: {
        getExecutionDetails(resource?: any): { execCommand: string[] | undefined };
    };
}

// Helper: detect VirtualEnv, Conda, or Global
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

// Helper: Get Python interpreter path
async function getPythonInterpreter(): Promise<string | undefined> {
    const pythonExtension = vscode.extensions.getExtension<PythonExtensionApi>('ms-python.python');

    if (!pythonExtension) {
        vscode.window.showWarningMessage('⚠️ Python extension not found.');
        return undefined;
    }

    if (!pythonExtension.isActive) {
        await pythonExtension.activate();
    }

    try {
        await pythonExtension.exports.ready;
    } catch {
        vscode.window.showWarningMessage('⚠️ Python extension failed to initialize.');
        return undefined;
    }

    const executionDetails = pythonExtension.exports.settings.getExecutionDetails();
    const execCommand = executionDetails?.execCommand;

    if (!execCommand || execCommand.length === 0) {
        vscode.window.showWarningMessage('⚠️ No Python interpreter configured.');
        return undefined;
    }

    return execCommand.join(' ');
}

// Helper: parse `pip show` output
function parsePipShow(output: string): Map<string, { location: string; summary: string }> {
    const infoMap = new Map<string, { location: string; summary: string }>();
    const blocks = output.split(/\n(?=Name: )/);

    for (const block of blocks) {
        const nameMatch = block.match(/^Name:\s*(.+)$/m);
        const locationMatch = block.match(/^Location:\s*(.+)$/m);
        const summaryMatch = block.match(/^Summary:\s*(.+)$/m);

        if (nameMatch) {
            const name = nameMatch[1];
            const location = locationMatch ? locationMatch[1] : '';
            const summary = summaryMatch ? summaryMatch[1] : '';
            infoMap.set(name, { location, summary });
        }
    }

    return infoMap;
}

// Main function: Refresh packages
export async function refreshPackages(sidebarProvider: SidebarProvider): Promise<void> {
    try {
        const pythonPath = await getPythonInterpreter();
        if (!pythonPath) {
            vscode.window.showWarningMessage('⚠️ Cannot find Python executable.');
            sidebarProvider.refresh([]);
            return;
        }

        let pipListOut = '';
        let pipOutdatedOut = '';
        let pipShowOut = '';
        let modulesOut = '';

        try {
            // 1. List all packages
            const pipListResult = await execPromise(`"${pythonPath}" -m pip list --format json`);
            pipListOut = pipListResult.stdout;

            // 2. List outdated
            const pipOutdatedResult = await execPromise(`"${pythonPath}" -m pip list --outdated --format json`);
            pipOutdatedOut = pipOutdatedResult.stdout;

            // 3. List loaded modules
            const modulesResult = await execPromise(`"${pythonPath}" -c "import sys, json; print(json.dumps(list(sys.modules.keys())))"`);
            modulesOut = modulesResult.stdout;
        } catch (err) {
            vscode.window.showErrorMessage(`❌ Failed to fetch installed or outdated packages: ${(err as Error).message}`);
            console.error(err);
            sidebarProvider.refresh([]);
            return;
        }

        const parsedList: { name: string; version: string }[] = JSON.parse(pipListOut);
        const parsedOutdated: { name: string; version: string; latest_version: string }[] = pipOutdatedOut ? JSON.parse(pipOutdatedOut) : [];
        const importedModules: string[] = JSON.parse(modulesOut);

        if (parsedList.length === 0) {
            vscode.window.showInformationMessage('✅ No Python packages installed.');
            sidebarProvider.refresh([]);
            return;
        }

        // Collect all package names
        const packageNames = parsedList.map(pkg => pkg.name);

        try {
            // 4. Batch pip show all packages (FAST)
            const pipShowResult = await execPromise(`"${pythonPath}" -m pip show ${packageNames.join(' ')}`);
            pipShowOut = pipShowResult.stdout;
        } catch (err) {
            vscode.window.showWarningMessage(`⚠️ Failed to fetch package metadata.`);
            pipShowOut = '';
        }

        const pipShowInfo = pipShowOut ? parsePipShow(pipShowOut) : new Map();

        const outdatedMap = new Map<string, string>();
        parsedOutdated.forEach(pkg => {
            outdatedMap.set(pkg.name, pkg.latest_version);
        });

        const locationType = detectLocationType(pythonPath);

        const pkgInfo: PyPackageInfo[] = parsedList.map(pkg => {
            const importName = getImportName(pkg.name);
            const isLoaded = importedModules.includes(importName);

            const showInfo = pipShowInfo.get(pkg.name);

            return {
                name: pkg.name,
                version: pkg.version,
                latestVersion: outdatedMap.get(pkg.name),
                libpath: showInfo?.location || '',
                locationtype: locationType,
                title: showInfo?.summary || pkg.name,  // fallback to package name if no summary
                loaded: isLoaded,
            };
        });

        sidebarProvider.refresh(pkgInfo);

    } catch (err) {
        console.error(err);
        vscode.window.showErrorMessage('❌ Unexpected error while refreshing Python packages.');
        sidebarProvider.refresh([]);
    }
}
