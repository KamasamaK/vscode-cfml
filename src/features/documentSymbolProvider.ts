import { CancellationToken, DocumentSymbolProvider, Position, Range, DocumentSymbol, SymbolKind, TextDocument } from "vscode";
import { Component } from "../entities/component";
import { Property } from "../entities/property";
import { getLocalVariables, UserFunction } from "../entities/userFunction";
import { parseVariableAssignments, usesConstantConvention, Variable } from "../entities/variable";
import { DocumentStateContext, getDocumentStateContext } from "../utils/documentUtil";
import { getComponent } from "./cachedEntities";
import { Scope } from "../entities/scope";

export default class CFMLDocumentSymbolProvider implements DocumentSymbolProvider {
  /**
   * Provide symbol information for the given document.
   * @param document The document for which to provide symbols.
   * @param _token A cancellation token.
   */
  public async provideDocumentSymbols(document: TextDocument, _token: CancellationToken): Promise<DocumentSymbol[]> {
    let documentSymbols: DocumentSymbol[] = [];

    if (!document.fileName) {
      return documentSymbols;
    }

    const documentStateContext: DocumentStateContext = getDocumentStateContext(document);

    if (documentStateContext.isCfcFile) {
      documentSymbols = documentSymbols.concat(CFMLDocumentSymbolProvider.getComponentSymbols(documentStateContext));
    } else if (documentStateContext.isCfmFile) {
      documentSymbols = documentSymbols.concat(CFMLDocumentSymbolProvider.getTemplateSymbols(documentStateContext));
    }

    return documentSymbols;
  }

  /**
   * Provide symbol information for component and its contents
   * @param documentStateContext The document context for which to provide symbols.
   */
  private static getComponentSymbols(documentStateContext: DocumentStateContext): DocumentSymbol[] {
    const document: TextDocument = documentStateContext.document;
    const component: Component = getComponent(document.uri);

    let componentSymbol: DocumentSymbol = new DocumentSymbol(
      component.name,
      "",
      component.isInterface ? SymbolKind.Interface : SymbolKind.Class,
      new Range(new Position(0, 0), document.positionAt(document.getText().length)),
      component.declarationRange
    );
    componentSymbol.children = [];

    // Component properties
    let propertySymbols: DocumentSymbol[] = [];
    component.properties.forEach((property: Property, propertyKey: string) => {
      propertySymbols.push(new DocumentSymbol(
        property.name,
        "",
        SymbolKind.Property,
        property.propertyRange,
        property.nameRange
      ));
    });
    componentSymbol.children = componentSymbol.children.concat(propertySymbols);

    // Component variables
    let variableSymbols: DocumentSymbol[] = [];
    component.variables.forEach((variable: Variable) => {
      let detail = "";
      if (variable.scope !== Scope.Unknown) {
        detail = `${variable.scope}.${variable.identifier}`;
      }
      variableSymbols.push(new DocumentSymbol(
        variable.identifier,
        detail,
        usesConstantConvention(variable.identifier) || variable.final ? SymbolKind.Constant : SymbolKind.Variable,
        variable.declarationLocation.range,
        variable.declarationLocation.range
      ));
    });
    componentSymbol.children = componentSymbol.children.concat(variableSymbols);

    // Component functions
    let functionSymbols: DocumentSymbol[] = [];
    component.functions.forEach((userFunction: UserFunction, functionKey: string) => {
      let currFuncSymbol: DocumentSymbol = new DocumentSymbol(
        userFunction.name,
        "",
        functionKey === "init" ? SymbolKind.Constructor : SymbolKind.Method,
        userFunction.location.range,
        userFunction.nameRange
      );
      currFuncSymbol.children = [];

      // Component function local variables
      let localVarSymbols: DocumentSymbol[] = [];
      const localVariables: Variable[] = getLocalVariables(userFunction, documentStateContext, component.isScript);
      localVariables.forEach((variable: Variable) => {
        let detail = "";
        if (variable.scope !== Scope.Unknown) {
          detail = `${variable.scope}.${variable.identifier}`;
        }
        localVarSymbols.push(new DocumentSymbol(
          variable.identifier,
          detail,
          usesConstantConvention(variable.identifier) || variable.final ? SymbolKind.Constant : SymbolKind.Variable,
          variable.declarationLocation.range,
          variable.declarationLocation.range
        ));
      });
      currFuncSymbol.children = currFuncSymbol.children.concat(localVarSymbols);

      functionSymbols.push(currFuncSymbol);
    });
    componentSymbol.children = componentSymbol.children.concat(functionSymbols);

    return [componentSymbol];
  }

  /**
   * Provide symbol information for templates
   * @param documentStateContext The document context for which to provide symbols.
   */
  private static getTemplateSymbols(documentStateContext: DocumentStateContext): DocumentSymbol[] {
    let templateSymbols: DocumentSymbol[] = [];
    // TODO: Cache template variables?
    const allVariables: Variable[] = parseVariableAssignments(documentStateContext, false);
    allVariables.forEach((variable: Variable) => {
      const kind: SymbolKind = usesConstantConvention(variable.identifier) || variable.final ? SymbolKind.Constant : SymbolKind.Variable;
      let detail = "";
      if (variable.scope !== Scope.Unknown) {
        detail = `${variable.scope}.${variable.identifier}`;
      }
      templateSymbols.push(new DocumentSymbol(
        variable.identifier,
        detail,
        kind,
        variable.declarationLocation.range,
        variable.declarationLocation.range
      ));
    });

    // TODO: Include inline functions

    return templateSymbols;
  }
}
