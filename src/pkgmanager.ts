import * as vscode from 'vscode';

export interface PackageVersionInfo {
    name: string;
    version: string;
    latestVersion?: string;
}

export interface IPackageManager {
    getPackageList(): Promise<PackageVersionInfo[]>;
    getPackageListWithUpdate(): Promise<PackageVersionInfo[]>;
}

export class PackageManager implements IPackageManager {
    constructor(
        private pythonPath: string,
        private output: vscode.OutputChannel,
        private context: vscode.ExtensionContext
    ) {}

    async getPackageList(): Promise<PackageVersionInfo[]> {
        return []; // You can implement real logic later
    }

    async getPackageListWithUpdate(): Promise<PackageVersionInfo[]> {
        return []; // Implement real logic
    }
}
