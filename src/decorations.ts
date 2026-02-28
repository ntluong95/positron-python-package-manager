// decoration.ts
import * as vscode from "vscode";

export let outdatedDecorationType: vscode.TextEditorDecorationType;
export let upToDateDecorationType: vscode.TextEditorDecorationType;
export let environmentMissingDecorationType: vscode.TextEditorDecorationType;

export function initializeDecoration() {
  outdatedDecorationType = vscode.window.createTextEditorDecorationType({
    after: {
      margin: "0",
      color: "rgb(224 108 117 / 50%)",
      fontStyle: "italic",
    },
  });

  upToDateDecorationType = vscode.window.createTextEditorDecorationType({
    after: {
      margin: "0",
      color: "rgb(34 200 147 / 50%)",
      fontStyle: "italic",
    },
  });

  environmentMissingDecorationType = vscode.window.createTextEditorDecorationType(
    {
      after: {
        margin: "0",
        color: "rgb(235 180 40 / 75%)",
        fontStyle: "italic",
      },
    }
  );
}

export function getDecorationOptions(
  range: vscode.Range,
  status: "outdated" | "up-to-date",
  document: vscode.TextDocument
): vscode.DecorationOptions {
  // Calculate the position to align decoration at column 80
  const lineText = document.lineAt(range.start.line).text;
  const lineLength = lineText.length;
  const targetColumn = 80;
  const spacesNeeded = Math.max(1, targetColumn - lineLength);
  const padding = " ".repeat(spacesNeeded);

  return {
    range,
    renderOptions: {
      after: {
        contentText: `${padding}${
          status === "outdated" ? "🟡 Outdated version" : "🟢 Updated version"
        }`,
      },
    },
  };
}

export function getEnvironmentMissingDecorationOptions(
  range: vscode.Range,
  document: vscode.TextDocument
): vscode.DecorationOptions {
  const lineText = document.lineAt(range.start.line).text;
  const lineLength = lineText.length;
  const targetColumn = 80;
  const spacesNeeded = Math.max(1, targetColumn - lineLength);
  const padding = " ".repeat(spacesNeeded);

  return {
    range,
    hoverMessage:
      "UV virtual environment is not installed. Create `.venv` with `uv venv` to enable accurate version decorations.",
    renderOptions: {
      after: {
        contentText: `${padding}⚠ UV virtual environment (.venv) not installed`,
      },
    },
  };
}
