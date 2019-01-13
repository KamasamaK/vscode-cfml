import { commands, TextDocument, Uri, window, workspace, WorkspaceConfiguration } from "vscode";
import { Component, getApplicationUri } from "../entities/component";
import { UserFunction } from "../entities/userFunction";
import CFDocsService from "../utils/cfdocs/cfDocsService";
import { isCfcFile } from "../utils/contextUtil";
import * as cachedEntity from "./cachedEntities";

export async function refreshGlobalDefinitionCache(): Promise<void> {
  cachedEntity.clearAllGlobalFunctions();
  cachedEntity.clearAllGlobalTags();
  cachedEntity.clearAllGlobalEntityDefinitions();

  const cfmlGlobalDefinitionsSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml.globalDefinitions");
  if (cfmlGlobalDefinitionsSettings.get<string>("source") === "cfdocs") {
    CFDocsService.cacheAll();
  }
}

export async function refreshWorkspaceDefinitionCache(): Promise<void> {
  const cfmlIndexComponentsSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml.indexComponents");
  if (cfmlIndexComponentsSettings.get<boolean>("enable")) {
    cachedEntity.cacheAllComponents();
  }
}

export async function openActiveApplicationFile(): Promise<void> {
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
}

export async function foldAllFunctions(): Promise<void> {
  if (!window.activeTextEditor) {
    return;
  }

  const document: TextDocument = window.activeTextEditor.document;

  if (isCfcFile(document)) {
    const thisComponent: Component = cachedEntity.getComponent(document.uri);
    if (thisComponent) {
      const functionStartLines: number[] = [];
      thisComponent.functions.filter((func: UserFunction) => {
        return !func.isImplicit && func.bodyRange !== undefined;
      }).forEach((func: UserFunction) => {
        functionStartLines.push(func.bodyRange.start.line);
      });

      if (functionStartLines.length > 0) {
        commands.executeCommand("editor.fold", { selectionLines: functionStartLines });
      }
    }
  }
}
