import * as vscode from 'vscode';
import * as positron from 'positron';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SidebarProvider, PyPackageInfo } from './sidebar';
import { getImportName } from './utils';

export const execPromise = promisify(exec);

interface PythonExtensionApi {
    ready: Promise<void>;
    settings: {
        getExecutionDetails(resource?: any): { execCommand: string[] | undefined };
    };
}

// Helper: detect VirtualEnv, Conda, or Global
function detectLocationType(pythonPath: string): string {
    const pathLower = pythonPath.toLowerCase();
    if (pathLower.includes('venv') || pathLower.includes('.venv') || pathLower.includes('env')) {
        return 'VirtualEnv';
    }
    if (pathLower.includes('conda')) {
        return 'Conda';
    }
    return 'Global';
}

// Helper: Get Python interpreter path
export async function getPythonInterpreter(): Promise<string | undefined> {
    const pythonExtension = vscode.extensions.getExtension<PythonExtensionApi>('ms-python.python');
    if (!pythonExtension) {
        vscode.window.showWarningMessage('Python extension not found.');
        return undefined;
    }
    if (!pythonExtension.isActive) {
        await pythonExtension.activate();
    }
    await pythonExtension.exports.ready;
    const execCommand = pythonExtension.exports.settings.getExecutionDetails()?.execCommand;
    return execCommand?.join(' ');
}

// Helper: parse `pip show` output
// function parsePipShow(output: string): Map<string, { location: string; summary: string }> {
//     const infoMap = new Map<string, { location: string; summary: string }>();
//     const blocks = output.split(/\n(?=Name: )/);

//     for (const block of blocks) {
//         const nameMatch = block.match(/^Name:\s*(.+)$/m);
//         const locationMatch = block.match(/^Location:\s*(.+)$/m);
//         const summaryMatch = block.match(/^Summary:\s*(.+)$/m);

//         if (nameMatch) {
//             const name = nameMatch[1];
//             const location = locationMatch ? locationMatch[1] : '';
//             const summary = summaryMatch ? summaryMatch[1] : '';
//             infoMap.set(name, { location, summary });
//         }
//     }

//     return infoMap;
// }

async function getImportedPackages(): Promise<string[]> {
    const code = `import sys, types, json
  imported = set()
  for name, val in globals().items():
      module_name = None
      if isinstance(val, types.ModuleType):
          module_name = val.__name__
      elif hasattr(val, '__module__') and val.__module__:
          module_name = val.__module__
      if module_name:
          base = module_name.split('.')[0]
          if base in sys.builtin_module_names:
              continue
          if base in {"__future__", "__main__"}:
              continue
          if base.startswith("_"):
              continue
          imported.add(base)
  print(json.dumps(list(imported)))`;

    // Execute the code in Interactive mode so it runs in your active Python session.
    const output = await positron.runtime.executeCode(
        'python',
        code,
        true, // capture output from stdout
        undefined,
        positron.RuntimeCodeExecutionMode.Interactive
    );
    
    if (typeof output === "string") {
        try {
          return JSON.parse(output);
        } catch (e) {
          vscode.window.showErrorMessage("Failed to parse imported packages: " + e);
          return [];
        }
      } else if (typeof output === "object" && output !== null) {
        // Assuming that the output is already in a JSON-parsed format.
        return output as string[];
      } else {
        vscode.window.showErrorMessage("Unexpected output type");
        return [];
      }
}


// 🌟 Main function: Only installed packages
export async function refreshPackages(sidebarProvider: SidebarProvider): Promise<void> {
    try {
        const pythonPath = await getPythonInterpreter();
        if (!pythonPath) {
            sidebarProvider.refresh([]);
            return;
        }

        const pipResult = await execPromise(`"${pythonPath}" -m pip list --format json`);

        //TODO This check currently doesn't work, it need to query the Python interactive interpreter. set(sys.modules) & set(globals())
        //TODO Difficult to deal with non-module imports like from x import y; https://stackoverflow.com/questions/4858100/how-to-list-imported-modules
        // const modulesResult = await execPromise(`"${pythonPath}" -c "import sys, json; print(json.dumps(list(sys.modules.keys())))"`);

        const parsed: { name: string; version: string }[] = JSON.parse(pipResult.stdout);
        // Get the list of base package names currently imported from the interactive session.
		const importedPackages: string[] = await getImportedPackages();
        const locationType = detectLocationType(pythonPath);

        const currentState = new Map<string, boolean>(); // Allows us to keep track of previously loaded modules
        sidebarProvider.getPackages().forEach(pkg => {
            currentState.set(pkg.name, pkg.loaded);
        });

        const pkgInfo: PyPackageInfo[] = parsed.map(pkg => {
            const importName = getImportName(pkg.name);
            const runtimeLoaded = importedPackages.includes(importName) || importedPackages.includes(pkg.name);
			const loaded = currentState.has(pkg.name) ? currentState.get(pkg.name)! : runtimeLoaded;

            return {
                name: pkg.name,
                version: pkg.version,
                latestVersion: undefined,  
                libpath: '',
                locationtype: locationType,
                title: pkg.name,
                loaded: loaded
            };
        });

        sidebarProvider.refresh(pkgInfo);

    } catch (err) {
        console.error(err);
        vscode.window.showErrorMessage('❌ Failed to refresh installed packages.');
        sidebarProvider.refresh([]);
    }
}

