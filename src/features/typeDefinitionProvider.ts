import { TypeDefinitionProvider, TextDocument, Position, CancellationToken, Definition, Range, Location } from "vscode";
import { Component } from "../entities/component";
import { getComponent } from "./cachedEntities";
import { Scope, getValidScopesPrefixPattern, getVariableScopePrefixPattern, unscopedPrecedence } from "../entities/scope";
import { UserFunction, UserFunctionSignature, Argument, getLocalVariables, getFunctionFromPrefix } from "../entities/userFunction";
import { Property } from "../entities/property";
import { equalsIgnoreCase } from "../utils/textUtil";
import { Variable, parseVariableAssignments, getApplicationVariables, getServerVariables } from "../entities/variable";
import { DocumentPositionStateContext, getDocumentPositionStateContext } from "../utils/documentUtil";

export default class CFMLTypeDefinitionProvider implements TypeDefinitionProvider {

  public async provideTypeDefinition(document: TextDocument, position: Position, _token: CancellationToken): Promise<Definition> {
    const results: Definition = [];

    const documentPositionStateContext: DocumentPositionStateContext = getDocumentPositionStateContext(document, position);

    if (documentPositionStateContext.positionInComment) {
      return null;
    }

    const docIsCfcFile: boolean = documentPositionStateContext.isCfcFile;
    const docIsCfmFile: boolean = documentPositionStateContext.isCfmFile;
    let wordRange: Range = document.getWordRangeAtPosition(position);
    const currentWord: string = documentPositionStateContext.currentWord;
    const lowerCurrentWord: string = currentWord.toLowerCase();
    if (!wordRange) {
      wordRange = new Range(position, position);
    }

    const docPrefix: string = documentPositionStateContext.docPrefix;

    if (docIsCfcFile) {
      const thisComponent: Component = documentPositionStateContext.component;
      if (thisComponent) {
        // Component functions (related)
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

          if (!func.isImplicit && func.bodyRange.contains(position)) {
            // Local variable uses
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

            // Argument uses
            if (results.length === 0) {
              const argumentPrefixPattern = getValidScopesPrefixPattern([Scope.Arguments], true);
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
            }
          }
        });

        // Component properties (declarations)
        thisComponent.properties.filter((prop: Property) => {
          return prop.dataTypeComponentUri !== undefined && prop.nameRange.contains(position);
        }).forEach((prop: Property) => {
          let propTypeComp: Component = getComponent(prop.dataTypeComponentUri);
          if (propTypeComp) {
            results.push(new Location(
              propTypeComp.uri,
              propTypeComp.declarationRange
            ));
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
    } else if (docIsCfmFile) {
      const docVariableAssignments: Variable[] = parseVariableAssignments(documentPositionStateContext, false);
      const variableScopePrefixPattern: RegExp = getVariableScopePrefixPattern();
      const variableScopePrefixMatch: RegExpExecArray = variableScopePrefixPattern.exec(docPrefix);
      if (variableScopePrefixMatch) {
        const validScope: string = variableScopePrefixMatch[1];
        let currentScope: Scope;
        if (validScope) {
          currentScope = Scope.valueOf(validScope);
        }

        docVariableAssignments.filter((variable: Variable) => {
          if (!equalsIgnoreCase(variable.identifier, currentWord) || !variable.dataTypeComponentUri) {
            return false;
          }

          if (currentScope) {
            return (variable.scope === currentScope || (variable.scope === Scope.Unknown && unscopedPrecedence.includes(currentScope)));
          }

          return (unscopedPrecedence.includes(variable.scope) || variable.scope === Scope.Unknown);
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

    // User functions
    const externalUserFunc: UserFunction = await getFunctionFromPrefix(documentPositionStateContext, lowerCurrentWord);
    if (externalUserFunc && externalUserFunc.returnTypeUri) {
      const returnTypeComponent: Component = getComponent(externalUserFunc.returnTypeUri);
      if (returnTypeComponent) {
        results.push(new Location(
          returnTypeComponent.uri,
          returnTypeComponent.declarationRange
        ));
      }
    }

    // Application variables
    const applicationVariablesPrefixPattern = getValidScopesPrefixPattern([Scope.Application, Scope.Session, Scope.Request], false);
    const variableScopePrefixMatch: RegExpExecArray = applicationVariablesPrefixPattern.exec(docPrefix);
    if (variableScopePrefixMatch) {
      const currentScope: string = Scope.valueOf(variableScopePrefixMatch[1]);

      const applicationDocVariables: Variable[] = await getApplicationVariables(document.uri);
      applicationDocVariables.filter((variable: Variable) => {
        return variable.scope === currentScope && equalsIgnoreCase(variable.identifier, currentWord) && variable.dataTypeComponentUri;
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

    // Server variables
    const serverVariablesPrefixPattern = getValidScopesPrefixPattern([Scope.Server], false);
    if (serverVariablesPrefixPattern.test(docPrefix)) {
      const serverDocVariables: Variable[] = getServerVariables(document.uri);
      serverDocVariables.filter((variable: Variable) => {
        return variable.scope === Scope.Server && equalsIgnoreCase(variable.identifier, currentWord) && variable.dataTypeComponentUri;
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

    return results;
  }
}
