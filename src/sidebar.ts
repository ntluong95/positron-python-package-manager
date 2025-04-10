import * as vscode from 'vscode';
import * as positron from 'positron';
import { filter } from 'fuzzaldrin-plus';
import { refreshPackages } from './refresh';
import { getImportName } from './utils'; 
import * as path from 'path'; 

export interface PyPackageInfo {
    name: string;
    version: string;
    latestVersion?: string;
    libpath: string;
    locationtype: string;
    title: string;
    loaded: boolean;
}

export class SidebarProvider implements vscode.TreeDataProvider<PyPackageItem> {
    private filterText: string = '';
    private _onDidChangeTreeData: vscode.EventEmitter<PyPackageItem | undefined | void> = new vscode.EventEmitter();
    readonly onDidChangeTreeData: vscode.Event<PyPackageItem | undefined | void> = this._onDidChangeTreeData.event;

    private packages: PyPackageInfo[] = [];

    refresh(packages: PyPackageInfo[]): void {
        this.packages = packages;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: PyPackageItem): vscode.TreeItem {
        return element;
    }

    getChildren(): Thenable<PyPackageItem[]> {
        let filtered = this.packages;

        if (this.filterText.trim()) {
            const enriched = this.packages.map(pkg => ({
                pkg,
                query: `${pkg.name} ${pkg.title}`
            }));

            const matches = filter(enriched, this.filterText.trim(), {
                key: 'query'
            });

            filtered = matches.map(m => m.pkg);
        }

        if (filtered.length === 0) {
            return Promise.resolve([
                new PlaceholderItem(vscode.l10n.t("No Python package information available yet.")) as PyPackageItem,
                new PlaceholderItem(vscode.l10n.t("Try to refresh after Python starts or clear search.")) as PyPackageItem
            ]);
        }

        return Promise.resolve(filtered.map(pkg => new PyPackageItem(pkg)));
    }

    handleCheckboxChange(item: PyPackageItem, newState: vscode.TreeItemCheckboxState) {
        const isNowChecked = newState === vscode.TreeItemCheckboxState.Checked;

        // 🛠 Update internal model
        const target = this.packages.find(pkg => pkg.name === item.pkg.name);
        if (target) {
            target.loaded = isNowChecked;
        }

        const importName = getImportName(item.pkg.name);

        //TODO A default option is to load the whole package, but we can write an extension option to allow users define custom imports
        //TODO Provide an easier UX by right click on import statement -> add to list of common imports
        const code = isNowChecked
            ? `import ${importName}`
            : `# Unloading modules at runtime is unsafe.`; 

        positron.runtime.executeCode('python', code, true, undefined, positron.RuntimeCodeExecutionMode.Interactive)
            .then(() => {
                this._onDidChangeTreeData.fire(); 
            });
    }

    getFilter(): string {
        return this.filterText || '';
    }

    setFilter(filterText: string) {
        this.filterText = filterText;
        this._onDidChangeTreeData.fire();
    }

    getPackages(): PyPackageInfo[] {
        return this.packages;
    }
}

export class PyPackageItem extends vscode.TreeItem {
    constructor(public pkg: PyPackageInfo) {
        super(pkg.name, vscode.TreeItemCollapsibleState.None);

        const currentVersion = pkg.version;
        const latestVersion = pkg.latestVersion;

        const versionText = latestVersion && latestVersion !== currentVersion
            ? `${currentVersion} → ${latestVersion}` // shows version update
            : currentVersion;

        this.description = `${versionText} (${pkg.locationtype})`; 
        // this.tooltip = `${pkg.title}\n(${pkg.libpath})`;

        this.contextValue = latestVersion && latestVersion !== currentVersion
            ? 'canUpdate'
            : 'PyPackage';

        // this.iconPath = new vscode.ThemeIcon('circle-outline');

        this.iconPath = {
            light: vscode.Uri.file(
                path.join(__dirname, '..', 'resources', 'python_logo.svg')
            ),
            dark: vscode.Uri.file(
                path.join(__dirname, '..', 'resources', 'python_logo.svg')
            ),
        };

        this.checkboxState = pkg.loaded
            ? vscode.TreeItemCheckboxState.Checked
            : vscode.TreeItemCheckboxState.Unchecked;

        this.command = {
            command: 'positron-python-package-manager.openHelp',
            title: vscode.l10n.t('Open Package Help'),
            arguments: [pkg.name],
        };
    }
}

class PlaceholderItem extends vscode.TreeItem {
    constructor(message: string) {
        super(message, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('info');
        this.contextValue = 'placeholder';
    }
}
