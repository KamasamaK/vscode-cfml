# VS Code CFML

An extension for Visual Studio Code to assist in development with CFML.

## Acknowledgements

- [`vscode-coldfusion`](https://github.com/ilich/vscode-coldfusion/) on which the syntax highlighting is based, which was based on the next extension
- [`sublimetext-cfml`](https://github.com/jcberquist/sublimetext-cfml) as inspiration for some of the features. "Parsing" logic (including regexes) was also used.
- [`cfdocs`](https://github.com/foundeo/cfdocs/) as the default documentation and sample images in this README
- [`vscode-php-docblocker`](https://github.com/neild3r/vscode-php-docblocker) as the basis for docblock completion

## Features

1. **Syntax Highlighting**  
Using the default theme `Dark+`
![Syntax Highlighting](./images/cfdocs_leaderboard.png)

1. **Signature Help**  
Automatically triggers within signature of a function or can be manually triggered. This currently does not work for member functions. It is sometimes unable to work within a string.  
Win/Linux: `Ctrl`+`Shift`+`Space`; Mac: `Cmd`+`Shift`+`Space`
![Signature Help](./images/cfdocs_leaderboard_signature.png)

1. **Hover Documentation**  
Displays documentation for certain entities. Currently applicable to CFML global functions, CFML global tags/attributes, user-defined functions, HTML tags, and CSS properties. Does not always consider context, so for example it may also incorrectly trigger on SQL or JavaScript functions with the same name.  
Win/Linux: `Ctrl`+`K` `Ctrl`+`I`; Mac: `Cmd`+`K` `Cmd`+`I`
![Hover Documentation](./images/cfdocs_leaderboard_hover.png)

1. **Document Symbols**  
Search CFML symbols within a document. Also used for outline and breadcrumbs.  
Win/Linux: `Ctrl`+`Shift`+`O`; Mac: `Cmd`+`Shift`+`O`
![Document Symbols](./images/cfdocs_leaderboard_document-symbols.png)

1. **Workspace Symbols**  
Search symbols within the workspace. Limited to components and their function declarations.  
Win/Linux: `Ctrl`+`T`; Mac: `Cmd`+`T`
![Workspace Symbols](./images/cfdocs_workspace-symbols.png)

1. **Completion Suggestions**  
Suggestions for global functions, global tags and attributes, enumerated values, user functions, keywords, scopes, component properties, variables, component dot-paths, docblocks, HTML tags and attributes, and CSS properties. Does not always consider context, so it may trigger inappropriately.  
Win/Linux: `Ctrl`+`Space`; Mac: `Cmd`+`Space`
![Completion Suggestions](./images/cfdocs_leaderboard_completion.png)

1. **Definition**
Provides a link to the definition of a symbol. Currently only for object creation, function usage, function return types, argument types, property types, component extends, function arguments, function local variables, template variables, and application variables.  
_Go to Definition:_ Win/Linux: `F12`/`Ctrl`+click; Mac: `F12`  
_Peek Definition:_ Win/Linux: `Alt`+`F12` (`Ctrl`+hover provides a smaller, alternate peek); Mac: `Opt`+`F12`  
_Open Definition to the Side:_ Win/Linux: `Ctrl`+`K` `F12`  
![Peek Definition](./images/cfdocs_definition-peek.png)

1. **Type Definition**
Provides a link to the definition of the type for a symbol. This only applies to user-defined types within the same workspace.  
_No default shortcuts_

## Settings

The following are configurable Settings (Win/Linux: `Ctrl`+`Comma`; Mac: `Cmd`+`Comma`).

### CFML

This extension contributes these settings to Visual Studio Code:

- `cfml.globalDefinitions.source`: The source of the global definitions. Currently only supports CFDocs. [*Default*: `cfdocs`]
- `cfml.cfDocs.source`: Indicates the source location type to be used for CFDocs.  
**Values**
  - `remote`: Retrieve resources remotely from GitHub. [*Default*]
  - `local`: Retrieve resources locally using `cfml.cfDocs.localPath`.
- `cfml.cfDocs.localPath`: [*Optional*] Physical path to the data directory of CFDocs.
- `cfml.hover.enable`: Whether hover is enabled for CFML entities. [*Default*: `true`]
- `cfml.hover.html.enable`: Whether hover is enabled for HTML entities. [*Default*: `true`]
- `cfml.hover.css.enable`: Whether hover is enabled for CSS entities. [*Default*: `true`]
- `cfml.signature.enable`: Whether signature help is enabled. [*Default*: `true`]
- `cfml.suggest.enable`: Whether completion help is enabled. [*Default*: `true`]
- `cfml.suggest.snippets.enable`: Whether included [snippets](./snippets/snippets.json) are part of completion help. [*Default*: `true`]
- `cfml.suggest.snippets.exclude`: [*Optional*] Set of snippet keys you would like excluded from suggestions.
- `cfml.suggest.globalFunctions.enable`: Whether global functions are part of completion help. [*Default*: `true`]
- `cfml.suggest.globalFunctions.firstLetterCase`: What case should be used for the first letter of global function suggestions. [*Default*: `unchanged`]
- `cfml.suggest.globalTags.enable`: Whether global tags are part of completion help. [*Default*: `true`]
- `cfml.suggest.globalTags.attributes.quoteType`: Which quote type to use when completing CFML attribute suggestion. [*Default*: `double`]
- `cfml.suggest.globalTags.attributes.defaultValue`: Whether to populate the default value for an attribute if it has one. [*Default*: `false`]
- `cfml.suggest.globalTags.includeAttributes.setType`: What set of attributes to include when global tag suggestion is selected. [*Default*: `none`]
- `cfml.suggest.globalTags.includeAttributes.custom`: A custom set of attributes to include for given tags when suggestion is selected. Tags set here override the set type.  
  **Example**
    ```json
    "cfml.suggest.globalTags.includeAttributes.custom": {
        "cfquery": [
            {
                "name": "name"
            },
            {
                "name": "datasource",
                "value": "dsn"
            }
        ]
    }
    ```
- `cfml.suggest.htmlTags.enable`: Whether HTML tags are part of completion help. [*Default*: `true`]
- `cfml.suggest.htmlTags.attributes.quoteType`: Which quote type to use when completing HTML attribute suggestion. [*Default*: `double`]
- `cfml.suggest.css.enable`: Whether CSS properties and values are part of completion help. [*Default*: `true`]
- `cfml.definition.enable`: Whether providing definitions is enabled. [*Default*: `true`]
- `cfml.definition.userFunctions.search.enable`: Whether to search for matching functions throughout the workspace when a reliable match cannot be determined. Peek Definition will provide a list of all matches. [*Default*: `false`]
- `cfml.indexComponents.enable`: Whether to index all components in workspace on startup. This is done on each startup and duration depends on number and complexity of components as well as hardware specifications. Editor may be unresponsive during this period. It is currently required for most features involving components to work properly. [*Default*: `true`]
- `cfml.autoCloseTags.enable`: Whether to enable auto-closing tags for CFML. This uses the third-party extension `auto-close-tag`. This is only checked and set on startup. [*Default*: `true`]
- `cfml.autoCloseTags.configurationTarget`: Auto-configuration target for auto-closing tags. [*Default*: `Global`]
- `cfml.docBlock.gap`: Whether there should be a gap between the hint and other tags in a docblock. [*Default*: `true`]
- `cfml.docBlock.extra`: Extra tags you would like to include in every docblock  
  **Example**
    ```json
    "cfml.docBlock.extra": [
        {
            "name": "output",
            "default": "false",
            "types": [
                "component",
                "function"
            ]
        }
    ]
    ```
- `cfml.engine.name`: Name of the CFML engine against which to filter.
- `cfml.engine.version`: Version of the CFML engine against which to filter. SemVer format is preferred.
- `cfml.mappings`: Represents CFML mappings from logicalPath to directoryPath.  
  **Examples**
    ```json
    "cfml.mappings": [
      {
        "logicalPath": "/model",
        "directoryPath": "C:\\myprojects\\projectname\\app\\model"
      }
    ]
    ```
    ```json
    "cfml.mappings": [
      {
        "logicalPath": "/model",
        "directoryPath": "/app/model",
        "isPhysicalDirectoryPath": false
      }
    ]
    ```

### VS Code

I recommend the following settings overrides:

```json
"breadcrumbs.enabled": true
```

### Other

#### Emmet

You can enable Emmet within CFML files by using the following setting:

```json
"emmet.includeLanguages": {
  "cfml": "html"
}
```

## Commands

Used in Command Palette (Win/Linux: `Ctrl`+`Shift`+`P`; Mac: `Cmd`+`Shift`+`P`). Can also be bound to [Keyboard Shortcuts](https://code.visualstudio.com/docs/getstarted/keybindings).

- Refresh cache for global definitions
- Refresh cache for workspace definitions
- Toggle CFML line comment (Default: `Ctrl`+`/`)
- Toggle CFML block comment (Default: `Shift`+`Alt`+`A`)
- Open Application file for currently active document
- Go to Matching Tag
- Open CFDocs page
- Open CFML engine docs page
- Fold all functions in active editor

## Known Issues/Limitations

1. Initial indexing can be a lengthy process depending on how many components you have and your hardware specifications. During this time, some features will be unavailable and the editor may be sluggish.
1. There is partial embedded language support. You will get some HTML and CSS features, but no JS or SQL assistance within CFML files. You will still get syntax highlighting and you can use user snippets and Emmet to supplement somewhat.
1. An extension of the issue above is that as implemented there is only one language defined for CFML. This can cause a number of issues where functionality or settings are based on language ID. For example, with Emmet enabled, you will get the Emmet functionality throughout all CFML files and contexts.
1. Removing, moving, or renaming folders does not update the workspace definitions or symbols and will cause discrepancies with those resources. To rectify this, you may use the command to refresh workspace definitions at any time.
1. Completion suggestions are not always properly contextual.
1. The "parsing" is mostly done with regular expressions without considering context in most cases, which can result in occasional issues. One way this manifests is that you may get non-CFML being parsed as CFML. This can also result in strings and comments being parsed as if they were part of code. To simplify the expressions, semicolons are often expected as terminators in CFScript even though they are optional in some engines.
1. Type inference is extremely primitive and only based on variable initialization.
1. Using `<cfoutput>` within embedded languages (CSS and JavaScript) reverts the syntax tokenization to the base language which results in incorrect highlighting.

## Future Plans

Feel free to open issues for these or any other features you would find helpful so we can discuss.

- Provide additional completion suggestions
  - Global member functions
  - Enumerated values for global functions
- Consider component imports
- References (within same file/block)
- Use proper parser ([CFParser](https://github.com/cfparser/cfparser))
- Utilize a CFML language server

## Recommended Extensions

VS Code and this extension lack features and functionality that I find useful for development. Below are some supplemental extensions that I believe will improve the development experience for most.

- [Auto Close Tag](https://marketplace.visualstudio.com/items?itemName=formulahendry.auto-close-tag) - Enables automatic closing of tags. There are settings (`cfml.autoCloseTags.*`) for this extension to automate the configuration for HTML and CFML tags.
- [CFLint](https://marketplace.visualstudio.com/items?itemName=KamasamaK.vscode-cflint) - Integrates CFLint into VS Code as diagnostics/problems.
- [highlight-matching-tag](https://marketplace.visualstudio.com/items?itemName=vincaslt.highlight-matching-tag) - This will highlight the relevant tags based on your configuration with a configurable style. There are also some useful commands.
- [Path Autocomplete](https://marketplace.visualstudio.com/items?itemName=ionutvmi.path-autocomplete) - Provides suggestions when entering file paths

## Release Notes

See [CHANGELOG.md](/CHANGELOG.md)

## Contributing

See [CONTRIBUTING.md](/CONTRIBUTING.md)
