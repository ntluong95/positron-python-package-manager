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
        vscode.window.showWarningMessage('Python extension not found.');
        return undefined;
    }
    if (!pythonExtension.isActive) {
        await pythonExtension.activate();
    }
    await pythonExtension.exports.ready;
    const execCommand = pythonExtension.exports.settings.getExecutionDetails()?.execCommand;
    return execCommand?.join(' ');
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

// 🌟 Main function: Only installed packages
export async function refreshPackages(sidebarProvider: SidebarProvider): Promise<void> {
    try {
        const pythonPath = await getPythonInterpreter();
        if (!pythonPath) {
            sidebarProvider.refresh([]);
            return;
        }

        const pipResult = await execPromise(`"${pythonPath}" -m pip list --format json`);
        const modulesResult = await execPromise(`"${pythonPath}" -c "import sys, json; print(json.dumps(list(sys.modules.keys())))"`);

        const parsed: { name: string; version: string }[] = JSON.parse(pipResult.stdout);
        const importedModules: string[] = JSON.parse(modulesResult.stdout);

        const locationType = detectLocationType(pythonPath);

        const pkgInfo: PyPackageInfo[] = parsed.map(pkg => {
            const importName = getImportName(pkg.name);
            const isLoaded = importedModules.includes(importName);

            return {
                name: pkg.name,
                version: pkg.version,
                latestVersion: undefined,  // 🔥 We don't check outdated here yet
                libpath: '',
                locationtype: locationType,
                title: pkg.name,
                loaded: isLoaded
            };
        });

        sidebarProvider.refresh(pkgInfo);

    } catch (err) {
        console.error(err);
        vscode.window.showErrorMessage('❌ Failed to refresh installed packages.');
        sidebarProvider.refresh([]);
    }
}

// 🌟 New function: Fetch outdated packages manually
export async function refreshOutdatedPackages(sidebarProvider: SidebarProvider): Promise<void> {
    const pythonPath = await getPythonInterpreter();
    if (!pythonPath) {
        return;
    }

    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Checking for outdated packages...",
            cancellable: false
        }, async () => {
            const outdatedResult = await execPromise(`"${pythonPath}" -m pip list --outdated --format json`);
            const outdatedParsed: { name: string; latest_version: string }[] = JSON.parse(outdatedResult.stdout);

            const outdatedMap = new Map<string, string>();
            outdatedParsed.forEach(pkg => {
                outdatedMap.set(pkg.name, pkg.latest_version);
            });

            const updatedPkgInfo = sidebarProvider.getPackages().map(pkg => ({
                ...pkg,
                latestVersion: outdatedMap.get(pkg.name)
            }));

            sidebarProvider.refresh(updatedPkgInfo);
        });
    } catch (err) {
        console.error(err);
        vscode.window.showWarningMessage('⚠️ Failed to fetch outdated package info.');
    }
}


