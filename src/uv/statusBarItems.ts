// This file configures the status bar items.

import * as vscode from "vscode";
import { activeFileIsRequirementsTxt, activeFileIsPyProjectToml  } from "./helpers";

class CustomStatusBarItem {
  private statusBar: vscode.StatusBarItem;
  private loadingText: string;

  constructor(
    private defaultText: string,
    tooltip: string,
    command: string,
    private shouldDisplay: () => boolean, 
  ) {
    this.loadingText = this.defaultText + " $(loading~spin)";
    this.statusBar = vscode.window.createStatusBarItem();
    this.statusBar.text = defaultText;
    this.statusBar.tooltip = tooltip;
    this.statusBar.command = command;

    this.displayDefault();
  }

  displayDefault(): void {
    this.statusBar.text = this.defaultText;

    if (this.shouldDisplay()) {
      this.statusBar.show();
    } else {
      this.statusBar.hide();
    }
  }

  displayLoading(): void {
    this.statusBar.text = this.loadingText;
    this.statusBar.show();
  }
}

export const createEnvIcon = new CustomStatusBarItem(
  "$(tools) Build UV Env",
  "Build environment from opened file",
  "uv-wingman.buildEnvironment",
  () => activeFileIsRequirementsTxt() || activeFileIsPyProjectToml()
);

export const installPackagesIcon = new CustomStatusBarItem(
  "$(symbol-event) Install UV packages",
  "Install packages from opened file",
  "uv-wingman.installPackagesUV",
  () => activeFileIsRequirementsTxt()  // << Only show for requirements.txt
);

export const writeEnvIcon = new CustomStatusBarItem(
  "$(book) Write UV Requirements File",
  "Write the current environment to a requirements.txt file",
  "uv-wingman.writeRequirementsFile",
  () => activeFileIsRequirementsTxt() || activeFileIsPyProjectToml()
);

export const deleteEnvIcon = new CustomStatusBarItem(
  "$(trashcan) Remove UV Env",
  "Delete environment using the name derived from the opened file",
  "uv-wingman.deleteEnvironment",
  () => activeFileIsRequirementsTxt() || activeFileIsPyProjectToml()
);