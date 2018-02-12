import { DefinitionProvider, TextDocument, Position, CancellationToken, Definition, Uri, Range, Location, TextLine, workspace } from "vscode";
import { objectReferencePatterns, ReferencePattern, Component, getComponentNameFromDotPath, getApplicationUri } from "../entities/component";
import { componentPathToUri, getComponent } from "./cachedEntities";
import { Scope, getValidScopesPrefixPattern, getVariableScopePrefixPattern } from "../entities/scope";
import { Access, UserFunction, UserFunctionSignature, Argument, getLocalVariables, getFunctionFromPrefix, ComponentFunctions } from "../entities/userFunction";
import { Property, getImplicitFunctions } from "../entities/property";
import { equalsIgnoreCase } from "../utils/textUtil";
import { getFunctionSuffixPattern } from "../entities/function";
import { Variable, variableExpressionPrefix, parseVariableAssignments } from "../entities/variable";
import { DocumentPositionStateContext, getDocumentPositionStateContext, DocumentStateContext, getDocumentStateContext } from "../utils/documentUtil";

export default class CFMLDefinitionProvider implements DefinitionProvider {

  public async provideDefinition(document: TextDocument, position: Position, token: CancellationToken | boolean): Promise<Definition> {
    const results: Definition = [];

    const documentPositionStateContext: DocumentPositionStateContext = getDocumentPositionStateContext(document, position);

    if (documentPositionStateContext.positionInComment) {
      return null;
    }

    const docIsCfcFile: boolean = documentPositionStateContext.isCfcFile;
    const docIsCfmFile: boolean = documentPositionStateContext.isCfmFile;
    const documentText: string = documentPositionStateContext.sanitizedDocumentText;
    const textLine: TextLine = document.lineAt(position);
    const lineText: string = textLine.text;
    let wordRange: Range = document.getWordRangeAtPosition(position);
    const currentWord: string = documentPositionStateContext.currentWord;
    const lowerCurrentWord: string = currentWord.toLowerCase();
    if (!wordRange) {
      wordRange = new Range(position, position);
    }

    const docPrefix: string = documentPositionStateContext.docPrefix;
    const lineSuffix: string = lineText.slice(wordRange.end.character, textLine.range.end.character);

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

          const getterSetterPrefixPattern = getValidScopesPrefixPattern([Scope.This], true);

          while (currComponent) {
            if (currComponent.functions.has(lowerCurrentWord)) {
              const userFun: UserFunction = currComponent.functions.get(lowerCurrentWord);
              const validScopes: Scope[] = userFun.access === Access.Private ? [Scope.Variables] : [Scope.Variables, Scope.This];
              const funcPrefixPattern = getValidScopesPrefixPattern(validScopes, true);
              if (!checkScope || funcPrefixPattern.test(docPrefix)) {
                results.push(new Location(
                  currComponent.uri,
                  userFun.nameRange
                ));
                break;
              }
            }

            if (getterSetterPrefixPattern.test(docPrefix)) {
              const implicitFunctions: ComponentFunctions = getImplicitFunctions(currComponent);
              if (implicitFunctions.has(lowerCurrentWord)) {
                const implicitFunc: UserFunction = implicitFunctions.get(lowerCurrentWord);
                results.push(new Location(
                  implicitFunc.location.uri,
                  implicitFunc.nameRange
                ));
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
        // Extends
        if (thisComponent.extendsRange && thisComponent.extendsRange.contains(position)) {
          const extendsComp: Component = getComponent(thisComponent.extends);
          if (extendsComp) {
            results.push(new Location(
              extendsComp.uri,
              extendsComp.declarationRange
            ));
          }
        }
        // Component functions
        thisComponent.functions.forEach((func: UserFunction) => {
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
            signature.parameters.filter((arg: Argument) => {
              return arg.dataTypeComponentUri && arg.dataTypeRange.contains(position);
            }).forEach((arg: Argument) => {
              const argTypeComp: Component = getComponent(arg.dataTypeComponentUri);
              results.push(new Location(
                argTypeComp.uri,
                argTypeComp.declarationRange
              ));
            });
          });
          // This function
          if (func.bodyRange.contains(position)) {
            // Argument uses
            const argumentPrefixPattern = getValidScopesPrefixPattern([Scope.Arguments], false);
            if (argumentPrefixPattern.test(docPrefix)) {
              func.signatures.forEach((signature: UserFunctionSignature) => {
                signature.parameters.filter((arg: Argument) => {
                  return equalsIgnoreCase(arg.name, currentWord);
                }).forEach((arg: Argument) => {
                  results.push(new Location(
                    thisComponent.uri,
                    arg.nameRange
                  ));
                });
              });
            }
            // Local variables
            const localVariables = getLocalVariables(func, documentPositionStateContext, thisComponent.isScript);
            const localVarPrefixPattern = getValidScopesPrefixPattern([Scope.Local], true);
            if (localVarPrefixPattern.test(docPrefix)) {
              localVariables.filter((localVar: Variable) => {
                return position.isAfterOrEqual(localVar.declarationLocation.range.start) && equalsIgnoreCase(localVar.identifier, currentWord);
              }).forEach((localVar: Variable) => {
                results.push(localVar.declarationLocation);
              });
            }
          }
        });
        // Component properties
        thisComponent.properties.forEach((prop: Property) => {
          // Property types
          if (prop.dataTypeComponentUri && prop.dataTypeRange.contains(position)) {
            const dataTypeComp: Component = getComponent(prop.dataTypeComponentUri);
            results.push(new Location(
              dataTypeComp.uri,
              dataTypeComp.declarationRange
            ));
          }
        });
        // Component variables
        const variablesPrefixPattern = getValidScopesPrefixPattern([Scope.Variables], false);
        if (variablesPrefixPattern.test(docPrefix)) {
          thisComponent.variables.filter((variable: Variable) => {
            return equalsIgnoreCase(variable.identifier, currentWord);
          }).forEach((variable: Variable) => {
            results.push(variable.declarationLocation);
          });
        }
      }
    } else if (docIsCfmFile) {
      const docVariableAssignments: Variable[] = parseVariableAssignments(documentPositionStateContext, false);

      const variableScopePrefixPattern: RegExp = getVariableScopePrefixPattern();
      const variableScopePrefixMatch: RegExpExecArray = variableScopePrefixPattern.exec(docPrefix);
      if (variableScopePrefixMatch) {
        const validScope: string = variableScopePrefixMatch[1];

        docVariableAssignments.filter((variable: Variable) => {
          if (!equalsIgnoreCase(variable.identifier, currentWord)) {
            return false;
          }
          if (validScope) {
            const currentScope: Scope = Scope.valueOf(validScope);
            return [currentScope, Scope.Unknown].includes(variable.scope);
          }

          return true;
        }).forEach((variable: Variable) => {
          results.push(variable.declarationLocation);
        });
      }
    }

    // External functions
    const externalUserFunc: UserFunction = await getFunctionFromPrefix(documentPositionStateContext, docPrefix, lowerCurrentWord);
    if (externalUserFunc) {
      results.push(new Location(
        externalUserFunc.location.uri,
        externalUserFunc.nameRange
      ));
    }

    // Application variables
    const variablesPrefixPattern = getValidScopesPrefixPattern([Scope.Application], false);
    if (variablesPrefixPattern.test(docPrefix)) {
      const applicationUri: Uri = getApplicationUri(document.uri);

      if (applicationUri) {
        const applicationDoc: TextDocument = await workspace.openTextDocument(applicationUri);
        const applicationDocStateContext: DocumentStateContext = getDocumentStateContext(applicationDoc);
        const applicationDocVariables = parseVariableAssignments(applicationDocStateContext, applicationDocStateContext.docIsScript);
        applicationDocVariables.filter((variable: Variable) => {
          return variable.scope === Scope.Application && equalsIgnoreCase(variable.identifier, currentWord);
        }).forEach((variable: Variable) => {
          results.push(variable.declarationLocation);
        });
      }
    }

    return results;
  }
}
