// This file contains TS functions that call UV commands in the terminal.

import * as vscode from "vscode";
import { sendCommandToTerminal, getActivateCommand, getRemoveVenvCommand } from "./helpers";

export function uvBuildEnv(filename: string): void {
  try {
    vscode.window.showInformationMessage(`Activating environment from ${filename}.`);
    console.log(`Activating environment from ${filename}.`);

    sendCommandToTerminal(`deactivate`);
    sendCommandToTerminal(`uv venv --seed`);
    sendCommandToTerminal(getActivateCommand());
    uvInstallPackages(filename);
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
    
    // Deactivate any current environment
    // You might need a different command sequence if uv supports pyproject.toml differently.
    // For example, you can add a flag like --pyproject if supported by uv.
    // Adjust the following commands according to uv's specifications.
    sendCommandToTerminal(`deactivate`);
    sendCommandToTerminal(`uv sync`);
    sendCommandToTerminal(getActivateCommand());

    // Optionally, you could also call a function to install packages from pyproject.toml,
    // similar to uvInstallPackages, but adapted to the toml format.
  } catch (error) {
    vscode.window.showErrorMessage("Error activating environment from pyproject.toml file.");
    console.error(error);
  }
}


export function uvInstallPackages(filename: string): void {
  try {
    vscode.window.showInformationMessage(`Installing packages from ${filename}.`);
    console.log(`Installing packages from ${filename}.`);

    sendCommandToTerminal(`uv pip install -r "${filename}"`);
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
  sendCommandToTerminal(command);

  return result;
}

export function uvRemoveEnv(envName: string): void {
  try {
    const actualEnvName = ".venv"; // TODO: Make customizable
    vscode.window.showInformationMessage(`Deleting environment: ${actualEnvName}.`);
    console.log(`Deleting environment: ${actualEnvName}.`);

    sendCommandToTerminal("deactivate");
    sendCommandToTerminal(getRemoveVenvCommand());
  } catch (error) {
    vscode.window.showErrorMessage("Error deleting environment.");
    console.error(error);
  }
}
