// This file contains TS functions that call UV commands in the terminal.

import * as vscode from "vscode";
import * as path from "path";
import {
  sendCommandsToTerminal,
  getActivateCommand,
  getRemoveVenvCommand,
} from "./helpers";

function getCdCommand(targetPath: string): string {
  return `cd "${targetPath}"`;
}

export function uvBuildEnv(filename: string): void {
  try {
    vscode.window.showInformationMessage(`Activating environment from ${filename}.`);
    console.log(`Activating environment from ${filename}.`);

    const fileDir = path.dirname(filename);
    const fileBase = path.basename(filename);
    sendCommandsToTerminal([
      getCdCommand(fileDir),
      "uv venv --seed",
      getActivateCommand(),
      `uv pip install -r "${fileBase}"`,
    ]);
  } catch (error) {
    vscode.window.showErrorMessage("Error activating environment from requirements file.");
    console.error(error);
  }
}

/**
 * A new function to build the environment from a pyproject.toml file.
 */
export function uvBuildEnvPyProject(filename: string): void {
  try {
    vscode.window.showInformationMessage(`Activating environment from pyproject.toml at ${filename}.`);
    console.log(`Activating environment from pyproject.toml at ${filename}.`);

    const fileDir = path.dirname(filename);
    sendCommandsToTerminal([
      getCdCommand(fileDir),
      "uv sync",
      getActivateCommand(),
    ]);
  } catch (error) {
    vscode.window.showErrorMessage("Error activating environment from pyproject.toml file.");
    console.error(error);
  }
}


export function uvInstallPackages(filename: string): void {
  try {
    vscode.window.showInformationMessage(`Installing packages from ${filename}.`);
    console.log(`Installing packages from ${filename}.`);

    const fileDir = path.dirname(filename);
    const fileBase = path.basename(filename);
    sendCommandsToTerminal([
      getCdCommand(fileDir),
      `uv pip install -r "${fileBase}"`,
    ]);
  } catch (error) {
    vscode.window.showErrorMessage("Error installing packages from requirements file.");
    console.error(error);
  }
}

export async function uvWriteRequirements(defaultValue: string): Promise<string | undefined> {
  const result = await vscode.window.showInputBox({
    value: defaultValue,
    placeHolder: "Name of the requirements.txt file",
    validateInput: (text) => {
      if (!text) return "You cannot leave this empty!";
      if (!text.toLowerCase().endsWith(".txt")) {
        return "Only .txt files are supported!";
      }
      return null;
    },
  });

  if (!result) {
    vscode.window.showErrorMessage("Cannot create requirements file without a name.");
    return;
  }

  vscode.window.showInformationMessage(`Creating requirements file: '${result}'.`);
  console.log(`Creating requirements file: '${result}'.`);

  const command = `uv pip freeze > "${result}"`;
  sendCommandsToTerminal([command]);

  return result;
}

export function uvRemoveEnv(envName: string): void {
  try {
    const actualEnvName = ".venv"; // TODO: Make customizable
    vscode.window.showInformationMessage(`Deleting environment: ${actualEnvName}.`);
    console.log(`Deleting environment: ${actualEnvName}.`);

    sendCommandsToTerminal([getRemoveVenvCommand()]);
  } catch (error) {
    vscode.window.showErrorMessage("Error deleting environment.");
    console.error(error);
  }
}
