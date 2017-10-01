import { workspace, window, Uri, WorkspaceSymbolProvider, SymbolInformation, SymbolKind, Range, Location, CancellationToken, Position, TextEditor, TextDocument } from "vscode";
import * as cachedEntity from "./cachedEntities";
import { UserFunction } from "../entities/userFunction";
import { COMPONENT_EXT, Component } from "../entities/component";
import { LANGUAGE_ID } from "../cfmlMain";
import * as path from "path";
import { equalsIgnoreCase } from "../utils/textUtil";

export default class CFMLWorkspaceSymbolProvider implements WorkspaceSymbolProvider {

  /**
   * Workspace-wide search for a symbol matching the given query string.
   * @param query A non-empty query string.
   * @param token A cancellation token.
   */
  public async provideWorkspaceSymbols(query: string, token: CancellationToken): Promise<SymbolInformation[]> {
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
