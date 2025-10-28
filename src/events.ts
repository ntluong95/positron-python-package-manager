import * as vscode from "vscode";
import * as positron from "positron";

/**
 * Returns a disposable that listens for the onDidRegisterRuntime event.
 * If the registered runtime is a Python runtime, it will trigger a call to
 * refreshPackages on the sidebar provider.
 * @param sidebarProvider The SidebarProvider instance to refresh
 * @returns A disposable that can be used to unregister the event
 */
// export function getRegisterRuntimeEvent(): vscode.Disposable {
//     const RegisterRuntimeEvent = positron.runtime.onDidRegisterRuntime((event) => {
//         if (event.languageId !== 'python') { return; };
//         vscode.commands.executeCommand("positron-python-package-manager.refreshPackages");
//     });
//     return RegisterRuntimeEvent;
// }

/**
 * Returns a disposable that listens for the onDidChangeForegroundSession event.
 * If the foreground session changes to a Python session, it triggers a call to
 * refreshPackages on the sidebar provider.
 * @param sidebarProvider The SidebarProvider instance to refresh
 * @returns A disposable that can be used to unregister the event
 */

export function getChangeForegroundEvent(): vscode.Disposable {
  const ChangeForegroundEvent = positron.runtime.onDidChangeForegroundSession(
    (event) => {
      // Only refresh if the new session is a Python session
      if (!event?.startsWith("python-")) {
        return;
      }
      vscode.commands.executeCommand(
        "positron-python-package-manager.refreshPackages"
      );
    }
  );

  return ChangeForegroundEvent;
}

/**
 * Returns a disposable that listens for Python code execution events related to package imports.
 *
 * When the user executes Python code that includes `import` or `from ... import` statements,
 * this event handler waits briefly and then triggers a refresh of the Python package list in the sidebar.
 *
 * @returns {vscode.Disposable} A disposable that unregisters the event listener.
 */
export function getLoadLibraryEvent(): vscode.Disposable {
  const LoadLibraryEvent = positron.runtime.onDidExecuteCode((event) => {
    if (event.languageId !== "python") {
      return;
    }
    if (event.code.includes("import ")) {
      vscode.commands.executeCommand(
        "positron-python-package-manager.refreshPackages"
      );
    }
  });

  return LoadLibraryEvent;
}

/**
 * Returns a disposable that listens for Python interpreter changes.
 *
 * When the user changes the active Python interpreter (via the Python extension),
 * this event handler triggers a refresh of the Python package list in the sidebar
 * to reflect the packages available in the new environment.
 *
 * @returns {vscode.Disposable} A disposable that unregisters the event listener.
 */
export async function getPythonInterpreterChangeEvent(): Promise<vscode.Disposable> {
  const pythonExtension = vscode.extensions.getExtension("ms-python.python");

  if (!pythonExtension) {
    console.warn(
      "Python extension not found. Interpreter change listener not registered."
    );
    return { dispose: () => {} };
  }

  // Ensure Python extension is activated
  if (!pythonExtension.isActive) {
    await pythonExtension.activate();
  }

  // Access the Python extension API
  const pythonApi = pythonExtension.exports;

  // Check if the environments API is available
  if (pythonApi?.environments?.onDidChangeActiveEnvironmentPath) {
    console.log("Registering Python interpreter change listener");

    const changeEvent = pythonApi.environments.onDidChangeActiveEnvironmentPath(
      () => {
        console.log("Python interpreter changed, refreshing packages...");
        vscode.commands.executeCommand(
          "positron-python-package-manager.refreshPackages"
        );
      }
    );

    return changeEvent;
  } else {
    console.warn("Python extension API for environment changes not available");
    return { dispose: () => {} };
  }
}
