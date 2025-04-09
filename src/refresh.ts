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
// function parsePipShow(output: string): Map<string, { location: string; summary: string }> {
//     const infoMap = new Map<string, { location: string; summary: string }>();
//     const blocks = output.split(/\n(?=Name: )/);

//     for (const block of blocks) {
//         const nameMatch = block.match(/^Name:\s*(.+)$/m);
//         const locationMatch = block.match(/^Location:\s*(.+)$/m);
//         const summaryMatch = block.match(/^Summary:\s*(.+)$/m);

//         if (nameMatch) {
//             const name = nameMatch[1];
//             const location = locationMatch ? locationMatch[1] : '';
//             const summary = summaryMatch ? summaryMatch[1] : '';
//             infoMap.set(name, { location, summary });
//         }
//     }

//     return infoMap;
// }

// Main function: Refresh packages
export async function refreshPackages(sidebarProvider: SidebarProvider): Promise<void> {
    try {
        const pythonPath = await getPythonInterpreter();
        if (!pythonPath) {
            vscode.window.showWarningMessage('⚠️ Cannot find Python executable.');
            sidebarProvider.refresh([]);
            return;
        }

        let pipOut = '';
        let outdatedOut = '';
        let modulesOut = '';

        try {
            const pipResult = await execPromise(`"${pythonPath}" -m pip list --format json`);
            pipOut = pipResult.stdout;

            const outdatedResult = await execPromise(`"${pythonPath}" -m pip list --outdated --format json`);
            outdatedOut = outdatedResult.stdout;
        } catch (err) {
            vscode.window.showErrorMessage(`❌ Failed to run pip list: ${(err as Error).message}`);
            console.error(err);
            sidebarProvider.refresh([]);
            return;
        }

        try {
            const modulesResult = await execPromise(`"${pythonPath}" -c "import sys, json; print(json.dumps(list(sys.modules.keys())))"`);
            modulesOut = modulesResult.stdout;
        } catch (err) {
            vscode.window.showWarningMessage('⚠️ Could not fetch currently loaded modules.');
            modulesOut = '[]';
        }

        if (!pipOut.trim()) {
            vscode.window.showInformationMessage('✅ No Python packages installed.');
            sidebarProvider.refresh([]);
            return;
        }

        const parsed: { name: string; version: string }[] = JSON.parse(pipOut);
        const outdatedParsed: { name: string; version: string; latest_version: string }[] = outdatedOut ? JSON.parse(outdatedOut) : [];

        const importedModules: string[] = JSON.parse(modulesOut);

        const outdatedMap = new Map<string, string>();
        outdatedParsed.forEach(pkg => {
            outdatedMap.set(pkg.name, pkg.latest_version);
        });

        const locationType = detectLocationType(pythonPath);

        const pkgInfo: PyPackageInfo[] = parsed.map(pkg => {
            const importName = getImportName(pkg.name);
            const isLoaded = importedModules.includes(importName);

            return {
                name: pkg.name,
                version: pkg.version,
                latestVersion: outdatedMap.get(pkg.name),   // ✅ latest version
                libpath: '',
                locationtype: locationType,
                title: pkg.name,
                loaded: isLoaded
            };
        });

        sidebarProvider.refresh(pkgInfo);

    } catch (err) {
        console.error(err);
        vscode.window.showErrorMessage('❌ Unexpected error while refreshing Python packages.');
        sidebarProvider.refresh([]);
    }
}

