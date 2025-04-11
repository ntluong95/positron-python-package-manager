import * as vscode from 'vscode';
import { SidebarProvider, PyPackageItem } from './sidebar';
import { getPythonInterpreter, execPromise } from './refresh';
import { exec } from 'child_process';
import { promisify } from 'util';

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


