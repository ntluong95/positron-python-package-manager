// This file contains helpful utility functions.

import * as vscode from "vscode";

const UV_TERMINAL_NAME = "PyPkgMan UV";

function detectShellType(): "powershell" | "cmd" | "posix" {
  const shell = (
    process.env.SHELL ||
    process.env.ComSpec ||
    process.env.TERM_PROGRAM ||
    ""
  ).toLowerCase();

  if (
    shell.includes("bash") ||
    shell.includes("zsh") ||
    shell.includes("sh")
  ) {
    return "posix";
  }

  if (
    shell.includes("pwsh") ||
    shell.includes("powershell") ||
    (process.env.PSModulePath || "").length > 0
  ) {
    return "powershell";
  }

  return process.platform === "win32" ? "cmd" : "posix";
}

export function getActivateCommand(): string {
  if (process.platform !== "win32") {
    return "source .venv/bin/activate";
  }

  const shellType = detectShellType();
  if (shellType === "powershell") {
    return ".\\.venv\\Scripts\\Activate.ps1";
  }
  if (shellType === "posix") {
    return "source .venv/Scripts/activate";
  }
  return "call .venv\\Scripts\\activate.bat";
}

export function getRemoveVenvCommand(): string {
  if (process.platform !== "win32") {
    return "rm -rf .venv";
  }

  const shellType = detectShellType();
  if (shellType === "powershell") {
    return "Remove-Item -Recurse -Force .venv";
  }
  if (shellType === "posix") {
    return "rm -rf .venv";
  }
  return "rmdir /s /q .venv";
}

export function getOrCreateUvTerminal(): vscode.Terminal {
  const existing = vscode.window.terminals.find(
    (terminal) => terminal.name === UV_TERMINAL_NAME
  );
  if (existing) {
    return existing;
  }
  return vscode.window.createTerminal(UV_TERMINAL_NAME);
}

export function sendCommandToTerminal(
  command: string,
  terminal?: vscode.Terminal
): vscode.Terminal {
  const targetTerminal = terminal ?? getOrCreateUvTerminal();
  targetTerminal.show();
  targetTerminal.sendText(command);
  console.log(`Command '${command}' sent to terminal '${targetTerminal.name}'.`);
  return targetTerminal;
}

export function sendCommandsToTerminal(commands: string[]): vscode.Terminal {
  const terminal = getOrCreateUvTerminal();
  terminal.show();
  for (const command of commands) {
    terminal.sendText(command);
    console.log(`Command '${command}' sent to terminal '${terminal.name}'.`);
  }
  return terminal;
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
