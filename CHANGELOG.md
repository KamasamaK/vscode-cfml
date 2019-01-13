# Change Log

All notable changes to the CFML extension will be documented in this file.

## [0.5.0] - 2019-01-13

- Update minimum version of VS Code to v1.30
- Update `target` and `lib` in tsconfig
- Added `DefinitionLink` support for providing definitions. This allows a full component path to be used for definition links.
- Added doc links for each engine on hover ([\#14](https://github.com/KamasamaK/vscode-cfml/issues/14))
- Added completions for `this`-scoped variables for external references of the component ([\#26](https://github.com/KamasamaK/vscode-cfml/pull/26))
- Added command `cfml.foldAllFunctions`
- Added setting for completing tag attributes with quotes -- `cfml.suggest.globalTags.attributes.quoteType` ([\#24](https://github.com/KamasamaK/vscode-cfml/issues/24))
- Added new `onEnterRules` rule for when the cursor is between an opening and closing tag ([\#23](https://github.com/KamasamaK/vscode-cfml/issues/23) and [\#24](https://github.com/KamasamaK/vscode-cfml/issues/24))
- Added setting for preferred case in global function suggestions -- `cfml.suggest.globalFunctions.firstLetterCase` ([\#25](https://github.com/KamasamaK/vscode-cfml/issues/25))
- Added folding region markers to language configuration
- Added hover and completion for HTML tags
- Added hover and completion for CSS properties
- Added color support for CSS property values
- Changed `ParameterInformation.label` to use new tuple type
- Removed Emmet setting and added instructions in `README`
- Fixed document symbols for implicit functions
- Fixed issue displaying multiple signatures
- Added CommandBox `server.json` schema
- Added progress notification when caching all components
- Improved parsing for signature help and added check for named parameters

## [0.4.1] - 2018-08-09

- Update minimum version of VS Code to v1.25
- Added commands `cfml.openCfDocs` and `cfml.openEngineDocs` ([\#14](https://github.com/KamasamaK/vscode-cfml/issues/14))
- Added notification for auto-close-tag extension when not installed and setting is enabled
- Added support for new ACF 2018 syntax
- Added a setting that will enable a definition search in a workspace if a reliable function definition cannot be found
- Improved support for functions defined in cfm files
- Improved suggestions for closures assigned to variables
- Fixed exception suggestions for type `any`
- Fixed syntax highlighting issue for variable properties with numeric keys
- Updated Tasks to 2.0.0
- Updated `DocumentSymbolProvider` to provide new `DocumentSymbol` type

## [0.4.0] - 2018-06-04

- Update minimum version of VS Code to v1.22
- Added support for custom mappings
- Added setting for whether to provide definitions
- Added more type definitions
- Added scopes to settings to indicate whether they are resource-based or window-based
- Added ability and configuration to have attributes populated for global tag completions
- Added command to open Application file for active document
- Added command to go to matching CFML tag
- Application and Server variables initialized in their respective components are now cached and properly considered for various features
- Improved catch information and suggestions
- Improved suggestions for queries initialized in the same file/block
- Improved docblock parsing
- Fixed detection of certain variable assignments within switch statements
- Fixed some syntax highlighting issues ([\#12](https://github.com/KamasamaK/vscode-cfml/issues/12)+)
- Limited suggestions for script tags to only be in script context
- Some refactoring

## [0.3.1] - 2018-02-12

- Added syntax highlighting for HTML style attribute
- Added hover for external component functions
- Added signature help for implicit getters/setters
- Added signature help for external component functions
- Added definitions for external component functions
- Added definitions for variables within templates

## [0.3.0] - 2018-01-22

- Added more ways to check context
- Added completions for external component functions
- Added completions for query properties
- Added completions for component dot-paths
- Added completions for enumerated values for global tag attributes
- Added completions for script global tags
- Added definition for arguments
- Added definition for local variables
- Added definition for inherited functions
- Added definition for application variables
- Added type definitions within components
- Added hover for global tag attributes
- Added hover for inherited functions
- Added signature help for inherited functions
- Added signature help for constructor when using `new` syntax
- Added variable parsing for for-in statements
- Added option `noImplicitReturns` to tsconfig
- Made some additional functions `async`
- Fixed some case sensitivity issues in CFML grammar/syntax
- Updated embedded syntaxes for HTML, CSS, JavaScript, and SQL

## [0.2.0] - 2017-11-29

- Update minimum version of VS Code to v1.18
- Added global definition filtering based on engine
- Improved type inference
- Changed signature format
- Argument type now indicates component name
- Improved syntax highlighting for properties
- Now able to ignore CFML comments
- Added variables assigned from tag attributes
- Added option `noUnusedLocals` to tsconfig

## [0.1.4] - 2017-11-13

- Added `cfcatch` help
- Improved attribute parsing
- Added param parsing
- Using new `MarkdownString` type where applicable
- Added hash (`#`) to `autoClosingPairs` and set syntax to have contents of hash pairs as embedded code where applicable

## [0.1.3] - 2017-10-05

- Added docblock completion
- Improved tag attribute name completion
- Minor syntax additions

## [0.1.2] - 2017-10-02

- Corrected checks for existence of certain other extensions

## [0.1.1] - 2017-10-02

- Corrected issue with CFLint running for all indexed files
- Fixed issue causing publication to fail

## [0.1.0] - 2017-10-01

- Initial release
