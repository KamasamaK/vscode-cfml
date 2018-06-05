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
import { textToMarkdownString } from "../utils/textUtil";
import { getFunctionFromPrefix, UserFunction } from "../entities/userFunction";
import { getDocumentPositionStateContext, DocumentPositionStateContext } from "../utils/documentUtil";
import { BackwardIterator, readArguments, getPrecedingIdentifierRange, isContinuingExpression } from "../utils/contextUtil";

export default class CFMLSignatureHelpProvider implements SignatureHelpProvider {
  /**
   * Provide help for the signature at the given position and document.
   * @param document The document in which the command was invoked.
   * @param position The position at which the command was invoked.
   * @param token A cancellation token.
   */
  public async provideSignatureHelp(document: TextDocument, position: Position, token: CancellationToken): Promise<SignatureHelp | null> {
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

      // Check user function
      if (!entry) {
        const userFun: UserFunction = await getFunctionFromPrefix(documentPositionStateContext, lowerIdent, startIdentPositionPrefix);

        // Ensure this does not trigger on script function definition
        if (userFun && userFun.location.range.contains(position) && !userFun.bodyRange.contains(position)) {
          return null;
        }

        entry = userFun;
      }
    }

    if (!entry) {
      return null;
    }

    let sigHelp = new SignatureHelp();

    entry.signatures.forEach((signature: Signature) => {
      const sigDesc: string = signature.description  ? signature.description : entry.description;
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


