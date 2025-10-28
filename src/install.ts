import * as vscode from 'vscode';
import * as positron from 'positron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { refreshPackages } from './refresh';
import {getPythonInterpreter, isLibPathWriteable } from './utils';
import { PyPackageItem, SidebarProvider } from './sidebar';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFilePromise = promisify(execFile);

// TODO: Provide two options to install package, either using python-envs.packages or pip install
// TODO: If install with UV for virtual environment, may need to first initialize the .venv first then run uv add packagename
export async function installPackages(sidebarProvider: SidebarProvider): Promise<void> {
    const pythonEnvCommand = vscode.commands.getCommands(true)
        .then(commands => commands.includes('python-envs.packages'));

    if (await pythonEnvCommand) {
        // ✅ Use Positron's Python Environment panel if available
        const resource = vscode.workspace.workspaceFolders?.[0]?.uri;
        try {
            await vscode.commands.executeCommand('python-envs.packages', resource);
            return;
        } catch (err) {
            console.error(err);
            vscode.window.showErrorMessage('❌ Failed to open installed packages list.');
        }
    }

    // ❌ Command not available or failed → Fallback to custom install
    await customInstallPackages(sidebarProvider);
}

// In-house fallback for pip install
async function customInstallPackages(sidebarProvider: SidebarProvider): Promise<void> {
    const packageName = await vscode.window.showInputBox({
        title: 'Install Python Packages',
        prompt: 'Enter package name(s) to install (separate multiple with space)',
        placeHolder: 'e.g., numpy pandas, or "loaded" for loaded packages',
        ignoreFocusOut: true
    });

    if (!packageName?.trim()) {
        return; // User cancelled
    }

    const pythonExtension = vscode.extensions.getExtension('ms-python.python');
    if (!pythonExtension) {
        vscode.window.showErrorMessage('Python extension not found.');
        return;
    }

    if (!pythonExtension.isActive) {
        await pythonExtension.activate();
    }

    const pythonExec = pythonExtension.exports.settings.getExecutionDetails().execCommand?.[0];
    if (!pythonExec) {
        vscode.window.showErrorMessage('No active Python interpreter found.');
        return;
    }

    // Check if the site-packages directory is writeable
    try {
        const { stdout } = await execFilePromise(pythonExec, ['-c', 'import site; print(site.getsitepackages()[0])']);
        const sitePackagesPath = stdout.trim();
        
        if (!isLibPathWriteable(sitePackagesPath)) {
            vscode.window.showErrorMessage(
                `❌ Cannot write to site-packages directory: ${sitePackagesPath}. ` +
                'You may need administrator/sudo privileges or use a virtual environment.'
            );
            return;
        }
    } catch (err: any) {
        console.warn('Could not verify site-packages writability:', err);
        // Continue with installation attempt
    }

    const packages = packageName.trim().split(/\s+/);

    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Installing ${packages.length > 1 ? 'packages' : 'package'}...`,
            cancellable: false
        }, async () => {
            await execFilePromise(pythonExec, ['-m', 'pip', 'install', ...packages]);
        });

        vscode.window.showInformationMessage(`✅ Successfully installed: ${packages.join(', ')}`);
        await refreshPackages(sidebarProvider);

    } catch (err: any) {
        vscode.window.showErrorMessage(`❌ Failed to install package(s): ${err.message}`);
    }
}


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

    // Check if the site-packages directory is writeable
    try {
        const { stdout } = await execFilePromise(pythonExec, ['-c', 'import site; print(site.getsitepackages()[0])']);
        const sitePackagesPath = stdout.trim();
        
        if (!isLibPathWriteable(sitePackagesPath)) {
            vscode.window.showErrorMessage(
                `❌ Cannot write to site-packages directory: ${sitePackagesPath}. ` +
                'You may need administrator/sudo privileges or use a virtual environment.'
            );
            return;
        }
    } catch (err: any) {
        console.warn('Could not verify site-packages writability:', err);
        // Continue with uninstallation attempt
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

export async function updatePackages(item: PyPackageItem | undefined, sidebarProvider: SidebarProvider): Promise<void> {
    if (!item) {
        vscode.window.showInformationMessage('No package selected to update.');
        return;
    }

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

    // Check if the site-packages directory is writeable
    try {
        const { stdout } = await execFilePromise(pythonExec, ['-c', 'import site; print(site.getsitepackages()[0])']);
        const sitePackagesPath = stdout.trim();
        
        if (!isLibPathWriteable(sitePackagesPath)) {
            vscode.window.showErrorMessage(
                `❌ Cannot write to site-packages directory: ${sitePackagesPath}. ` +
                'You may need administrator/sudo privileges or use a virtual environment.'
            );
            return;
        }
    } catch (err: any) {
        console.warn('Could not verify site-packages writability:', err);
        // Continue with update attempt
    }

    try {
        await execFilePromise(pythonExec, ['-m', 'pip', 'install', '--upgrade', item.pkg.name]);
        vscode.window.showInformationMessage(`✅ Updated ${item.pkg.name}`);
        await refreshPackages(sidebarProvider);
    } catch (err: any) {
        vscode.window.showErrorMessage(`❌ Failed to update ${item.pkg.name}: ${err.message}`);
    }
}
