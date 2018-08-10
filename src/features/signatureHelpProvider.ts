import {
  SignatureHelpProvider, SignatureHelp, SignatureInformation, ParameterInformation, CancellationToken,
  TextDocument, Position, Range, WorkspaceConfiguration, workspace, Uri
} from "vscode";
import * as cachedEntity from "./cachedEntities";
import { Function, getSyntaxString } from "../entities/function";
import { Signature } from "../entities/signature";
import { Component, objectNewInstanceInitPrefix } from "../entities/component";
import { getComponent, componentPathToUri } from "./cachedEntities";
import { Parameter, constructParameterLabel } from "../entities/parameter";
import { textToMarkdownString, equalsIgnoreCase } from "../utils/textUtil";
import { getFunctionFromPrefix, UserFunction, variablesToUserFunctions, isUserFunctionVariable, UserFunctionVariable } from "../entities/userFunction";
import { getDocumentPositionStateContext, DocumentPositionStateContext } from "../utils/documentUtil";
import { BackwardIterator, readArguments, getPrecedingIdentifierRange, isContinuingExpression } from "../utils/contextUtil";
import { collectDocumentVariableAssignments, Variable } from "../entities/variable";
import { DataType } from "../entities/dataType";
import { getVariableScopePrefixPattern, Scope, unscopedPrecedence } from "../entities/scope";

export default class CFMLSignatureHelpProvider implements SignatureHelpProvider {
  /**
   * Provide help for the signature at the given position and document.
   * @param document The document in which the command was invoked.
   * @param position The position at which the command was invoked.
   * @param _token A cancellation token.
   */
  public async provideSignatureHelp(document: TextDocument, position: Position, _token: CancellationToken): Promise<SignatureHelp | null> {
    const cfmlSignatureSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml.signature", document.uri);
    if (!cfmlSignatureSettings.get<boolean>("enable", true)) {
      return null;
    }

    const documentPositionStateContext: DocumentPositionStateContext = getDocumentPositionStateContext(document, position);

    if (documentPositionStateContext.positionInComment) {
      return null;
    }

    const sanitizedDocumentText: string = documentPositionStateContext.sanitizedDocumentText;

    let iterator: BackwardIterator = new BackwardIterator(document, new Position(position.line, position.character - 1));

    let functionArgs: string[] = readArguments(iterator);
    const paramCount: number = functionArgs.length - 1;
    if (paramCount < 0) {
      return null;
    }

    const startSigPosition: Position = iterator.getPosition();
    const startSigPositionPrefix: string = sanitizedDocumentText.slice(0, document.offsetAt(startSigPosition) + 2);

    let entry: Function;

    // Check if initializing via "new" operator
    const objectNewInstanceInitPrefixMatch: RegExpExecArray = objectNewInstanceInitPrefix.exec(startSigPositionPrefix);
    if (objectNewInstanceInitPrefixMatch) {
      const componentDotPath: string = objectNewInstanceInitPrefixMatch[2];
      const componentUri: Uri = componentPathToUri(componentDotPath, document.uri);
      if (componentUri) {
        const initComponent: Component = getComponent(componentUri);
        if (initComponent) {
          const initMethod: string = initComponent.initmethod ? initComponent.initmethod.toLowerCase() : "init";
          if (initComponent.functions.has(initMethod)) {
            entry = initComponent.functions.get(initMethod);
          }
        }
      }
    }

    if (!entry) {
      const identWordRange: Range = getPrecedingIdentifierRange(document, iterator.getPosition());
      if (!identWordRange) {
        return null;
      }

      const ident: string = document.getText(identWordRange);
      const lowerIdent: string = ident.toLowerCase();

      const startIdentPositionPrefix: string = sanitizedDocumentText.slice(0, document.offsetAt(identWordRange.start));

      // Global function
      if (!isContinuingExpression(startIdentPositionPrefix)) {
        entry = cachedEntity.getGlobalFunction(lowerIdent);
      }

      // Check user functions
      if (!entry) {
        const userFun: UserFunction = await getFunctionFromPrefix(documentPositionStateContext, lowerIdent, startIdentPositionPrefix);

        // Ensure this does not trigger on script function definition
        if (userFun && !userFun.isImplicit && userFun.location.range.contains(position) && !userFun.bodyRange.contains(position)) {
          return null;
        }

        entry = userFun;
      }

      // Check variables
      if (!entry) {
        const variableScopePrefixPattern: RegExp = getVariableScopePrefixPattern();
        const variableScopePrefixMatch: RegExpExecArray = variableScopePrefixPattern.exec(startIdentPositionPrefix);
        if (variableScopePrefixMatch) {
          const scopePrefix: string = variableScopePrefixMatch[1];
          let prefixScope: Scope;
          if (scopePrefix) {
            prefixScope = Scope.valueOf(scopePrefix);
          }
          const allDocumentVariableAssignments: Variable[] = collectDocumentVariableAssignments(documentPositionStateContext);
          const userFunctionVariables: UserFunctionVariable[] = allDocumentVariableAssignments.filter((variable: Variable) => {
            if (variable.dataType !== DataType.Function || !isUserFunctionVariable(variable) || !equalsIgnoreCase(variable.identifier, lowerIdent)) {
              return false;
            }

            if (prefixScope) {
              return (variable.scope === prefixScope || (variable.scope === Scope.Unknown && unscopedPrecedence.includes(prefixScope)));
            }

            return (unscopedPrecedence.includes(variable.scope) || variable.scope === Scope.Unknown);
          }).map((variable: Variable) => {
            return variable as UserFunctionVariable;
          });
          const userFunctions: UserFunction[] = variablesToUserFunctions(userFunctionVariables);
          if (userFunctions.length > 0) {
            entry = userFunctions[0];
          }
        }
      }
    }

    if (!entry) {
      return null;
    }

    let sigHelp = new SignatureHelp();

    entry.signatures.forEach((signature: Signature) => {
      const sigDesc: string = signature.description ? signature.description : entry.description;
      let signatureInfo = new SignatureInformation(getSyntaxString(entry), textToMarkdownString(sigDesc));
      signatureInfo.parameters = signature.parameters.map((param: Parameter) => {
        return new ParameterInformation(constructParameterLabel(param), textToMarkdownString(param.description));
      });
      sigHelp.signatures.push(signatureInfo);
    });

    sigHelp.activeSignature = 0;

    for (let i = 0; i < sigHelp.signatures.length; i++) {
      const currSig = sigHelp.signatures[i];
      if (paramCount < currSig.parameters.length) {
        sigHelp.activeSignature = i;
        break;
      }
    }
    sigHelp.activeParameter = Math.min(paramCount, sigHelp.signatures[sigHelp.activeSignature].parameters.length - 1);

    return sigHelp;
  }
}


