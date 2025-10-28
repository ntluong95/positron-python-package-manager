# Custom Import Configuration

This extension now supports custom import configurations to give you more control over how packages are loaded.

## Features

### 1. Custom Import Mappings

Define custom mappings from package names to import names in your settings.

**Setting:** `positron-python-package-manager.customImportMappings`

**Example:**

```json
{
  "positron-python-package-manager.customImportMappings": {
    "beautifulsoup4": "bs4",
    "pillow": "PIL",
    "scikit-learn": "sklearn"
  }
}
```

This is useful when the package name differs from the import name. These custom mappings take precedence over the built-in mappings.

### 2. Custom Import Commands

Define the exact import statement to execute when you check a package in the sidebar.

**Setting:** `positron-python-package-manager.customImportCommands`

**Example:**

```json
{
  "positron-python-package-manager.customImportCommands": {
    "numpy": "import numpy as np",
    "pandas": "import pandas as pd",
    "matplotlib": "import matplotlib.pyplot as plt",
    "tensorflow": "import tensorflow as tf"
  }
}
```

This allows you to:

- Use common aliases (e.g., `import numpy as np`)
- Import specific submodules (e.g., `from sklearn.linear_model import LogisticRegression`)
- Import multiple items from a package

### 3. Add Custom Import via Context Menu

You can easily add custom imports through the UI:

#### Method 1: From Package Sidebar

1. Right-click on any package in the Python Package sidebar
2. Select **"PyPkgMan: Set Custom Import for Package"**
3. Enter your custom import statement
4. Click OK

#### Method 2: From Python Code

1. Write or select an import statement in your Python file
2. Right-click on the import statement
3. Select **"PyPkgMan: Save Import Statement as Custom"**
4. If needed, confirm or enter the package name
5. The import statement is saved to your configuration

## Usage Examples

### Example 1: Using Aliases

```json
{
  "positron-python-package-manager.customImportCommands": {
    "numpy": "import numpy as np",
    "pandas": "import pandas as pd"
  }
}
```

When you check the `numpy` package in the sidebar, it will execute `import numpy as np` instead of just `import numpy`.

### Example 2: Importing Submodules

```json
{
  "positron-python-package-manager.customImportCommands": {
    "matplotlib": "import matplotlib.pyplot as plt"
  }
}
```

### Example 3: From Imports

```json
{
  "positron-python-package-manager.customImportCommands": {
    "sklearn": "from sklearn.linear_model import LinearRegression, LogisticRegression"
  }
}
```

## How It Works

1. **When checking a package:** The extension first checks if there's a custom import command defined for that package. If found, it uses that. Otherwise, it falls back to the standard `import <package>` format.

2. **Import name resolution:** When determining the import name (for packages where the package name differs from the import name), the extension first checks your custom mappings, then falls back to the built-in mapping list.

3. **When unchecking a package:** The extension attempts to delete the module from the namespace using `del <importname>`.

## Tips

- Custom import commands are stored in your VS Code user settings and apply globally across all workspaces
- You can use the context menu method to quickly save imports as you work
- The validation ensures that import statements start with `import` or `from`
- Custom imports are particularly useful for packages you frequently use with specific aliases

## Configuration Scope

Both settings can be configured at:

- **User level** (applies to all workspaces)
- **Workspace level** (applies to current workspace only)

To set workspace-specific configurations, use the workspace settings UI or modify `.vscode/settings.json` in your project.
