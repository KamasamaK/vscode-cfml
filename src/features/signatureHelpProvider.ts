import { CancellationToken, ParameterInformation, Position, Range, SignatureHelp, SignatureHelpProvider, SignatureInformation, TextDocument, Uri, workspace, WorkspaceConfiguration, SignatureHelpContext } from "vscode";
import { Component, objectNewInstanceInitPrefix } from "../entities/component";
import { DataType } from "../entities/dataType";
import { constructSyntaxString, Function, getScriptFunctionArgRanges } from "../entities/function";
import { Parameter, namedParameterPattern } from "../entities/parameter";
import { getVariableScopePrefixPattern, Scope, unscopedPrecedence } from "../entities/scope";
import { constructSignatureLabelParamsPrefix, getSignatureParamsLabelOffsetTuples, Signature } from "../entities/signature";
import { getFunctionFromPrefix, isUserFunctionVariable, UserFunction, UserFunctionVariable, variablesToUserFunctions } from "../entities/userFunction";
import { collectDocumentVariableAssignments, Variable } from "../entities/variable";
import { BackwardIterator, getPrecedingIdentifierRange, isContinuingExpression, getStartSigPosition as findStartSigPosition, getClosingPosition } from "../utils/contextUtil";
import { DocumentPositionStateContext, getDocumentPositionStateContext } from "../utils/documentUtil";
import { equalsIgnoreCase, textToMarkdownString } from "../utils/textUtil";
import * as cachedEntity from "./cachedEntities";
import { componentPathToUri, getComponent } from "./cachedEntities";

export default class CFMLSignatureHelpProvider implements SignatureHelpProvider {
  /**
   * Provide help for the signature at the given position and document.
   * @param document The document in which the command was invoked.
   * @param position The position at which the command was invoked.
   * @param _token A cancellation token.
   * @param _context Information about how signature help was triggered.
   */
  public async provideSignatureHelp(document: TextDocument, position: Position, _token: CancellationToken, _context: SignatureHelpContext): Promise<SignatureHelp | null> {
    const cfmlSignatureSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml.signature", document.uri);
    if (!cfmlSignatureSettings.get<boolean>("enable", true)) {
      return null;
    }

    const documentPositionStateContext: DocumentPositionStateContext = getDocumentPositionStateContext(document, position);

    if (documentPositionStateContext.positionInComment) {
      return null;
    }

    const sanitizedDocumentText: string = documentPositionStateContext.sanitizedDocumentText;

    let backwardIterator: BackwardIterator = new BackwardIterator(documentPositionStateContext, position);

    backwardIterator.next();
    const iteratedSigPosition: Position = findStartSigPosition(backwardIterator);
    if (!iteratedSigPosition) {
      return null;
    }

    const startSigPosition: Position = document.positionAt(document.offsetAt(iteratedSigPosition) + 2);
    const endSigPosition: Position = getClosingPosition(documentPositionStateContext, document.offsetAt(startSigPosition), ")").translate(0, -1);
    const functionArgRanges: Range[] = getScriptFunctionArgRanges(documentPositionStateContext, new Range(startSigPosition, endSigPosition));

    let paramIndex: number = 0;
    paramIndex = functionArgRanges.findIndex((range: Range) => {
      return range.contains(position);
    });
    if (paramIndex === -1) {
      return null;
    }
    const paramText: string = sanitizedDocumentText.slice(document.offsetAt(functionArgRanges[paramIndex].start), document.offsetAt(functionArgRanges[paramIndex].end));

    const startSigPositionPrefix: string = sanitizedDocumentText.slice(0, document.offsetAt(startSigPosition));

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
      let identWordRange: Range = getPrecedingIdentifierRange(documentPositionStateContext, backwardIterator.getPosition());
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
        if (userFun && !userFun.isImplicit && userFun.location.uri === document.uri && userFun.location.range.contains(position) && !userFun.bodyRange.contains(position)) {
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

    entry.signatures.forEach((signature: Signature, sigIndex: number) => {
      const sigDesc: string = signature.description ? signature.description : entry.description;
      const sigLabel: string = constructSyntaxString(entry, sigIndex);
      let signatureInfo = new SignatureInformation(sigLabel, textToMarkdownString(sigDesc));

      const sigParamsPrefixLength: number = constructSignatureLabelParamsPrefix(entry).length + 1;
      const sigParamsLabelOffsetTuples: [number, number][] = getSignatureParamsLabelOffsetTuples(signature.parameters).map((val: [number, number]) => {
        return [val[0] + sigParamsPrefixLength, val[1] + sigParamsPrefixLength] as [number, number];
      });

      signatureInfo.parameters = signature.parameters.map((param: Parameter, paramIdx: number) => {
        let paramInfo: ParameterInformation = new ParameterInformation(sigParamsLabelOffsetTuples[paramIdx], textToMarkdownString(param.description));
        return paramInfo;
      });
      sigHelp.signatures.push(signatureInfo);
    });

    sigHelp.activeSignature = 0;
    for (let i = 0; i < sigHelp.signatures.length; i++) {
      const currSig = sigHelp.signatures[i];
      if (paramIndex < currSig.parameters.length) {
        sigHelp.activeSignature = i;
        break;
      }
    }

    // Consider named parameters
    let namedParamMatch: RegExpExecArray = null;
    if (namedParamMatch = namedParameterPattern.exec(paramText)) {
      const paramName: string = namedParamMatch[1];
      const namedParamIndex: number = entry.signatures[sigHelp.activeSignature].parameters.findIndex((param: Parameter) => {
        return equalsIgnoreCase(paramName, param.name);
      });
      if (namedParamIndex !== -1) {
        paramIndex = namedParamIndex;
      }
    }

    sigHelp.activeParameter = Math.min(paramIndex, sigHelp.signatures[sigHelp.activeSignature].parameters.length - 1);

    return sigHelp;
  }
}


