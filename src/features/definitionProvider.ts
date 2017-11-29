import { DefinitionProvider, TextDocument, Position, CancellationToken, Definition, Uri, Range, Location, TextLine } from "vscode";
import { objectReferencePatterns, ReferencePattern, Component, getComponentNameFromDotPath } from "../entities/component";
import { componentPathToUri, getComponent } from "./cachedEntities";
import { isCfcFile } from "../utils/contextUtil";
import { Scope, getValidScopesPrefixPattern } from "../entities/scope";
import { Access, UserFunction, UserFunctionSignature, Argument } from "../entities/userFunction";
import { Property } from "../entities/property";
import { equalsIgnoreCase } from "../utils/textUtil";
import { getFunctionSuffixPattern } from "../entities/function";

export default class CFMLDefinitionProvider implements DefinitionProvider {

  public async provideDefinition(document: TextDocument, position: Position, token: CancellationToken | boolean): Promise<Definition> {
    const results: Definition = [];

    const docIsCfcFile: boolean = isCfcFile(document);
    const documentText: string = document.getText();
    const documentUri: Uri = document.uri;
    const textLine: TextLine = document.lineAt(position);
    const lineText: string = textLine.text;
    let wordRange: Range = document.getWordRangeAtPosition(position);
    const currentWord: string = wordRange ? document.getText(wordRange) : "";
    if (!wordRange) {
      wordRange = new Range(position, position);
    }

    // const docPrefix: string = documentText.slice(0, document.offsetAt(wordRange.start));
    const linePrefix: string = lineText.slice(0, wordRange.start.character);
    const lineSuffix: string = lineText.slice(wordRange.end.character, textLine.range.end.character);
    // const prefixChr: string = docPrefix.trim().length ? docPrefix.trim().slice(-1) : "";
    // const continuingExpression: boolean = isContinuingExpressionPattern(docPrefix);

    // TODO: These references should ideally be in cachedEntities.
    let referenceMatch: RegExpExecArray | null;
    objectReferencePatterns.forEach((element: ReferencePattern) => {
      const pattern: RegExp = element.pattern;
      while ((referenceMatch = pattern.exec(documentText))) {
        const path: string = referenceMatch[element.refIndex];
        const name: string = getComponentNameFromDotPath(path);
        const offset: number = referenceMatch.index + referenceMatch[0].lastIndexOf(name);
        const nameRange = new Range(
          document.positionAt(offset),
          document.positionAt(offset + name.length)
        );

        if (nameRange.contains(position)) {
          const componentUri: Uri = componentPathToUri(path, document.uri);
          if (componentUri) {
            const comp: Component = getComponent(componentUri);
            if (comp) {
              results.push(new Location(
                comp.uri,
                comp.declarationRange
              ));
            }
          }
        }
      }
    });

    if (docIsCfcFile) {
      const comp: Component = getComponent(documentUri);
      if (comp) {
        // Internal functions
        const functionSuffixPattern: RegExp = getFunctionSuffixPattern();
        if (functionSuffixPattern.test(lineSuffix)) {
          const functionKey: string = currentWord.toLowerCase();
          if (comp.functions.has(functionKey)) {
            const userFunc = comp.functions.get(functionKey);
            const validScopes: Scope[] = userFunc.access === Access.Private ? [Scope.Variables] : [Scope.Variables, Scope.This];
            const funcPrefixPattern = getValidScopesPrefixPattern(validScopes, true);
            if (funcPrefixPattern.test(linePrefix)) {
              results.push(new Location(
                comp.uri,
                comp.functions.get(functionKey).nameRange
              ));
            }
          }
        }
        // Extends
        if (comp.extendsRange && comp.extendsRange.contains(position)) {
          const extendsComp: Component = getComponent(comp.extends);
          if (extendsComp) {
            results.push(new Location(
              extendsComp.uri,
              extendsComp.declarationRange
            ));
          }
        }
        // Component functions
        comp.functions.forEach((func: UserFunction) => {
          // Function return types
          if (func.returnTypeUri && func.returnTypeRange.contains(position)) {
            const returnTypeComp: Component = getComponent(func.returnTypeUri);
            results.push(new Location(
              returnTypeComp.uri,
              returnTypeComp.declarationRange
            ));
          }
          // Argument types
          func.signatures.forEach((signature: UserFunctionSignature) => {
            signature.parameters.forEach((param: Argument) => {
              if (param.dataTypeComponentUri && param.dataTypeRange.contains(position)) {
                const argTypeComp: Component = getComponent(param.dataTypeComponentUri);
                results.push(new Location(
                  argTypeComp.uri,
                  argTypeComp.declarationRange
                ));
              }
            });
          });
        });
        // Component properties
        comp.properties.forEach((prop: Property) => {
          // Property types
          if (prop.dataTypeComponentUri && prop.dataTypeRange.contains(position)) {
            const dataTypeComp: Component = getComponent(prop.dataTypeComponentUri);
            results.push(new Location(
              dataTypeComp.uri,
              dataTypeComp.declarationRange
            ));
          }

          const getterSetterPrefixPattern = getValidScopesPrefixPattern([Scope.This], true);
          if (comp.accessors && getterSetterPrefixPattern.test(linePrefix) && /^\s*\(/.test(lineSuffix)) {
            // getters
            if (typeof prop.getter === "undefined" || prop.getter) {
              const getterName = "get" + prop.name;
              if (!comp.functions.has(getterName) && equalsIgnoreCase(getterName, currentWord)) {
                results.push(new Location(
                  comp.uri,
                  prop.nameRange
                ));
              }
            }

            // setters
            if (typeof prop.setter === "undefined" || prop.setter) {
              const setterName = "set" + prop.name;
              if (!comp.functions.has(setterName) && equalsIgnoreCase(setterName, currentWord)) {
                results.push(new Location(
                  comp.uri,
                  prop.nameRange
                ));
              }
            }
          }
        });
      }
    }

    return results;
  }
}
