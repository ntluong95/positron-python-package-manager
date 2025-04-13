// This file defines the commands that are available in the command palette.

import * as vscode from "vscode";
import * as path from "path";

import { activeFileIsRequirementsTxt, activeFileIsPyProjectToml, getOpenDocumentPath } from "./helpers";
import { uvBuildEnv, uvBuildEnvPyProject, uvInstallPackages, uvWriteRequirements, uvRemoveEnv } from "./uv_commands";
import { createEnvIcon, installPackagesIcon, writeEnvIcon, deleteEnvIcon } from "./statusBarItems";

/**
 * Builds an environment from a requirements.txt file.
 */
export function buildEnv(): void {
  const filenameForwardSlash = getOpenDocumentPath();
  const activeFilename = vscode.window.activeTextEditor?.document.fileName ?? "";

  if (activeFileIsRequirementsTxt()) {
    if (filenameForwardSlash) {
      uvBuildEnv(filenameForwardSlash);
    }
    createEnvIcon.displayDefault();
  } else if (activeFileIsPyProjectToml()) {
    if (filenameForwardSlash) {
      // You might define a new function, e.g. uvBuildEnvPyProject, that behaves accordingly
      uvBuildEnvPyProject(filenameForwardSlash);
    }
    createEnvIcon.displayDefault();
  } else {
    const fileExt = path.extname(activeFilename);
    vscode.window.showErrorMessage(
      `Cannot build environment from a ${fileExt} file. Only requirements.txt or pyproject.toml files are supported.`
    );
  }
}



/**
 * Installs packages from a requirements.txt file.
 */
export function installPackagesUV(): void {
  const filenameForwardSlash = getOpenDocumentPath();
  const activeFilename = vscode.window.activeTextEditor?.document.fileName ?? "";

  if (activeFileIsRequirementsTxt() || activeFileIsPyProjectToml()) {
    if (filenameForwardSlash) {
      uvInstallPackages(filenameForwardSlash);
    }
    installPackagesIcon.displayDefault();
  } else {
    const fileExt = path.extname(activeFilename);
    vscode.window.showErrorMessage(
      `Cannot install packages from a ${fileExt} file. Only requirements.txt or pyproject.toml files are supported.`
    );
  }
}

/**
 * Writes a requirements.txt file from the active environment.
 */
export async function writeRequirements(): Promise<void> {
  const filepath = vscode.window.activeTextEditor?.document.fileName;
  let filename = filepath ? path.parse(filepath).base : "requirements.txt";

  if (!activeFileIsRequirementsTxt()) {
    filename = "requirements.txt";
  }

  const response = await uvWriteRequirements(filename);
  console.log("Response: ", response);

  console.log(
    `While the writeRequirements function has finished running,
     the uvWriteRequirements function might still be processing.`
  );

  writeEnvIcon.displayDefault();
}

/**
 * Deletes an environment by its name.
 */
export function removeEnv(): void {
  const activeFilename = vscode.window.activeTextEditor?.document.fileName ?? "";

  if (activeFileIsRequirementsTxt() || activeFileIsPyProjectToml()) {
    const envName = path.parse(activeFilename).name;
    uvRemoveEnv(envName);
    deleteEnvIcon.displayDefault();
  } else {
    const fileExt = path.extname(activeFilename);
    vscode.window.showErrorMessage(
      `Cannot delete environment from a ${fileExt} file. Only requirements.txt or pyproject.toml files are supported.`
    );
  }
}
