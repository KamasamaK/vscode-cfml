import { DocumentSymbolProvider, SymbolInformation, SymbolKind, TextDocument, Range, Location, CancellationToken, Position } from "vscode";
import * as cachedEntity from "./cachedEntities";
import { Component, parseComponent } from "../entities/component";
import { isCfcFile, isCfmFile } from "../utils/contextUtil";
import { Variable, usesConstantConvention, parseVariableAssignments } from "../entities/variable";
import { getLocalVariables, UserFunction } from "../entities/userFunction";
import { Property } from "../entities/property";

export default class CFMLDocumentSymbolProvider implements DocumentSymbolProvider {
  /**
   * Provide symbol information for the given document.
   * @param document The document for which to provide symbols.
   * @param token A cancellation token.
   */
  public async provideDocumentSymbols(document: TextDocument, token: CancellationToken): Promise<SymbolInformation[]> {
    let documentSymbols: SymbolInformation[] = [];

    if (!document.fileName) {
      return documentSymbols;
    }

    if (isCfcFile(document)) {
      documentSymbols = documentSymbols.concat(CFMLDocumentSymbolProvider.getComponentSymbols(document));
    } else if (isCfmFile(document)) {
      documentSymbols = documentSymbols.concat(CFMLDocumentSymbolProvider.getTemplateSymbols(document));
    }

    return documentSymbols;
  }

  /**
   * Provide symbol information for component and its contents
   * @param document The document for which to provide symbols.
   */
  private static getComponentSymbols(document: TextDocument): SymbolInformation[] {
    let componentSymbols: SymbolInformation[] = [];

    const component: Component = parseComponent(document);
    cachedEntity.clearCachedComponent(component.uri);
    cachedEntity.cacheComponent(component);

    componentSymbols.push(new SymbolInformation(
      component.name,
      component.isInterface ? SymbolKind.Interface : SymbolKind.Class,
      "",
      new Location(document.uri, new Range(new Position(0, 0), document.positionAt(document.getText().length)))
    ));

    // Component properties
    component.properties.forEach((property: Property, propertyKey: string) => {
      componentSymbols.push(new SymbolInformation(
        property.name,
        SymbolKind.Property,
        component.name,
        new Location(document.uri, property.propertyRange)
      ));
    });

    // Component variables
    component.variables.forEach((variable: Variable) => {
      componentSymbols.push(new SymbolInformation(
        variable.identifier,
        usesConstantConvention(variable.identifier) ? SymbolKind.Constant : SymbolKind.Variable,
        component.name,
        variable.declarationLocation
      ));
    });

    // Component functions
    component.functions.forEach((userFunction: UserFunction, functionKey: string) => {
      componentSymbols.push(new SymbolInformation(
        userFunction.name,
        functionKey === "init" ? SymbolKind.Constructor : SymbolKind.Function,
        component.name,
        userFunction.location
      ));

      // Component function local variables
      const localVariables: Variable[] = getLocalVariables(userFunction, document, component.isScript);
      localVariables.forEach((variable: Variable) => {
        componentSymbols.push(new SymbolInformation(
          variable.identifier,
          usesConstantConvention(variable.identifier) ? SymbolKind.Constant : SymbolKind.Variable,
          userFunction.name,
          variable.declarationLocation
        ));
      });
    });

    return componentSymbols;
  }

  /**
   * Provide symbol information for templates
   * @param document The document for which to provide symbols.
   */
  private static getTemplateSymbols(document: TextDocument): SymbolInformation[] {
    let templateSymbols: SymbolInformation[] = [];
    // TODO: Cache template variables
    const allVariables: Variable[] = parseVariableAssignments(document, false);
    allVariables.forEach((variable: Variable) => {
      const kind: SymbolKind = usesConstantConvention(variable.identifier) ? SymbolKind.Constant : SymbolKind.Variable;
      templateSymbols.push(new SymbolInformation(
        variable.identifier,
        kind,
        "",
        variable.declarationLocation
      ));
    });

    // TODO: Include inline functions

    return templateSymbols;
  }
}
