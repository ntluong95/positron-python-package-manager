# Contributing

Thank you for your interest in contributing to Positron Python Package Manager (PyPkgMan)! This guide covers how to set up a dev environment, run tests, and submit a PR.

## Development setup

1. Clone the repo and open it in Positron/VS Code.

```powershell
git clone https://github.com/ntluong95/positron-python-package-manager.git
cd positron-python-package-manager
npm install
```

2. Build and watch sources for development

```powershell
npm run watch
```

3. Launch the Extension Development Host (F5) to test changes in a sandboxed window.

## Testing & linting

- Run linting:

```powershell
npm run lint
```

- Compile tests and run them:

```powershell
npm run compile-tests
npm run test
```

## Pre-commit and CI hooks

This project includes common dev dependencies and a `pretest` script that compiles tests and runs linting. Use the same commands locally before submitting a PR.

## Style and guidelines

- Keep changes small and scoped. One change per PR improves reviewability.
- Run `npm run lint` and fix issues before pushing.
- Include tests for behavior changes where appropriate.

## Localization

The extension uses `l10n` for localizable strings. See the `l10n` directory and follow existing patterns when adding or updating translations.

## Submitting a PR

1. Fork the repository.
2. Create a feature branch for your changes.
3. Make changes and ensure tests/lint pass.
4. Open a PR targeting the `main` branch with a clear summary and testing notes.

## License

This project is licensed under the MIT License — see `LICENSE.txt` for details.

Thanks for contributing! If you need help getting started, open an issue describing what you'd like to work on.
