import * as Octokit from "@octokit/rest";
import * as fs from "fs";
import * as path from "path";
import { commands, ConfigurationChangeEvent, ConfigurationTarget, DocumentSelector, ExtensionContext, extensions, FileSystemWatcher, IndentAction, languages, TextDocument, Uri, window, workspace, WorkspaceConfiguration } from "vscode";
import { COMPONENT_FILE_GLOB } from "./entities/component";
import { Scope } from "./entities/scope";
import { decreasingIndentingTags, goToMatchingTag, nonClosingTags, nonIndentingTags } from "./entities/tag";
import { parseVariableAssignments, Variable } from "./entities/variable";
import * as cachedEntity from "./features/cachedEntities";
import CFMLDocumentColorProvider from "./features/colorProvider";
import { foldAllFunctions, openActiveApplicationFile, refreshGlobalDefinitionCache, refreshWorkspaceDefinitionCache } from "./features/commands";
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
import CFDocsService from "./utils/cfdocs/cfDocsService";
import { APPLICATION_CFM_GLOB, isCfcFile } from "./utils/contextUtil";
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

const octokit = new Octokit();
const httpSuccessStatusCode: number = 200;

export let extensionContext: ExtensionContext;

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
 * Gets the latest CommandBox Server schema from the CommandBox git repository
 */
async function getLatestCommandBoxServerSchema(): Promise<void> {
  const cmdboxServerSchemaFileName: string = "server.schema.json";
  const cmdboxServerSchemaFilePath: string = path.join(extensionContext.extensionPath, "resources", "schemas", cmdboxServerSchemaFileName);

  try {
    const cmdboxServerSchemaResult = await octokit.repos.getContents({
      owner: "Ortus-Solutions",
      repo: "commandbox",
      path: `src/cfml/system/config/${cmdboxServerSchemaFileName}`,
      ref: "master"
    });

    if (cmdboxServerSchemaResult && cmdboxServerSchemaResult.hasOwnProperty("status") && cmdboxServerSchemaResult.status === httpSuccessStatusCode && cmdboxServerSchemaResult.data.type === "file") {
      const resultText: string = new Buffer(cmdboxServerSchemaResult.data.content, cmdboxServerSchemaResult.data.encoding).toString("utf8");

      fs.writeFileSync(cmdboxServerSchemaFilePath, resultText);
    }
  } catch (err) {
    console.error(err);
  }
}

/**
 * This method is called when the extension is activated.
 * @param context The context object for this extension.
 */
export function activate(context: ExtensionContext): void {

  extensionContext = context;

  languages.setLanguageConfiguration(LANGUAGE_ID, {
    indentationRules: {
      increaseIndentPattern: new RegExp(`<(?!\\?|(?:${nonIndentingTags.join("|")})\\b|[^>]*\\/>)([-_.A-Za-z0-9]+)(?=\\s|>)\\b[^>]*>(?!.*<\\/\\1>)|<!--(?!.*-->)|\\{[^}\"']*$`, "i"),
      decreaseIndentPattern: new RegExp(`^\\s*(<\\/[-_.A-Za-z0-9]+\\b[^>]*>|-?-->|\\}|<(${decreasingIndentingTags.join("|")})\\b[^>]*>)`, "i")
    },
    onEnterRules: [
      {
        // e.g. /** | */
        beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
        afterText: /^\s*\*\/$/,
        action: { indentAction: IndentAction.IndentOutdent, appendText: " * " }
      },
      {
        // e.g. /** ...|
        beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
        action: { indentAction: IndentAction.None, appendText: " * " }
      },
      {
        // e.g.  * ...|
        beforeText: /^(\t|(\ \ ))*\ \*(\ ([^\*]|\*(?!\/))*)?$/,
        action: { indentAction: IndentAction.None, appendText: "* " }
      },
      {
        // e.g.  */|
        beforeText: /^(\t|(\ \ ))*\ \*\/\s*$/,
        action: { indentAction: IndentAction.None, removeText: 1 }
      },
      {
        // e.g. <cfloop> | </cfloop>
        beforeText: new RegExp(`<(?!(?:${nonIndentingTags.join("|")})\\b)([_:\\w][_:\\w-.\\d]*)([^/>]*(?!/)>)[^<]*$`, "i"),
        afterText: new RegExp(`^(<\\/([_:\\w][_:\\w-.\\d]*)\\s*>|<(?:${decreasingIndentingTags.join("|")})\\b)`, "i"),
        action: { indentAction: IndentAction.IndentOutdent }
      }
    ]
  });

  getLatestCommandBoxServerSchema();

  context.subscriptions.push(commands.registerCommand("cfml.refreshGlobalDefinitionCache", refreshGlobalDefinitionCache));
  context.subscriptions.push(commands.registerCommand("cfml.refreshWorkspaceDefinitionCache", refreshWorkspaceDefinitionCache));
  context.subscriptions.push(commands.registerCommand("cfml.toggleLineComment", toggleComment(CommentType.Line)));
  context.subscriptions.push(commands.registerCommand("cfml.toggleBlockComment", toggleComment(CommentType.Block)));
  context.subscriptions.push(commands.registerCommand("cfml.openActiveApplicationFile", openActiveApplicationFile));
  context.subscriptions.push(commands.registerCommand("cfml.goToMatchingTag", goToMatchingTag));
  context.subscriptions.push(commands.registerCommand("cfml.openCfDocs", CFDocsService.openCfDocsForCurrentWord));
  context.subscriptions.push(commands.registerCommand("cfml.openEngineDocs", CFDocsService.openEngineDocsForCurrentWord));
  context.subscriptions.push(commands.registerCommand("cfml.foldAllFunctions", foldAllFunctions));

  context.subscriptions.push(languages.registerHoverProvider(DOCUMENT_SELECTOR, new CFMLHoverProvider()));
  context.subscriptions.push(languages.registerDocumentSymbolProvider(DOCUMENT_SELECTOR, new CFMLDocumentSymbolProvider()));
  context.subscriptions.push(languages.registerSignatureHelpProvider(DOCUMENT_SELECTOR, new CFMLSignatureHelpProvider(), "(", ","));
  context.subscriptions.push(languages.registerDocumentLinkProvider(DOCUMENT_SELECTOR, new CFMLDocumentLinkProvider()));
  context.subscriptions.push(languages.registerWorkspaceSymbolProvider(new CFMLWorkspaceSymbolProvider()));
  context.subscriptions.push(languages.registerCompletionItemProvider(DOCUMENT_SELECTOR, new CFMLCompletionItemProvider(), "."));
  context.subscriptions.push(languages.registerCompletionItemProvider(DOCUMENT_SELECTOR, new DocBlockCompletions(), "*", "@", "."));
  context.subscriptions.push(languages.registerDefinitionProvider(DOCUMENT_SELECTOR, new CFMLDefinitionProvider()));
  context.subscriptions.push(languages.registerTypeDefinitionProvider(DOCUMENT_SELECTOR, new CFMLTypeDefinitionProvider()));
  context.subscriptions.push(languages.registerColorProvider(DOCUMENT_SELECTOR, new CFMLDocumentColorProvider()));

  context.subscriptions.push(workspace.onDidSaveTextDocument((document: TextDocument) => {
    if (isCfcFile(document)) {
      cachedEntity.cacheComponentFromDocument(document);
    } else if (path.basename(document.fileName) === "Application.cfm") {
      const documentStateContext: DocumentStateContext = getDocumentStateContext(document);
      const thisApplicationVariables: Variable[] = parseVariableAssignments(documentStateContext, documentStateContext.docIsScript);
      const thisApplicationFilteredVariables: Variable[] = thisApplicationVariables.filter((variable: Variable) => {
        return [Scope.Application, Scope.Session, Scope.Request].includes(variable.scope);
      });
      cachedEntity.setApplicationVariables(document.uri, thisApplicationFilteredVariables);
    }
  }));

  const componentWatcher: FileSystemWatcher = workspace.createFileSystemWatcher(COMPONENT_FILE_GLOB, false, true, false);
  componentWatcher.onDidCreate((componentUri: Uri) => {
    workspace.openTextDocument(componentUri).then((document: TextDocument) => {
      cachedEntity.cacheComponentFromDocument(document);
    });
  });
  componentWatcher.onDidDelete((componentUri: Uri) => {
    cachedEntity.clearCachedComponent(componentUri);

    const fileName: string = path.basename(componentUri.fsPath);
    if (fileName === "Application.cfc") {
      cachedEntity.removeApplicationVariables(componentUri);
    }
  });
  context.subscriptions.push(componentWatcher);

  const applicationCfmWatcher: FileSystemWatcher = workspace.createFileSystemWatcher(APPLICATION_CFM_GLOB, false, true, false);
  context.subscriptions.push(applicationCfmWatcher);
  applicationCfmWatcher.onDidCreate((applicationUri: Uri) => {
    workspace.openTextDocument(applicationUri).then((document: TextDocument) => {
      const documentStateContext: DocumentStateContext = getDocumentStateContext(document);
      const thisApplicationVariables: Variable[] = parseVariableAssignments(documentStateContext, documentStateContext.docIsScript);
      const thisApplicationFilteredVariables: Variable[] = thisApplicationVariables.filter((variable: Variable) => {
        return [Scope.Application, Scope.Session, Scope.Request].includes(variable.scope);
      });
      cachedEntity.setApplicationVariables(applicationUri, thisApplicationFilteredVariables);
    });
  });
  applicationCfmWatcher.onDidDelete((applicationUri: Uri) => {
    cachedEntity.removeApplicationVariables(applicationUri);
  });

  context.subscriptions.push(workspace.onDidChangeConfiguration((evt: ConfigurationChangeEvent) => {
    if (evt.affectsConfiguration("cfml.globalDefinitions") || evt.affectsConfiguration("cfml.cfDocs") || evt.affectsConfiguration("cfml.engine")) {
      commands.executeCommand("cfml.refreshGlobalDefinitionCache");
    }
  }));

  const cfmlSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml");
  const autoCloseTagExt = extensions.getExtension("formulahendry.auto-close-tag");
  const enableAutoCloseTags: boolean = cfmlSettings.get<boolean>("autoCloseTags.enable", true);
  if (autoCloseTagExt) {
    const autoCloseTagsSettings: WorkspaceConfiguration = workspace.getConfiguration("auto-close-tag", null);
    const autoCloseLanguages: string[] = autoCloseTagsSettings.get<string[]>("activationOnLanguage");
    const autoCloseExcludedTags: string[] = autoCloseTagsSettings.get<string[]>("excludedTags");

    if (enableAutoCloseTags) {
      if (!autoCloseLanguages.includes(LANGUAGE_ID)) {
        autoCloseLanguages.push(LANGUAGE_ID);
        autoCloseTagsSettings.update(
          "activationOnLanguage",
          autoCloseLanguages,
          getConfigurationTarget(cfmlSettings.get<string>("autoCloseTags.configurationTarget"))
        );
      }

      nonClosingTags.filter((tagName: string) => {
        // Consider ignoring case
        return !autoCloseExcludedTags.includes(tagName);
      }).forEach((tagName: string) => {
        autoCloseExcludedTags.push(tagName);
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
  } else if (enableAutoCloseTags) {
    window.showInformationMessage("You have the autoCloseTags setting enabled, but do not have the necessary extension installed/enabled.", "Install/Enable Extension", "Disable Setting").then(
      (selection: string) => {
        if (selection === "Install/Enable Extension") {
          commands.executeCommand("extension.open", "formulahendry.auto-close-tag");
        } else if (selection === "Disable Setting") {
          cfmlSettings.update(
            "autoCloseTags.enable",
            false,
            getConfigurationTarget(cfmlSettings.get<string>("autoCloseTags.configurationTarget"))
          );
        }
      }
    );
  }

  commands.executeCommand("cfml.refreshGlobalDefinitionCache");
  commands.executeCommand("cfml.refreshWorkspaceDefinitionCache");
}

/**
 * This method is called when the extension is deactivated.
 */
export function deactivate(): void {
}
