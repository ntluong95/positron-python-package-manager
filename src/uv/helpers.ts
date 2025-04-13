// This file contains helpful utility functions.

import * as vscode from "vscode";
import * as os from "os";

export function getActivateCommand(): string {
  const platform = process.platform; // 'win32', 'darwin', 'linux'

  if (platform === "win32") {
    const termProgram = process.env.TERM_PROGRAM || "";
    const psModulePath = process.env.PSModulePath || "";

    if (termProgram.toLowerCase().includes("vscode") || psModulePath.length > 0) {
      // Likely PowerShell
      return ".venv\\Scripts\\Activate.ps1";
    } else {
      // Fallback: assume cmd
      return ".venv\\Scripts\\activate.bat";
    }
  } else {
    // Mac / Linux
    return "source .venv/bin/activate";
  }
}

export function getRemoveVenvCommand(): string {
  const platform = process.platform;

  if (platform === "win32") {
    const psModulePath = process.env.PSModulePath || "";
    if (psModulePath.length > 0) {
      // PowerShell
      return "Remove-Item -Recurse -Force .venv";
    } else {
      // Assume CMD
      return "rmdir /s /q .venv";
    }
  } else {
    // Linux or macOS
    return "rm -rf .venv";
  }
}

export function sendCommandToTerminal(command: string): void {
  let terminal = vscode.window.activeTerminal;

  if (!terminal) {
    vscode.window.showInformationMessage("No active terminal found. Creating new terminal.");
    terminal = vscode.window.createTerminal();
  }

  terminal.show();
  terminal.sendText(command);

  console.log(`Command '${command}' sent to terminal.`);
}

export function activeFileIsRequirementsTxt(): boolean {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return false;

  const activeFilename = editor.document.fileName.split(/[/\\]/).pop();
  const pattern = /^requirements.*\.txt$/i;

  return pattern.test(activeFilename ?? "");
}

export function activeFileIsPyProjectToml(): boolean {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return false;
  const filename = editor.document.fileName.split(/[/\\]/).pop();
  return /^pyproject\.toml$/i.test(filename ?? '');
}

export function getOpenDocumentPath(): string | null {
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) return null;

  let filename = activeEditor.document.fileName;
  console.log(`Filename is: ${filename}`);
  filename = filename.replace(/\\/g, "/");
  console.log(`Amended filename is: ${filename}`);

  return filename;
}
