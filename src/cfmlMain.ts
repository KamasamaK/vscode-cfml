import {
  commands, languages, TextDocument, ConfigurationTarget, ExtensionContext, WorkspaceConfiguration, workspace, Uri, FileSystemWatcher, extensions, IndentAction
} from "vscode";
import CFMLHoverProvider from "./features/hoverProvider";
import CFMLDocumentSymbolProvider from "./features/documentSymbolProvider";
import CFMLSignatureHelpProvider from "./features/signatureHelpProvider";
import CFMLDocumentLinkProvider from "./features/documentLinkProvider";
import CFMLWorkspaceSymbolProvider from "./features/workspaceSymbolProvider";
import CFMLCompletionItemProvider from "./features/completionItemProvider";
import { CFDocsService } from "./utils/cfdocs/cfDocsService";
import { CommentType, toggleComment } from "./features/comment";
import * as cachedEntity from "./features/cachedEntities";
import { nonIndentingTags, decreasingIndentingTags, nonClosingTags } from "./utils/nonClosingTags";
import { COMPONENT_FILE_GLOB, parseComponent } from "./entities/component";
import { cacheComponent, clearCachedComponent } from "./features/cachedEntities";
import CFMLDefinitionProvider from "./features/definitionProvider";
import * as fs from "fs";
import * as path from "path";
import DocBlockCompletions from "./features/docBlocker/docCompletionProvider";

export const LANGUAGE_ID = "cfml";
export let snippets: Snippets;

export interface Snippets {
  [key: string]: Snippet;
}
export interface Snippet {
  prefix: string;
  body: string | string[];
  description: string;
}

/**
 * Gets a ConfigurationTarget enumerable based on a string representation
 * @param target A string representing a configuration target
 */
export function getConfigurationTarget(target: string): ConfigurationTarget {
  let configTarget: ConfigurationTarget;
  switch (target) {
    case "Global":
      configTarget = ConfigurationTarget.Global;
      break;
    case "Workspace":
      configTarget = ConfigurationTarget.Workspace;
      break;
    case "WorkspaceFolder":
      configTarget = ConfigurationTarget.WorkspaceFolder;
      break;
    default:
      configTarget = ConfigurationTarget.Global;
  }

  return configTarget;
}

/**
 * This method is called when the extension is activated.
 * @param context The context object for this extension.
 */
export function activate(context: ExtensionContext): void {

  languages.setLanguageConfiguration(LANGUAGE_ID, {
    indentationRules: {
      increaseIndentPattern: new RegExp(`<(?!\\?|(?:${nonIndentingTags.join("|")})\\b|[^>]*/>)([-_.A-Za-z0-9]+)(?=\\s|>)\\b[^>]*>(?!.*</\\1>)|<!--(?!.*-->)|\\{[^}\"']*$`, "i"),
      decreaseIndentPattern: new RegExp(`^\\s*(</[-_.A-Za-z0-9]+\\b[^>]*>|-?-->|\\}|<(${decreasingIndentingTags.join("|")})\\b[^>]*>)`, "i")
    },
    onEnterRules: [
      {
        // e.g. /** | */
        beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
        afterText: /^\s*\*\/$/,
        action: { indentAction: IndentAction.IndentOutdent, appendText: " * " }
      }, {
        // e.g. /** ...|
        beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
        action: { indentAction: IndentAction.None, appendText: " * " }
      }, {
        // e.g.  * ...|
        beforeText: /^(\t|(\ \ ))*\ \*(\ ([^\*]|\*(?!\/))*)?$/,
        action: { indentAction: IndentAction.None, appendText: "* " }
      }, {
        // e.g.  */|
        beforeText: /^(\t|(\ \ ))*\ \*\/\s*$/,
        action: { indentAction: IndentAction.None, removeText: 1 }
      }
    ]
  });

  context.subscriptions.push(commands.registerCommand("cfml.refreshGlobalDefinitionCache", () => {
    const cfmlSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml");
    if (cfmlSettings.get<string>("globalDefinitions.source") === "cfdocs") {
      CFDocsService.cacheAll();
    }
  }));

  context.subscriptions.push(commands.registerCommand("cfml.refreshWorkspaceDefinitionCache", () => {
    const cfmlSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml");
    if (cfmlSettings.get<boolean>("indexComponents.enable")) {
      cachedEntity.cacheAllComponents();
    }
  }));

  context.subscriptions.push(commands.registerCommand("cfml.toggleLineComment", toggleComment(CommentType.Line)));
  context.subscriptions.push(commands.registerCommand("cfml.toggleBlockComment", toggleComment(CommentType.Block)));

  context.subscriptions.push(languages.registerHoverProvider(LANGUAGE_ID, new CFMLHoverProvider()));
  context.subscriptions.push(languages.registerDocumentSymbolProvider(LANGUAGE_ID, new CFMLDocumentSymbolProvider()));
  context.subscriptions.push(languages.registerSignatureHelpProvider(LANGUAGE_ID, new CFMLSignatureHelpProvider(), "(", ","));
  context.subscriptions.push(languages.registerDocumentLinkProvider(LANGUAGE_ID, new CFMLDocumentLinkProvider()));
  context.subscriptions.push(languages.registerWorkspaceSymbolProvider(new CFMLWorkspaceSymbolProvider()));
  context.subscriptions.push(languages.registerCompletionItemProvider(LANGUAGE_ID, new CFMLCompletionItemProvider(), "."));
  context.subscriptions.push(languages.registerCompletionItemProvider(LANGUAGE_ID, new DocBlockCompletions(), "*", "@", "."));
  context.subscriptions.push(languages.registerDefinitionProvider(LANGUAGE_ID, new CFMLDefinitionProvider()));

  const fileWatcher: FileSystemWatcher = workspace.createFileSystemWatcher(COMPONENT_FILE_GLOB, false, true, false);
  context.subscriptions.push(fileWatcher);
  fileWatcher.onDidCreate((componentUri: Uri) => {
    workspace.openTextDocument(componentUri).then((document: TextDocument) => {
      cacheComponent(parseComponent(document));
    });
  });
  fileWatcher.onDidDelete((componentUri: Uri) => {
    clearCachedComponent(componentUri);
  });

  const cfmlSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml");
  const autoCloseTagExt = extensions.getExtension("formulahendry.auto-close-tag");
  if (autoCloseTagExt) {
    const autoCloseTagsSettings: WorkspaceConfiguration = workspace.getConfiguration("auto-close-tag");
    const autoCloseLanguages = autoCloseTagsSettings.get<string[]>("activationOnLanguage");
    const autoCloseExcludedTags = autoCloseTagsSettings.get<string[]>("excludedTags");
    const enableAutoCloseTags = cfmlSettings.get<boolean>("autoCloseTags.enable");
    if (cfmlSettings.get<boolean>("autoCloseTags.enable")) {
      if (!autoCloseLanguages.includes(LANGUAGE_ID)) {
        autoCloseLanguages.push(LANGUAGE_ID);
        autoCloseTagsSettings.update(
          "activationOnLanguage",
          autoCloseLanguages,
          getConfigurationTarget(cfmlSettings.get<string>("autoCloseTags.configurationTarget"))
        );
      }

      nonClosingTags.forEach((tagName: string) => {
        if (!autoCloseExcludedTags.includes(tagName)) {
          autoCloseExcludedTags.push(tagName);
        }
      });
      autoCloseTagsSettings.update(
        "excludedTags",
        autoCloseExcludedTags,
        getConfigurationTarget(cfmlSettings.get<string>("autoCloseTags.configurationTarget"))
      );
    } else {
      const index: number = autoCloseLanguages.indexOf(LANGUAGE_ID);
      if (index !== -1) {
        autoCloseLanguages.splice(index, 1);
        autoCloseTagsSettings.update(
          "activationOnLanguage",
          autoCloseLanguages,
          getConfigurationTarget(cfmlSettings.get<string>("autoCloseTags.configurationTarget"))
        );
      }
    }
  }

  const emmetExt = extensions.getExtension("vscode.emmet");
  if (emmetExt) {
    const emmetSettings: WorkspaceConfiguration = workspace.getConfiguration("emmet");
    const emmetIncludeLanguages = emmetSettings.get("includeLanguages", {});
    if (cfmlSettings.get<boolean>("emmet.enable")) {
      emmetIncludeLanguages["cfml"] = "html";
    } else {
      emmetIncludeLanguages["cfml"] = undefined;
    }

    emmetSettings.update(
      "includeLanguages",
      emmetIncludeLanguages,
      getConfigurationTarget(cfmlSettings.get<string>("emmet.configurationTarget"))
    );
  }

  commands.executeCommand("cfml.refreshGlobalDefinitionCache");
  commands.executeCommand("cfml.refreshWorkspaceDefinitionCache");

  fs.readFile(context.asAbsolutePath("./snippets/snippets.json"), "utf8", (err, data) => {
    snippets = JSON.parse(data);
  });
}

/**
 * This method is called when the extension is deactivated.
 */
export function deactivate(): void {
}
