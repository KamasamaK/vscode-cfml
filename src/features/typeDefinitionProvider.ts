import { TypeDefinitionProvider, TextDocument, Position, CancellationToken, Definition, Range, Location, TextLine } from "vscode";
import { Component } from "../entities/component";
import { getComponent } from "./cachedEntities";
import { Scope, getValidScopesPrefixPattern } from "../entities/scope";
import { Access, UserFunction, UserFunctionSignature, Argument, getLocalVariables } from "../entities/userFunction";
import { Property } from "../entities/property";
import { equalsIgnoreCase } from "../utils/textUtil";
import { getFunctionSuffixPattern } from "../entities/function";
import { Variable, variableExpressionPrefix } from "../entities/variable";
import { DocumentPositionStateContext, getDocumentPositionStateContext } from "../utils/documentUtil";

export default class CFMLTypeDefinitionProvider implements TypeDefinitionProvider {

  public async provideTypeDefinition(document: TextDocument, position: Position, token: CancellationToken | boolean): Promise<Definition> {
    const results: Definition = [];

    const documentPositionStateContext: DocumentPositionStateContext = getDocumentPositionStateContext(document, position);

    if (documentPositionStateContext.positionInComment) {
      return null;
    }

    const docIsCfcFile: boolean = documentPositionStateContext.isCfcFile;
    const textLine: TextLine = document.lineAt(position);
    const lineText: string = textLine.text;
    let wordRange: Range = document.getWordRangeAtPosition(position);
    const currentWord: string = documentPositionStateContext.currentWord;
    if (!wordRange) {
      wordRange = new Range(position, position);
    }

    const docPrefix: string = documentPositionStateContext.docPrefix;
    const lineSuffix: string = lineText.slice(wordRange.end.character, textLine.range.end.character);

    if (docIsCfcFile) {
      const varPrefixMatch: RegExpExecArray = variableExpressionPrefix.exec(docPrefix);
      const thisComponent: Component = documentPositionStateContext.component;
      if (thisComponent) {
        // Internal functions
        const functionSuffixPattern: RegExp = getFunctionSuffixPattern();
        if (functionSuffixPattern.test(lineSuffix)) {
          let currComponent: Component = thisComponent;
          let checkScope: boolean = true;
          // If preceded by super keyword, start at base component
          if (thisComponent.extends && varPrefixMatch) {
            const varMatchText: string = varPrefixMatch[0];
            const varScope: string = varPrefixMatch[2];
            // const varQuote: string = varPrefixMatch[3];
            const varName: string = varPrefixMatch[4];

            if (varMatchText.split(".").length === 2 && !varScope && equalsIgnoreCase(varName, "super")) {
              currComponent = getComponent(thisComponent.extends);
              checkScope = false;
            }
          }
          while (currComponent) {
            if (currComponent.functions.has(currentWord.toLowerCase())) {
              const userFun: UserFunction = currComponent.functions.get(currentWord.toLowerCase());
              const validScopes: Scope[] = userFun.access === Access.Private ? [Scope.Variables] : [Scope.Variables, Scope.This];
              const funcPrefixPattern = getValidScopesPrefixPattern(validScopes, true);
              if (!checkScope || funcPrefixPattern.test(docPrefix)) {
                if (userFun.returnTypeUri) {
                  const returnTypeComponent: Component = getComponent(userFun.returnTypeUri);
                  results.push(new Location(
                    returnTypeComponent.uri,
                    returnTypeComponent.declarationRange
                  ));
                }
                break;
              }
            }
            if (currComponent.extends) {
              currComponent = getComponent(currComponent.extends);
            } else {
              currComponent = undefined;
            }
          }
        }

        // Component functions
        thisComponent.functions.forEach((func: UserFunction) => {
          // Argument declarations
          func.signatures.forEach((signature: UserFunctionSignature) => {
            signature.parameters.filter((arg: Argument) => {
              return arg.dataTypeComponentUri && arg.nameRange.contains(position);
            }).forEach((arg: Argument) => {
              const argTypeComp: Component = getComponent(arg.dataTypeComponentUri);
              if (argTypeComp) {
                results.push(new Location(
                  argTypeComp.uri,
                  argTypeComp.declarationRange
                ));
              }
            });
          });
          // This function
          if (func.bodyRange.contains(position)) {
            // Argument uses
            const argumentPrefixPattern = getValidScopesPrefixPattern([Scope.Arguments], false);
            if (argumentPrefixPattern.test(docPrefix)) {
              func.signatures.forEach((signature: UserFunctionSignature) => {
                signature.parameters.filter((arg: Argument) => {
                  return equalsIgnoreCase(arg.name, currentWord) && arg.dataTypeComponentUri;
                }).forEach((arg: Argument) => {
                  const argTypeComp: Component = getComponent(arg.dataTypeComponentUri);
                  if (argTypeComp) {
                    results.push(new Location(
                      argTypeComp.uri,
                      argTypeComp.declarationRange
                    ));
                  }
                });
              });
            }
            // Local variables
            const localVariables = getLocalVariables(func, documentPositionStateContext, thisComponent.isScript);
            const localVarPrefixPattern = getValidScopesPrefixPattern([Scope.Local], true);
            if (localVarPrefixPattern.test(docPrefix)) {
              localVariables.filter((localVar: Variable) => {
                return position.isAfterOrEqual(localVar.declarationLocation.range.start) && equalsIgnoreCase(localVar.identifier, currentWord) && localVar.dataTypeComponentUri;
              }).forEach((localVar: Variable) => {
                const localVarTypeComp: Component = getComponent(localVar.dataTypeComponentUri);
                if (localVarTypeComp) {
                  results.push(new Location(
                    localVarTypeComp.uri,
                    localVarTypeComp.declarationRange
                  ));
                }
              });
            }
          }
        });
        // Component properties
        thisComponent.properties.forEach((prop: Property) => {
          let propTypeComp: Component;
          if (prop.dataTypeComponentUri) {
            propTypeComp = getComponent(prop.dataTypeComponentUri);
          }

          // Property declarations
          if (propTypeComp && prop.nameRange.contains(position)) {
            results.push(new Location(
              propTypeComp.uri,
              propTypeComp.declarationRange
            ));
          }

          const getterSetterPrefixPattern = getValidScopesPrefixPattern([Scope.This], true);
          if (thisComponent.accessors && getterSetterPrefixPattern.test(docPrefix) && /^\s*\(/.test(lineSuffix)) {
            // getters
            if (propTypeComp && (typeof prop.getter === "undefined" || prop.getter)) {
              const getterName = "get" + prop.name;
              if (!thisComponent.functions.has(getterName) && equalsIgnoreCase(getterName, currentWord)) {
                results.push(new Location(
                  propTypeComp.uri,
                  propTypeComp.declarationRange
                ));
              }
            }

            // setters
            if (typeof prop.setter === "undefined" || prop.setter) {
              const setterName = "set" + prop.name;
              if (!thisComponent.functions.has(setterName) && equalsIgnoreCase(setterName, currentWord)) {
                results.push(new Location(
                  thisComponent.uri,
                  thisComponent.declarationRange
                ));
              }
            }
          }
        });
        // Component variables
        const variablesPrefixPattern = getValidScopesPrefixPattern([Scope.Variables], false);
        if (variablesPrefixPattern.test(docPrefix)) {
          thisComponent.variables.filter((variable: Variable) => {
            return equalsIgnoreCase(variable.identifier, currentWord) && variable.dataTypeComponentUri;
          }).forEach((variable: Variable) => {
            const varTypeComp: Component = getComponent(variable.dataTypeComponentUri);
            if (varTypeComp) {
              results.push(new Location(
                varTypeComp.uri,
                varTypeComp.declarationRange
              ));
            }
          });
        }
      }
    } else {
      // TODO: For templates
    }

    return results;
  }
}
