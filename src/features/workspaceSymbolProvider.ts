import * as path from "path";
import { CancellationToken, Location, Position, SymbolInformation, SymbolKind, TextDocument, TextEditor, Uri, window, workspace, WorkspaceSymbolProvider } from "vscode";
import { LANGUAGE_ID } from "../cfmlMain";
import { Component, COMPONENT_EXT } from "../entities/component";
import { UserFunction } from "../entities/userFunction";
import { equalsIgnoreCase } from "../utils/textUtil";
import * as cachedEntity from "./cachedEntities";

export default class CFMLWorkspaceSymbolProvider implements WorkspaceSymbolProvider {

  /**
   * Workspace-wide search for a symbol matching the given query string.
   * @param query A non-empty query string.
   * @param _token A cancellation token.
   */
  public async provideWorkspaceSymbols(query: string, _token: CancellationToken): Promise<SymbolInformation[]> {
    let workspaceSymbols: SymbolInformation[] = [];
    if (query === "") {
      return workspaceSymbols;
    }

    let uri: Uri | undefined = undefined;
    const editor: TextEditor = window.activeTextEditor;
    if (editor) {
      const document: TextDocument = editor.document;
      if (document && document.languageId === LANGUAGE_ID) {
        uri = document.uri;
      }
    }
    if (!uri) {
      const documents: TextDocument[] = workspace.textDocuments;
      for (const document of documents) {
        if (document.languageId === LANGUAGE_ID) {
          uri = document.uri;
          break;
        }
      }
    }

    if (!uri) {
      return workspaceSymbols;
    }

    const userFunctions: UserFunction[] = cachedEntity.searchAllFunctionNames(query);

    workspaceSymbols = workspaceSymbols.concat(
      userFunctions.map((userFunction: UserFunction) => {
        return new SymbolInformation(
          userFunction.name + "()",
          equalsIgnoreCase(userFunction.name, "init") ? SymbolKind.Constructor : SymbolKind.Function,
          path.basename(userFunction.location.uri.fsPath, COMPONENT_EXT),
          userFunction.location
        );
      })
    );

    const components: Component[] = cachedEntity.searchAllComponentNames(query);
    workspaceSymbols = workspaceSymbols.concat(
      components.map((component: Component) => {
        return new SymbolInformation(
          path.basename(component.uri.fsPath, COMPONENT_EXT),
          component.isInterface ? SymbolKind.Interface : SymbolKind.Class,
          "",
          new Location(component.uri, new Position(0, 0))
        );
      })
    );

    return workspaceSymbols;
  }
}
