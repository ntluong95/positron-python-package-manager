import * as vscode from 'vscode';
import * as positron from 'positron';

import { SidebarProvider } from './sidebar';
import { refreshPackages } from './refresh';

/**
 * Listen for when a new runtime is registered.
 * If it is a Python runtime, refresh package list.
 */
export function getRegisterRuntimeEvent(sidebarProvider: SidebarProvider): vscode.Disposable {
    const RegisterRuntimeEvent = positron.runtime.onDidRegisterRuntime((event) => {
        if (event.languageId !== 'python') { return; } // ⬅️ changed from 'r' to 'python'
        refreshPackages(sidebarProvider);
    });
    return RegisterRuntimeEvent;
}

/**
 * Listen for when the foreground runtime session changes.
 * If it switches to a Python session, refresh packages.
 */
export function getChangeForegroundEvent(sidebarProvider: SidebarProvider): vscode.Disposable {
    const ChangeForegroundEvent = positron.runtime.onDidChangeForegroundSession((event) => {
        if (!event?.startsWith('python-')) { return; } // ⬅️ changed from 'r-' to 'python-'
        refreshPackages(sidebarProvider);
    });
    return ChangeForegroundEvent;
}
