import * as vscode from 'vscode';
import * as positron from 'positron';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

export const execPromise = promisify(exec);

export function stripAnsi(text: string): string {
    return text.replace(/\x1b\[[0-9;]*m/g, '');
}

export function getFilterRedundant(): boolean {
    const config = vscode.workspace.getConfiguration(
        'positron-python-package-manager',
        vscode.Uri.file(vscode.workspace.workspaceFolders?.[0].uri.fsPath ?? "")
    );
    return config.get<boolean>('filterOutdatedIfUpToDateElsewhere', true);
}

export function getObserver(prefixMessage: string) {
    return (error: any) => {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(prefixMessage.replace('{0}', message));
    };
  }

export async function _installPythonPackage(packageName: string): Promise<void> {
    const pythonPath = await getPythonInterpreter();
    if (!pythonPath) {
      throw new Error('Python interpreter not found.');
    }
  
    const escapedPath = pythonPath.includes(' ') ? `"${pythonPath}"` : pythonPath;
    const installCmd = `${escapedPath} -m pip install --upgrade ${packageName}`;
  
    vscode.window.showInformationMessage(`Installing ${packageName}...`);
  
    try {
      const { stdout, stderr } = await execPromise(installCmd);
      console.log(`Install output:\n${stdout}`);
      if (stderr) {
        console.warn(`Install warnings:\n${stderr}`);
      }
      vscode.window.showInformationMessage(`✅ ${packageName} installed successfully.`);
    } catch (error: any) {
      console.error(`Error installing ${packageName}:`, error);
      vscode.window.showErrorMessage(`❌ Failed to install ${packageName}: ${error.message || error}`);
      throw error;
    }
}

export async function getPythonInterpreter(): Promise<string | undefined> {
    const pythonExtension = vscode.extensions.getExtension<any>('ms-python.python');
    if (!pythonExtension) {
      vscode.window.showWarningMessage('Python extension not found.');
      return undefined;
    }
    if (!pythonExtension.isActive) {
      await pythonExtension.activate();
    }
    const executionDetails = pythonExtension.exports.settings.getExecutionDetails();
    const pythonPath = executionDetails?.execCommand?.[0];
    console.log('Detected Python interpreter:', pythonPath);
    return pythonPath;
}

export function getImportName(packageName: string): string {
    //TODO: WIP 
    // This only list packages with package's name different with import name
    // Python module import can be in my variation and unpredict
    const mappings: Record<string, string> = {
        'beautifulsoup4': 'bs4',
        'boto3': 'boto3',
        'cryptography': 'cryptography',
        'django': 'django',
        'fastapi': 'fastapi',
        'flask-sqlalchemy': 'flask_sqlalchemy',
        'flask-wtf': 'flask_wtf',
        'google-api-python-client': 'googleapiclient',
        'google-cloud-storage': 'google.cloud.storage',
        'ibis-framework': 'ibis',
        'ipython': 'IPython',
        'markupsafe': 'markupsafe',
        'opencv-python': 'cv2',
        'paramiko': 'paramiko',
        'psycopg2': 'psycopg2',
        'pillow': 'PIL',
        'pydantic': 'pydantic',
        'pyopenssl': 'OpenSSL',
        'pymysql': 'pymysql',
        'pytest': 'pytest',
        'pyyaml': 'yaml',
        'python-dateutil': 'dateutil',
        'python-dotenv': 'dotenv',
        'scikit-learn': 'sklearn',
        'sqlalchemy': 'sqlalchemy',
        'twilio': 'twilio',
        'ujson': 'ujson'
    };

    return mappings[packageName] || packageName;
}
