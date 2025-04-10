import * as vscode from 'vscode';

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