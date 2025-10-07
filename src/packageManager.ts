// packageManager.ts
import * as vscode from "vscode";
import pLimit from "p-limit";
import { PyPI } from "./utils";
import { RequirementsParser } from "./parser";
import {
  outdatedDecorationType,
  upToDateDecorationType,
  getDecorationOptions,
} from "./decorations";
import * as semver from "semver";
import { ProjectNameRequirement } from "pip-requirements-js";

const pypi = new PyPI();
const requirementsParser = new RequirementsParser();
const concurrencyLimit = 10; // Increased from 5 for better performance
const limit = pLimit(concurrencyLimit);

// Debouncing map to prevent excessive decoration updates
const decorationTimeouts = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_DELAY = 300; // milliseconds

//NOTE Parse a dependency line from requirements.txt or pyproject.toml
function parsePackageLine(
  line: string,
  languageId: string
): { name: string; version: string | null } | null {
  line = line.trim();

  if (languageId === "pip-requirements") {
    const match = line.match(/^([\w\-\_]+)([=<>!~]+([\d\w.\-]+))?/);
    if (match) {
      return { name: match[1], version: match[3] || null };
    }
  } else if (languageId === "toml") {
    // Clean line
    if (line.endsWith(",")) line = line.slice(0, -1); // Remove trailing comma
    line = line.replace(/["']/g, ""); // Remove quotes

    const match = line.match(
      /^([\w\-]+(?:\[[\w\-]+\])?)([=<>!~]+([\d\w.\-]+))?/
    );
    if (match) {
      return { name: match[1], version: match[3] || null };
    }
  }

  return null;
}

//NOTE Main decoration function
export async function addVersionComparisonDecorations(
  document: vscode.TextDocument
) {
  const documentUri = document.uri.toString();

  // Clear existing timeout for this document
  if (decorationTimeouts.has(documentUri)) {
    clearTimeout(decorationTimeouts.get(documentUri)!);
  }

  // Set new timeout for debounced execution
  const timeoutId = setTimeout(async () => {
    decorationTimeouts.delete(documentUri);
    await performVersionComparisonDecorations(document);
  }, DEBOUNCE_DELAY);

  decorationTimeouts.set(documentUri, timeoutId);
}

//NOTE Actual decoration implementation
async function performVersionComparisonDecorations(
  document: vscode.TextDocument
) {
  const editor = vscode.window.visibleTextEditors.find(
    (editor) => editor.document === document
  );
  if (!editor) return;

  // Clear existing decorations immediately for better UX
  editor.setDecorations(outdatedDecorationType, []);
  editor.setDecorations(upToDateDecorationType, []);

  const text = document.getText();
  const lines = text.split("\n");

  const outdatedOptions: vscode.DecorationOptions[] = [];
  const upToDateOptions: vscode.DecorationOptions[] = [];

  let insideDependenciesBlock = false;

  const decorationPromises = lines.map((line, i) =>
    limit(async () => {
      // Early exit for empty lines and comments
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return;
      }

      let parsed = null;

      if (document.languageId === "pip-requirements") {
        parsed = parsePackageLine(line, document.languageId);
      } else if (document.languageId === "toml") {
        if (trimmed.startsWith("dependencies") && trimmed.includes("[")) {
          insideDependenciesBlock = true;
          return;
        }
        if (insideDependenciesBlock && trimmed.startsWith("]")) {
          insideDependenciesBlock = false;
          return;
        }
        if (insideDependenciesBlock) {
          parsed = parsePackageLine(line, document.languageId);
        }
      }

      if (parsed) {
        const requirement: ProjectNameRequirement = {
          name: parsed.name,
          type: "ProjectName",
        };
        try {
          const metadata = await pypi.fetchPackageMetadata(requirement);
          const latestVersion = metadata.info.version;
          const declaredVersion = parsed.version
            ? semver.coerce(parsed.version)?.version
            : null;
          const latestClean = semver.coerce(latestVersion)?.version;

          if (declaredVersion && latestClean) {
            const packageNameIndex = line.indexOf(parsed.name);
            const range = new vscode.Range(
              new vscode.Position(i, packageNameIndex),
              new vscode.Position(i, line.length)
            );

            if (semver.lt(declaredVersion, latestClean)) {
              outdatedOptions.push(
                getDecorationOptions(range, "outdated", document)
              );
            } else {
              upToDateOptions.push(
                getDecorationOptions(range, "up-to-date", document)
              );
            }
          }
        } catch (error) {
          console.error(`Failed fetching metadata for ${parsed.name}`, error);
        }
      }
    })
  );

  // Process all decoration promises
  await Promise.all(decorationPromises);

  // Apply decorations in a single batch for better performance
  editor.setDecorations(outdatedDecorationType, outdatedOptions);
  editor.setDecorations(upToDateDecorationType, upToDateOptions);
}
