import { DocumentSymbolProvider, SymbolInformation, SymbolKind, TextDocument, Range, Location, CancellationToken, Position } from "vscode";
import * as path from "path";
import * as cachedEntity from "./cachedEntities";
import { Component, ComponentsByUri, COMPONENT_EXT, parseComponent } from "../entities/component";
import { isCfcFile, isCfmFile, getCfScriptRanges } from "../utils/contextUtil";
import { Variable, usesConstantConvention, parseVariables } from "../entities/variable";
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
    const filePath: string = document.fileName;
    if (!filePath) {
      return documentSymbols;
    }

    if (isCfcFile(document)) {
      const componentSymbols: SymbolInformation[] = CFMLDocumentSymbolProvider.getComponentSymbols(document);
      documentSymbols = documentSymbols.concat(componentSymbols);
    } else if (isCfmFile(document)) {
      const templateSymbols: SymbolInformation[] = CFMLDocumentSymbolProvider.getTemplateSymbols(document);
      documentSymbols = documentSymbols.concat(templateSymbols);
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

    component.properties.forEach((property: Property, propertyKey: string) => {
      componentSymbols.push(new SymbolInformation(
        property.name,
        SymbolKind.Property,
        component.name,
        new Location(document.uri, property.propertyRange)
      ));
    });

    component.variables.forEach((variable: Variable) => {
      const kind: SymbolKind = usesConstantConvention(variable.identifier) ? SymbolKind.Constant : SymbolKind.Variable;
      componentSymbols.push(new SymbolInformation(
        variable.identifier,
        kind,
        component.name,
        variable.declarationLocation
      ));
    });

    component.functions.forEach((userFunction: UserFunction, functionKey: string) => {
      componentSymbols.push(new SymbolInformation(
        userFunction.name,
        functionKey === "init" ? SymbolKind.Constructor : SymbolKind.Function,
        component.name,
        userFunction.location
      ));

      const localVariables: Variable[] = getLocalVariables(userFunction, document, component.isScript);
      localVariables.forEach((variable: Variable) => {
        componentSymbols.push(new SymbolInformation(
          variable.identifier,
          SymbolKind.Variable,
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
    const allVariables: Variable[] = parseVariables(document, false);
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
