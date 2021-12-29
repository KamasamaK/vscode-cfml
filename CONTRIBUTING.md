# Contributing

If you would like to contribute enhancements or fixes, please read this document first.

## Setup

- Fork [KamasamaK/vscode-cfml](https://github.com/KamasamaK/vscode-cfml)
- Clone your forked repository
- Install [Node.js with npm](https://nodejs.org) if not already installed
- Open this project as the workspace in VS Code
- Install the recommended extensions in `.vscode/extensions.json`
- Run `npm install` at workspace root to install dependencies

## Working

- It is recommended to work on a separate feature branch created from the latest `master`.
- To debug, run the `Launch Extension` debug target in the [Debug View](https://code.visualstudio.com/docs/editor/debugging). This will:
  - Launch the `preLaunchTask` task to compile the extension
  - Launch a new VS Code instance with the `vscode-cfml` extension loaded
  - You will see a notification saying the development version of `vscode-cfml` overwrites the bundled version of `vscode-cfml` if you have an older version installed
- Make a pull request to the upstream `master`

## Guidelines

- Code should pass **TSLint** and **markdownlint** with the included configuration.
- Please use descriptive variable names and only use well-known abbreviations.
