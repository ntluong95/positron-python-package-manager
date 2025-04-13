// decoration.ts
import * as vscode from 'vscode';

export let outdatedDecorationType: vscode.TextEditorDecorationType;
export let upToDateDecorationType: vscode.TextEditorDecorationType;

export function initializeDecoration() {
    outdatedDecorationType = vscode.window.createTextEditorDecorationType({
        after: {
            margin: '0 0 0 2em',
            color: 'rgb(224 108 117 / 50%)',
            fontStyle: 'italic',
        },
    });

    upToDateDecorationType = vscode.window.createTextEditorDecorationType({
        after: {
            margin: '0 0 0 2em',
            color: 'rgb(34 200 147 / 50%)',
            fontStyle: 'italic',
        },
    });
}

export function getDecorationOptions(range: vscode.Range, status: 'outdated' | 'up-to-date'): vscode.DecorationOptions {
    return {
        range,
        renderOptions: {
            after: {
                contentText: status === 'outdated' ? '❌ Old Version' : '✅ Newest',
            }
        }
    };
}
