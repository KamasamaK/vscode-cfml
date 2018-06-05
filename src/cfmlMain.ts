import * as fs from "fs";
import { ConfigurationChangeEvent, ConfigurationTarget, DocumentSelector, ExtensionContext, FileSystemWatcher, IndentAction, TextDocument, Uri, WorkspaceConfiguration, commands, extensions, languages, workspace, window } from "vscode";
import { COMPONENT_FILE_GLOB, parseComponent, getApplicationUri } from "./entities/component";
import { decreasingIndentingTags, nonClosingTags, nonIndentingTags, goToMatchingTag } from "./entities/tag";
import * as cachedEntity from "./features/cachedEntities";
import { cacheComponent, clearCachedComponent } from "./features/cachedEntities";
import { CommentType, toggleComment } from "./features/comment";
import CFMLCompletionItemProvider from "./features/completionItemProvider";
import CFMLDefinitionProvider from "./features/definitionProvider";
import DocBlockCompletions from "./features/docBlocker/docCompletionProvider";
import CFMLDocumentLinkProvider from "./features/documentLinkProvider";
import CFMLDocumentSymbolProvider from "./features/documentSymbolProvider";
import CFMLHoverProvider from "./features/hoverProvider";
import CFMLSignatureHelpProvider from "./features/signatureHelpProvider";
import CFMLTypeDefinitionProvider from "./features/typeDefinitionProvider";
import CFMLWorkspaceSymbolProvider from "./features/workspaceSymbolProvider";
import { CFDocsService } from "./utils/cfdocs/cfDocsService";
import { isCfcFile } from "./utils/contextUtil";
import { DocumentStateContext, getDocumentStateContext } from "./utils/documentUtil";

export const LANGUAGE_ID: string = "cfml";
const DOCUMENT_SELECTOR: DocumentSelector = [
  {
    language: LANGUAGE_ID,
    scheme: "file"
  },
  {
    language: LANGUAGE_ID,
    scheme: "untitled"
  }
];

export interface Snippets {
  [key: string]: Snippet;
}
export interface Snippet {
  prefix: string;
  body: string | string[];
  description: string;
}

export let snippets: Snippets;

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

  context.subscriptions.push(commands.registerCommand("cfml.refreshGlobalDefinitionCache", async () => {
    const cfmlGlobalDefinitionsSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml.globalDefinitions");
    if (cfmlGlobalDefinitionsSettings.get<string>("source") === "cfdocs") {
      CFDocsService.cacheAll();
    }
  }));

  context.subscriptions.push(commands.registerCommand("cfml.refreshWorkspaceDefinitionCache", async () => {
    const cfmlIndexComponentsSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml.indexComponents");
    if (cfmlIndexComponentsSettings.get<boolean>("enable")) {
      cachedEntity.cacheAllComponents();
    }
  }));

  context.subscriptions.push(commands.registerCommand("cfml.toggleLineComment", toggleComment(CommentType.Line)));
  context.subscriptions.push(commands.registerCommand("cfml.toggleBlockComment", toggleComment(CommentType.Block)));

  context.subscriptions.push(commands.registerCommand("cfml.openActiveApplicationFile", async () => {
    if (window.activeTextEditor === undefined) {
      window.showErrorMessage("No active text editor was found.");
      return;
    }

    const activeDocumentUri: Uri = window.activeTextEditor.document.uri;

    if (activeDocumentUri.scheme === "untitled") {
      return;
    }

    const applicationUri: Uri = getApplicationUri(activeDocumentUri);
    if (applicationUri) {
      const applicationDocument: TextDocument = await workspace.openTextDocument(applicationUri);
      if (!applicationDocument) {
        window.showErrorMessage("No Application found for the currently active document.");
        return;
      }

      window.showTextDocument(applicationDocument);
    }
  }));

  context.subscriptions.push(commands.registerCommand("cfml.goToMatchingTag", async () => {
    goToMatchingTag();
  }));

  context.subscriptions.push(languages.registerHoverProvider(DOCUMENT_SELECTOR, new CFMLHoverProvider()));
  context.subscriptions.push(languages.registerDocumentSymbolProvider(DOCUMENT_SELECTOR, new CFMLDocumentSymbolProvider()));
  context.subscriptions.push(languages.registerSignatureHelpProvider(DOCUMENT_SELECTOR, new CFMLSignatureHelpProvider(), "(", ","));
  context.subscriptions.push(languages.registerDocumentLinkProvider(DOCUMENT_SELECTOR, new CFMLDocumentLinkProvider()));
  context.subscriptions.push(languages.registerWorkspaceSymbolProvider(new CFMLWorkspaceSymbolProvider()));
  context.subscriptions.push(languages.registerCompletionItemProvider(DOCUMENT_SELECTOR, new CFMLCompletionItemProvider(), "."));
  context.subscriptions.push(languages.registerCompletionItemProvider(DOCUMENT_SELECTOR, new DocBlockCompletions(), "*", "@", "."));
  context.subscriptions.push(languages.registerDefinitionProvider(DOCUMENT_SELECTOR, new CFMLDefinitionProvider()));
  context.subscriptions.push(languages.registerTypeDefinitionProvider(DOCUMENT_SELECTOR, new CFMLTypeDefinitionProvider()));

  context.subscriptions.push(workspace.onDidSaveTextDocument((document: TextDocument) => {
    if (isCfcFile(document)) {
      const documentStateContext: DocumentStateContext = getDocumentStateContext(document);
      cacheComponent(parseComponent(documentStateContext), documentStateContext);
    }
  }));

  const fileWatcher: FileSystemWatcher = workspace.createFileSystemWatcher(COMPONENT_FILE_GLOB, false, true, false);
  context.subscriptions.push(fileWatcher);
  fileWatcher.onDidCreate((componentUri: Uri) => {
    workspace.openTextDocument(componentUri).then((document: TextDocument) => {
      const documentStateContext: DocumentStateContext = getDocumentStateContext(document);
      cacheComponent(parseComponent(documentStateContext), documentStateContext);
    });
  });
  fileWatcher.onDidDelete((componentUri: Uri) => {
    clearCachedComponent(componentUri);
  });

  context.subscriptions.push(workspace.onDidChangeConfiguration((evt: ConfigurationChangeEvent) => {
    if (evt.affectsConfiguration("cfml.globalDefinitions") || evt.affectsConfiguration("cfml.cfDocs") || evt.affectsConfiguration("cfml.engine")) {
      commands.executeCommand("cfml.refreshGlobalDefinitionCache");
    }
  }));

  const cfmlSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml");
  const autoCloseTagExt = extensions.getExtension("formulahendry.auto-close-tag");
  if (autoCloseTagExt) {
    const autoCloseTagsSettings: WorkspaceConfiguration = workspace.getConfiguration("auto-close-tag", null);
    const autoCloseLanguages = autoCloseTagsSettings.get<string[]>("activationOnLanguage");
    const autoCloseExcludedTags = autoCloseTagsSettings.get<string[]>("excludedTags");
    // const enableAutoCloseTags = cfmlSettings.get<boolean>("autoCloseTags.enable");
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

  // TODO: Remove this. Provide instructions instead.
  const emmetExt = extensions.getExtension("vscode.emmet");
  if (emmetExt) {
    const emmetSettings: WorkspaceConfiguration = workspace.getConfiguration("emmet", null);
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
