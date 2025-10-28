import * as vscode from "vscode";
import * as positron from "positron";
import { filter } from "fuzzaldrin-plus";
import { refreshPackages } from "./refresh";
import { getImportName } from "./utils";
import * as path from "path";

export interface PyPackageInfo {
  name: string;
  version: string;
  latestVersion?: string;
  libpath: string;
  locationtype: string;
  title: string;
  loaded: boolean;
  tooltip?: string;
}

export class SidebarProvider implements vscode.TreeDataProvider<PyPackageItem> {
  private filterText: string = "";
  private showOnlyLoadedPackages: boolean = false;
  private _onDidChangeTreeData: vscode.EventEmitter<
    PyPackageItem | undefined | void
  > = new vscode.EventEmitter();
  readonly onDidChangeTreeData: vscode.Event<PyPackageItem | undefined | void> =
    this._onDidChangeTreeData.event;

  private packages: PyPackageInfo[] = [];

  refresh(packages: PyPackageInfo[]): void {
    this.packages = packages;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: PyPackageItem): vscode.TreeItem {
    return element;
  }

  private filterLoadedPackages(packages: PyPackageInfo[]): PyPackageInfo[] {
    return packages.filter((pkg) => pkg.loaded);
  }

  getChildren(): Thenable<PyPackageItem[]> {
    let filtered: PyPackageInfo[] = this.packages;

    // Apply showOnlyLoadedPackages filter first
    if (this.showOnlyLoadedPackages) {
      filtered = this.filterLoadedPackages(filtered);
    }

    // Then apply text filter if present
    if (this.filterText.trim()) {
      const enriched = filtered.map((pkg) => ({
        pkg,
        query: `${pkg.name} ${pkg.title}`,
      }));

      if (this.filterText.trim() === "loaded") {
        filtered = this.filterLoadedPackages(filtered);
      } else {
        const matches = filter(enriched, this.filterText.trim(), {
          key: "query",
        });

        filtered = matches.map((m) => m.pkg);
      }
    }

    if (filtered.length === 0) {
      return Promise.resolve([
        new PlaceholderItem(
          vscode.l10n.t("No Python package information available yet.")
        ) as PyPackageItem,
        new PlaceholderItem(
          vscode.l10n.t("Try to refresh after Python starts or clear search.")
        ) as PyPackageItem,
      ]);
    }

    return Promise.resolve(filtered.map((pkg) => new PyPackageItem(pkg)));
  }

  handleCheckboxChange(
    item: PyPackageItem,
    newState: vscode.TreeItemCheckboxState
  ) {
    const isNowChecked = newState === vscode.TreeItemCheckboxState.Checked;

    // 🛠 Update internal model
    const target = this.packages.find((pkg) => pkg.name === item.pkg.name);
    if (target) {
      target.loaded = isNowChecked;
    }

    const importName = getImportName(item.pkg.name);

    // Get custom import command from configuration if defined
    const config = vscode.workspace.getConfiguration(
      "positron-python-package-manager"
    );
    const customImports = config.get<Record<string, string>>(
      "customImportCommands",
      {}
    );
    const customImportCode = customImports[item.pkg.name];

    const code = isNowChecked
      ? customImportCode || `import ${importName}`
      : `del ${importName}`;

    positron.runtime
      .executeCode(
        "python",
        code,
        true,
        undefined,
        positron.RuntimeCodeExecutionMode.Interactive
      )
      .then(() => {
        this._onDidChangeTreeData.fire();
      });
  }

  getFilter(): string {
    return this.filterText || "";
  }

  setFilter(filterText: string) {
    this.filterText = filterText;
    this._onDidChangeTreeData.fire();
  }

  getPackages(): PyPackageInfo[] {
    return this.packages;
  }

  toggleShowOnlyLoadedPackages() {
    this.showOnlyLoadedPackages = !this.showOnlyLoadedPackages;
    this._onDidChangeTreeData.fire();
  }
}

// The UI how it looks
export class PyPackageItem extends vscode.TreeItem {
  constructor(public pkg: PyPackageInfo) {
    super(pkg.name, vscode.TreeItemCollapsibleState.None);

    const currentVersion = pkg.version;
    const latestVersion = pkg.latestVersion;

    let versionText = `${currentVersion}`;
    if (latestVersion && latestVersion !== currentVersion) {
      versionText = `${currentVersion} ⭡ ${latestVersion}`;
    }

    this.description = `${versionText} (${pkg.locationtype})`;

    this.contextValue =
      latestVersion && latestVersion !== currentVersion
        ? "canUpdate"
        : "PyPackage";

    if (latestVersion && latestVersion !== currentVersion) {
      this.iconPath = new vscode.ThemeIcon("arrow-up");
    } else if (pkg.loaded) {
      this.iconPath = {
        light: vscode.Uri.file(
          path.join(__dirname, "..", "resources", "python_loaded.svg")
        ),
        dark: vscode.Uri.file(
          path.join(__dirname, "..", "resources", "python_loaded.svg")
        ),
      };
    } else {
      this.iconPath = {
        light: vscode.Uri.file(
          path.join(__dirname, "..", "resources", "python_logo.svg")
        ),
        dark: vscode.Uri.file(
          path.join(__dirname, "..", "resources", "python_logo.svg")
        ),
      };
    }

    this.checkboxState = pkg.loaded
      ? vscode.TreeItemCheckboxState.Checked
      : vscode.TreeItemCheckboxState.Unchecked;

    // this.tooltip = pkg.tooltip ?? pkg.title;
    const tooltipContent = new vscode.MarkdownString();
    tooltipContent.appendMarkdown(`${pkg.name} v${pkg.version}\n`);
    tooltipContent.appendMarkdown(`Location: ${pkg.locationtype}\n\n`);
    tooltipContent.appendMarkdown(`${pkg.tooltip ?? ""}\n\n`);
    tooltipContent.appendMarkdown(
      `[View on PyPI](https://pypi.org/project/${pkg.name}/)\n`
    );

    if (pkg.loaded) {
      const importName = getImportName(pkg.name);
      tooltipContent.appendMarkdown(
        `\nImported as: ${
          importName === pkg.name ? `[${pkg.name}]` : importName
        }`
      );
    }

    this.tooltip = tooltipContent;
    this.tooltip.isTrusted = true;

    this.command = {
      command: "positron-python-package-manager.openHelp",
      title: vscode.l10n.t("Open Package Help"),
      arguments: [pkg.name],
    };
  }
}

class PlaceholderItem extends vscode.TreeItem {
  constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon("info");
    this.contextValue = "placeholder";
  }
}
