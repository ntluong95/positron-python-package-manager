import * as vscode from 'vscode';
import { IPackageManager, PackageVersionInfo } from './pkgmanager'; 

export class PackageItem extends vscode.TreeItem {
    constructor(public readonly pkg: PackageVersionInfo) {
        super(pkg.name, vscode.TreeItemCollapsibleState.None);

        const currentVersion = pkg.version;
        const latestVersion = pkg.latestVersion;
        
        // Show 'current → latest' if outdated
        if (latestVersion && latestVersion !== currentVersion) {
            this.description = `${currentVersion} → ${latestVersion}`;
            this.contextValue = 'canUpdate';
        } else {
            this.description = currentVersion;
        }

        this.tooltip = `${pkg.name}\nCurrent: ${currentVersion}${latestVersion ? `\nLatest: ${latestVersion}` : ''}`;
        this.iconPath = new vscode.ThemeIcon('circle-outline');
    }
}

export class PackageTreeDataProvider implements vscode.TreeDataProvider<PackageItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<PackageItem | undefined | null | void> = new vscode.EventEmitter();
    readonly onDidChangeTreeData: vscode.Event<PackageItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private packageManager: IPackageManager) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: PackageItem): vscode.TreeItem {
        return element;
    }

    async getChildren(): Promise<PackageItem[]> {
        const packages = await this.packageManager.getPackageListWithUpdate();
        return packages.map((pkg: PackageVersionInfo) => new PackageItem(pkg));
    }
}
