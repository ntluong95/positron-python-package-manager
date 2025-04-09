import * as vscode from 'vscode';
import * as positron from 'positron';

import { refreshPackages } from './refresh';
import { SidebarProvider, PyPackageItem } from './sidebar';
import { installPackages, uninstallPackage, updatePackages } from './install';
import { getChangeForegroundEvent, getRegisterRuntimeEvent } from './events';
import { getImportName } from './utils'; // ✅ Import mapping helper

export function activate(context: vscode.ExtensionContext) {
    const sidebarProvider = new SidebarProvider();

    // 🔥 Refresh package list on runtime/session change
    context.subscriptions.push(
        getRegisterRuntimeEvent(sidebarProvider),
        getChangeForegroundEvent(sidebarProvider)
    );

    // ✅ Initialize sidebar immediately
    sidebarProvider.refresh([]);

    console.log('✅ Positron Python Package Manager extension activated!');

    // 📦 Create sidebar tree
    const treeView = vscode.window.createTreeView('pythonPackageView', {
        treeDataProvider: sidebarProvider,
        showCollapseAll: false,
        canSelectMany: false
    });

    treeView.onDidChangeCheckboxState((event) => {
        for (const [item, newState] of event.items) {
            sidebarProvider.handleCheckboxChange(item, newState);
        }
    });

    treeView.onDidChangeVisibility((event) => {
        if (event.visible) {
            refreshPackages(sidebarProvider);
        }
    });

    context.subscriptions.push(treeView);

    // 📚 Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('positron-python-package-manager.refreshPackages', () => {
            refreshPackages(sidebarProvider);
        }),

        vscode.commands.registerCommand('positron-python-package-manager.searchPackages', async () => {
            const input = await vscode.window.showInputBox({
                prompt: vscode.l10n.t('Search Python packages — press Esc to clear filter, Enter to apply'),
                value: sidebarProvider.getFilter(),
                placeHolder: vscode.l10n.t('e.g. numpy, pandas'),
            });
            sidebarProvider.setFilter(input ?? '');
        }),

        vscode.commands.registerCommand('positron-python-package-manager.installPackages', () => {
            installPackages(sidebarProvider);
        }),

        vscode.commands.registerCommand('positron-python-package-manager.uninstallPackage', (item: PyPackageItem | undefined) => {
            uninstallPackage(item, sidebarProvider);
        }),

        vscode.commands.registerCommand('positron-python-package-manager.updatePackage', (item: PyPackageItem | undefined) => {
            updatePackages(item, sidebarProvider);
        }),

        vscode.commands.registerCommand('positron-python-package-manager.openHelp', (pkgName: string) => {
            const importName = getImportName(pkgName);
            const pyCode = `import ${importName}; help(${importName})`;
            positron.runtime.executeCode('python', pyCode, false, undefined, positron.RuntimeCodeExecutionMode.Silent);
        })
    );
}

export function deactivate() {}
