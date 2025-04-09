import * as vscode from 'vscode';

export function stripAnsi(text: string): string {
    return text.replace(/\x1b\[[0-9;]*m/g, '');
}

export function getFilterRedundant(): boolean {
    const config = vscode.workspace.getConfiguration(
        'positron-r-package-manager',
        vscode.Uri.file(vscode.workspace.workspaceFolders?.[0].uri.fsPath ?? "")
    );
    return config.get<boolean>('filterOutdatedIfUpToDateElsewhere', true);
}

// ✅ NEW: Move getImportName() here
export function getImportName(packageName: string): string {
    const mappings: Record<string, string> = {
        'opencv-python': 'cv2',
        'pillow': 'PIL',
        'scikit-learn': 'sklearn',
        'pyyaml': 'yaml',
        'python-dateutil': 'dateutil',
        'python-dotenv': 'dotenv',
        'beautifulsoup4': 'bs4',
        'ibis-framework': 'ibis',
        'flask-sqlalchemy': 'flask_sqlalchemy',
        'flask-wtf': 'flask_wtf',
        'pymysql': 'pymysql',
        'sqlalchemy': 'sqlalchemy',
        'psycopg2': 'psycopg2',
        'django': 'django',
        'ujson': 'ujson',
        'pyopenssl': 'OpenSSL',
        'markupsafe': 'markupsafe',
        'cryptography': 'cryptography',
        'google-cloud-storage': 'google.cloud.storage',
        'google-api-python-client': 'googleapiclient',
        'twilio': 'twilio',
        'boto3': 'boto3',
        'paramiko': 'paramiko',
        'pytest': 'pytest',
        'ipython': 'IPython',
        'pydantic': 'pydantic',
        'fastapi': 'fastapi'
    };

    const lowerName = packageName.toLowerCase();
    return mappings[lowerName] || lowerName.replace(/[-_.]/g, '');
}