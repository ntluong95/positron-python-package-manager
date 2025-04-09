import * as vscode from 'vscode';
import * as positron from 'positron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { refreshPackages } from './refresh';
import { PyPackageItem, SidebarProvider } from './sidebar';
import { stripAnsi, getFilterRedundant } from './utils';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFilePromise = promisify(execFile);

/**
 * Just trigger the Python Envs built-in command to view installed packages.
 */
export async function installPackages(sidebarProvider: SidebarProvider): Promise<void> {
    try {
        const resource = vscode.workspace.workspaceFolders?.[0]?.uri; // optional: workspace-specific
        await vscode.commands.executeCommand('python-envs.packages', resource);
    } catch (err) {
        console.error(err);
        vscode.window.showErrorMessage('❌ Failed to open installed packages list.');
    }
}

/**
 * You can still leave uninstallPackage and updatePackages normally if you want,
 * or also remove them if everything should be delegated to MS Python extension!
 */
export async function uninstallPackage(item: PyPackageItem | undefined, sidebarProvider: SidebarProvider): Promise<void> {
    if (!item) {
        const all = sidebarProvider.getPackages?.();
        if (!all || all.length === 0) {
            vscode.window.showInformationMessage('No Python packages available to uninstall.');
            return;
        }

        const selection = await vscode.window.showQuickPick(
            all.map(pkg => ({
                label: `${pkg.name} ${pkg.version}`,
                description: pkg.title,
                pkg
            })),
            {
                title: 'Select a package to uninstall',
                placeHolder: 'Choose a package to uninstall',
                ignoreFocusOut: true
            }
        );

        if (!selection) {
            return;
        }

        item = { pkg: selection.pkg } as PyPackageItem;
    }

    // 🧠 Get correct python interpreter via ms-python.python extension
    const pythonExtension = vscode.extensions.getExtension('ms-python.python');
    if (!pythonExtension) {
        vscode.window.showErrorMessage('⚠️ Python extension not found.');
        return;
    }

    if (!pythonExtension.isActive) {
        await pythonExtension.activate();
    }

    const pythonExec = pythonExtension.exports.settings.getExecutionDetails().execCommand?.[0];
    if (!pythonExec) {
        vscode.window.showErrorMessage('⚠️ No active Python interpreter found.');
        return;
    }

    try {
        // 🚀 Run pip uninstall silently
        await execFilePromise(pythonExec, ['-m', 'pip', 'uninstall', '-y', item.pkg.name]);

        vscode.window.showInformationMessage(`✅ Successfully uninstalled ${item.pkg.name}`);
        sidebarProvider.refresh(await sidebarProvider.getPackages());

    } catch (err: any) {
        vscode.window.showErrorMessage(`❌ Failed to uninstall ${item.pkg.name}: ${err.message}`);
    }
}

export async function updatePackages(sidebarProvider: SidebarProvider): Promise<void> {
    // Optional: leave empty if you want no update handling anymore
}
