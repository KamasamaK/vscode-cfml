# Change Log

All notable changes to the CFML extension will be documented in this file.

## [0.3.1] - 2018-02-12

- Added syntax highlighting for style attribute
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
