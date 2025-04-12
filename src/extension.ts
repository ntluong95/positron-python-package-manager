import * as vscode from 'vscode';
import * as positron from 'positron';
import * as path from 'path';
import * as fs from 'fs';
import { refreshPackages } from './refresh';
import { refreshOutdatedPackages } from './update';
import { SidebarProvider, PyPackageItem } from './sidebar';
import { installPackages, uninstallPackage, updatePackages } from './install';
import { getChangeForegroundEvent } from './events';
import { getImportName, getPythonInterpreter } from './utils'; 

export function activate(context: vscode.ExtensionContext) {
    // --------------------------------------------------------------------------
    // Inline Missing Module Installer Setup
    // --------------------------------------------------------------------------

    // Create an output channel to log installation events.
    const outputChannel = vscode.window.createOutputChannel('Python Module Installer');
    context.subscriptions.push(outputChannel);

    // Register the command to install missing modules (triggered via a code action).
    const installModuleCommand = vscode.commands.registerCommand('extension.installModule', async (moduleName: string) => {
        const config = vscode.workspace.getConfiguration('inlinePythonPackageInstaller');
        // Read settings for auto-install and custom pip command
        // Get the current Python interpreter from the Python extension.
        const pythonPath = await getPythonInterpreter();
        if (!pythonPath) {
            vscode.window.showErrorMessage('Could not determine the Python interpreter.');
            return;
        }

        // On Windows, adjust the interpreter path if needed.
        let actualPythonPath = pythonPath;
        if (process.platform === 'win32') {
            // Check if the file exists. If not, try replacing "\bin\" with "\Scripts\".
            if (!fs.existsSync(actualPythonPath)) {
                if (actualPythonPath.toLowerCase().includes(`${path.sep}bin${path.sep}`)) {
                    const alternative = actualPythonPath.replace(new RegExp(`${path.sep}bin${path.sep}`, 'gi'), `${path.sep}Scripts${path.sep}`);
                    if (fs.existsSync(alternative)) {
                        actualPythonPath = alternative;
                    }
                }
            }
        }
        console.log('Using Python interpreter:', actualPythonPath);

        // Detect environment type for logging or further customization if needed.
        const locationType = actualPythonPath.toLowerCase().includes('venv')
            ? 'VirtualEnv'
            : actualPythonPath.toLowerCase().includes('conda')
                ? 'Conda'
                : 'Global';
        console.log(`Detected environment type: ${locationType}`);
        console.log('Using interpreter:', pythonPath);
        // Read settings for auto-install and custom pip command
        const autoInstall = config.get<boolean>('autoInstall', false);

        // Build an install command using the active interpreter, so that its pip is used.
        let installCommand: string;
        if (process.platform === 'win32') {
            installCommand = `& "${pythonPath}" -m pip install ${moduleName}`;
        } else {
            installCommand = `"${pythonPath}" -m pip install ${moduleName}`;
        }

        // Create a terminal and execute the install command.
        const terminal = vscode.window.createTerminal(`Install: ${moduleName}`);

        if (autoInstall) {
        terminal.sendText(installCommand);
        terminal.show();
        outputChannel.appendLine(`Installing module: ${moduleName} using ${locationType}`);
        } else {
        const selection = await vscode.window.showInformationMessage(
            `Module '${moduleName}' is missing. Would you like to install it?`,
            'Yes',
            'No'
        );
        if (selection === 'Yes') {
          terminal.sendText(installCommand);
          terminal.show();
          outputChannel.appendLine(`Installing module: ${moduleName}`);
        } else {
            outputChannel.appendLine(`Installation of module '${moduleName}' was declined.`);
        }
        }
    });
    context.subscriptions.push(installModuleCommand);

    // Register a Code Action provider to offer a quick-fix when an import is missing.
    const codeActionProvider = vscode.languages.registerCodeActionsProvider(
        { language: 'python', scheme: 'file' },
        new MissingImportProvider(outputChannel),
        { providedCodeActionKinds: MissingImportProvider.providedCodeActionKinds }
    );
    context.subscriptions.push(installModuleCommand, codeActionProvider);


    // --------------------------------------------------------------------------
    // Positron Python Package Manager Setup
    // --------------------------------------------------------------------------

    const sidebarProvider = new SidebarProvider();

    // 🔥 Refresh package list on runtime/session change
    context.subscriptions.push(
        // getRegisterRuntimeEvent(sidebarProvider),
        getChangeForegroundEvent(sidebarProvider)
    );

    console.log('Positron Python Package Manager extension activated!');

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

        vscode.commands.registerCommand('positron-python-package-manager.checkOutdatedPackages', async () => {
            await refreshOutdatedPackages(sidebarProvider);
        }),

        vscode.commands.registerCommand('positron-python-package-manager.openHelp', (pkgName: string) => {
            const importName = getImportName(pkgName);
            const pyCode = `import ${importName}; help(${importName})`;
            positron.runtime.executeCode('python', pyCode, false, undefined, positron.RuntimeCodeExecutionMode.Silent);
        })
    );
}




// --------------------------------------------------------------------------
// MissingImportProvider - Handles quick-fix suggestions for missing imports.
// --------------------------------------------------------------------------
class MissingImportProvider implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];
    private outputChannel: vscode.OutputChannel;
    constructor(outputChannel: vscode.OutputChannel) {
      this.outputChannel = outputChannel;
    }
  
    provideCodeActions(
      document: vscode.TextDocument, 
      range: vscode.Range | vscode.Selection,
      context: vscode.CodeActionContext,
      token: vscode.CancellationToken
    ): vscode.CodeAction[] | undefined {
      // Check if the line contains an import statement.
      const line = document.lineAt(range.start.line);
      const importMatch = line.text.match(/^import (\w+)|^from (\w+) import/);
      if (!importMatch) {
        return undefined;
      }
      const moduleName = importMatch[1] || importMatch[2];
      // Create a quick-fix action to install the missing module.
      const installAction = new vscode.CodeAction(
        `Install missing module '${moduleName}'`,
        vscode.CodeActionKind.QuickFix
      );
      installAction.command = {
        command: 'extension.installModule',
        title: 'Install Module',
        arguments: [moduleName]
      };
      return [installAction];
    }
  }

export function deactivate() {}