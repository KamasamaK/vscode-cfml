import { DefinitionProvider, TextDocument, Position, CancellationToken, Definition, Uri, Range, Location, workspace, WorkspaceConfiguration } from "vscode";
import { objectReferencePatterns, ReferencePattern, Component, getComponentNameFromDotPath } from "../entities/component";
import { componentPathToUri, getComponent } from "./cachedEntities";
import { Scope, getValidScopesPrefixPattern, getVariableScopePrefixPattern, unscopedPrecedence } from "../entities/scope";
import { UserFunction, UserFunctionSignature, Argument, getLocalVariables, getFunctionFromPrefix } from "../entities/userFunction";
import { Property } from "../entities/property";
import { equalsIgnoreCase } from "../utils/textUtil";
import { Variable, parseVariableAssignments, getApplicationVariables, getServerVariables } from "../entities/variable";
import { DocumentPositionStateContext, getDocumentPositionStateContext } from "../utils/documentUtil";

export default class CFMLDefinitionProvider implements DefinitionProvider {

  public async provideDefinition(document: TextDocument, position: Position, token: CancellationToken | boolean): Promise<Definition> {
    const cfmlDefinitionSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml.definition", document.uri);
    if (!cfmlDefinitionSettings.get<boolean>("enable", true)) {
      return null;
    }

    const documentPositionStateContext: DocumentPositionStateContext = getDocumentPositionStateContext(document, position);

    if (documentPositionStateContext.positionInComment) {
      return null;
    }

    const results: Definition = [];

    const docIsCfcFile: boolean = documentPositionStateContext.isCfcFile;
    const docIsCfmFile: boolean = documentPositionStateContext.isCfmFile;
    const documentText: string = documentPositionStateContext.sanitizedDocumentText;
    let wordRange: Range = document.getWordRangeAtPosition(position);
    const currentWord: string = documentPositionStateContext.currentWord;
    const lowerCurrentWord: string = currentWord.toLowerCase();
    if (!wordRange) {
      wordRange = new Range(position, position);
    }

    const docPrefix: string = documentPositionStateContext.docPrefix;

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
      const thisComponent: Component = documentPositionStateContext.component;
      if (thisComponent) {
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

        // Component functions (related)
        thisComponent.functions.forEach((func: UserFunction) => {
          // Function return types
          if (func.returnTypeUri && func.returnTypeRange.contains(position)) {
            const returnTypeComp: Component = getComponent(func.returnTypeUri);
            if (returnTypeComp) {
              results.push(new Location(
                returnTypeComp.uri,
                returnTypeComp.declarationRange
              ));
            }
          }

          // Argument types
          func.signatures.forEach((signature: UserFunctionSignature) => {
            signature.parameters.filter((arg: Argument) => {
              return arg.dataTypeComponentUri && arg.dataTypeRange.contains(position);
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
            // Local variable uses
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

        // Component properties (declarations)
        thisComponent.properties.filter((prop: Property) => {
          return prop.dataTypeComponentUri !== undefined && prop.dataTypeRange.contains(position);
        }).forEach((prop: Property) => {
          const dataTypeComp: Component = getComponent(prop.dataTypeComponentUri);
          if (dataTypeComp) {
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
            return (variable.scope === currentScope || (variable.scope === Scope.Unknown && unscopedPrecedence.includes(currentScope)));
          }

          return (unscopedPrecedence.includes(variable.scope) || variable.scope === Scope.Unknown);
        }).forEach((variable: Variable) => {
          results.push(variable.declarationLocation);
        });
      }
    }

    // User function
    const externalUserFunc: UserFunction = await getFunctionFromPrefix(documentPositionStateContext, lowerCurrentWord);
    if (externalUserFunc) {
      results.push(new Location(
        externalUserFunc.location.uri,
        externalUserFunc.nameRange
      ));
    }

    // Application variables
    const applicationVariablesPrefixPattern = getValidScopesPrefixPattern([Scope.Application, Scope.Session, Scope.Request], false);
    const variableScopePrefixMatch: RegExpExecArray = applicationVariablesPrefixPattern.exec(docPrefix);
    if (variableScopePrefixMatch) {
      const currentScope: string = Scope.valueOf(variableScopePrefixMatch[1]);

      const applicationDocVariables: Variable[] = await getApplicationVariables(document.uri);
      applicationDocVariables.filter((variable: Variable) => {
        return variable.scope === currentScope && equalsIgnoreCase(variable.identifier, currentWord);
      }).forEach((variable: Variable) => {
        results.push(variable.declarationLocation);
      });
    }

    // Server variables
    const serverVariablesPrefixPattern = getValidScopesPrefixPattern([Scope.Server], false);
    if (serverVariablesPrefixPattern.test(docPrefix)) {
      const serverDocVariables: Variable[] = getServerVariables(document.uri);
      serverDocVariables.filter((variable: Variable) => {
        return variable.scope === Scope.Server && equalsIgnoreCase(variable.identifier, currentWord);
      }).forEach((variable: Variable) => {
        results.push(variable.declarationLocation);
      });
    }

    return results;
  }
}
