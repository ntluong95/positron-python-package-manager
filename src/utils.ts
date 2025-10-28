import * as vscode from "vscode";
import * as positron from "positron";
import * as fs from "fs";
import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { PackageMetadata } from "./extension";
import { ProjectNameRequirement } from "pip-requirements-js";
// import wretch from 'wretch';
// import { WretchError } from 'wretch/resolver';
// import fetch, { FormData } from 'node-fetch'

const wretch = require("wretch");
const { WretchError } = require("wretch/resolver");

wretch.polyfills({ fetch, FormData });

export const execPromise = promisify(exec);

export function getObserver(prefixMessage: string) {
  return (error: any) => {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(prefixMessage.replace("{0}", message));
  };
}

export async function _installPythonPackage(
  packageName: string
): Promise<void> {
  const pythonPath = await getPythonInterpreter();
  if (!pythonPath) {
    throw new Error("Python interpreter not found.");
  }

  const escapedPath = pythonPath.includes(" ") ? `"${pythonPath}"` : pythonPath;
  const installCmd = `${escapedPath} -m pip install --upgrade ${packageName}`;

  vscode.window.showInformationMessage(`Installing ${packageName}...`);

  try {
    const { stdout, stderr } = await execPromise(installCmd);
    console.log(`Install output:\n${stdout}`);
    if (stderr) {
      console.warn(`Install warnings:\n${stderr}`);
    }
    vscode.window.showInformationMessage(
      `✅ ${packageName} installed successfully.`
    );
  } catch (error: any) {
    console.error(`Error installing ${packageName}:`, error);
    vscode.window.showErrorMessage(
      `❌ Failed to install ${packageName}: ${error.message || error}`
    );
    throw error;
  }
}

/**
 * Gets Python interpreter from VSCode extension.
 */

interface PythonExtensionApi {
  ready: Promise<void>;
  settings: {
    getExecutionDetails(resource?: any): { execCommand: string[] | undefined };
  };
}

export async function getPythonInterpreter(): Promise<string | undefined> {
  const pythonExtension =
    vscode.extensions.getExtension<PythonExtensionApi>("ms-python.python");
  if (!pythonExtension) {
    vscode.window.showWarningMessage("Python extension not found.");
    return undefined;
  }
  if (!pythonExtension.isActive) {
    await pythonExtension.activate();
  }
  await pythonExtension.exports.ready;
  const execCommand =
    pythonExtension.exports.settings.getExecutionDetails()?.execCommand;
  const pythonPath = execCommand?.[0];
  console.log("Detected Python interpreter:", pythonPath);
  return pythonPath;
}

export function getImportName(packageName: string): string {
  // Check user-defined custom import mappings first
  const config = vscode.workspace.getConfiguration(
    "positron-python-package-manager"
  );
  const customMappings = config.get<Record<string, string>>(
    "customImportMappings",
    {}
  );

  if (customMappings[packageName]) {
    return customMappings[packageName];
  }

  // Fall back to built-in mappings
  // This list contains packages with package names different from import names
  const mappings: Record<string, string> = {
    beautifulsoup4: "bs4",
    boto3: "boto3",
    cryptography: "cryptography",
    django: "django",
    fastapi: "fastapi",
    "flask-sqlalchemy": "flask_sqlalchemy",
    "flask-wtf": "flask_wtf",
    "google-api-python-client": "googleapiclient",
    "google-cloud-storage": "google.cloud.storage",
    "ibis-framework": "ibis",
    ipython: "IPython",
    markupsafe: "markupsafe",
    "opencv-python": "cv2",
    paramiko: "paramiko",
    psycopg2: "psycopg2",
    pillow: "PIL",
    pydantic: "pydantic",
    pyopenssl: "OpenSSL",
    pymysql: "pymysql",
    pytest: "pytest",
    pyyaml: "yaml",
    "python-dateutil": "dateutil",
    "python-dotenv": "dotenv",
    "scikit-learn": "sklearn",
    sqlalchemy: "sqlalchemy",
    twilio: "twilio",
    ujson: "ujson",
  };

  return mappings[packageName] || packageName;
}

/** Fetching package metadata with a caching layer. */
export const outputChannel = vscode.window.createOutputChannel(
  "Positron Python Package Manager"
);

export class PyPI {
  constructor(
    public cache: Map<string, () => Promise<PackageMetadata>> = new Map()
  ) {}

  public async fetchPackageMetadata(
    requirement: ProjectNameRequirement
  ): Promise<PackageMetadata> {
    if (!this.cache.has(requirement.name)) {
      this.cache.set(requirement.name, async () => {
        let metadata: PackageMetadata;
        try {
          metadata = await wretch(
            `https://pypi.org/pypi/${requirement.name}/json`
          )
            .get()
            .json();
        } catch (err: unknown) {
          const e = err as any;
          if (e instanceof WretchError) {
            switch (e.status) {
              case 404:
                throw new Error(`Package not found in PyPI`);
              default:
                throw new Error(
                  `Unexpected ${e.status} response from PyPI: ${e.json}`
                );
            }
          }
          this.cache.delete(requirement.name);
          outputChannel.appendLine(
            `Error fetching package metadata for ${requirement.name} - ${
              (e as Error).stack || e
            }`
          );
          throw new Error("Cannot connect to PyPI");
        }
        return metadata;
      });
    }
    return await this.cache.get(requirement.name)!();
  }

  public clear() {
    this.cache.clear();
  }
}

/**
 * Waits for a file to appear in the file system, periodically checking for its
 * existence until a timeout is reached or the file is found.
 * @param filePath The path to the file to wait for.
 * @param timeout The maximum time to wait for the file to appear, in milliseconds.
 * @returns A promise that resolves when the file is found or rejects when the
 * timeout is reached.
 */
export async function waitForFile(
  filePath: string,
  timeout = 1000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const interval = setInterval(() => {
      if (fs.existsSync(filePath)) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - start > timeout) {
        clearInterval(interval);
        const error = new Error(
          vscode.l10n.t("Timeout waiting for file: {0}", filePath)
        );
        vscode.window.showErrorMessage(error.message);
        reject(error);
      }
    }, 100);
  });
}

/**
 * Checks if a given library path is writeable by attempting to write a temporary
 * file in the directory and then deleting it. If the operation is successful, the
 * function returns true; otherwise, it returns false.
 * @param libPath The path to check for writeability.
 * @returns true if the library path is writeable; otherwise, false.
 */
export function isLibPathWriteable(libPath: string): boolean {
  try {
    const stat = fs.statSync(libPath);
    if (!stat.isDirectory()) {
      return false;
    }
  } catch {
    return false; // path doesn’t exist or is inaccessible
  }

  const probe = join(libPath, `.__write_test_${process.pid}_${Date.now()}`);
  try {
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}
