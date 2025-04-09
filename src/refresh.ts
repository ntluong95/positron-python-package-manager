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
        let modulesOut = '';

        try {
            const pipResult = await execPromise(`"${pythonPath}" -m pip list --format json`);
            pipOut = pipResult.stdout;
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
        const importedModules: string[] = JSON.parse(modulesOut);

        const locationType = detectLocationType(pythonPath);

        const pkgInfo: PyPackageInfo[] = parsed.map(pkg => {
            const importName = getImportName(pkg.name); // 🛠 Mapped correctly now
            const isLoaded = importedModules.includes(importName);

            return {
                name: pkg.name,
                version: pkg.version,
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