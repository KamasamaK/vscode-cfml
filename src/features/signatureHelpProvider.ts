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
import { UserFunction, Access } from "../entities/userFunction";
import { getDocumentPositionStateContext, DocumentPositionStateContext } from "../utils/documentUtil";
import { Scope, getValidScopesPrefixPattern } from "../entities/scope";
import { variableExpressionPrefix } from "../entities/variable";

const NEW_LINE = "\n".charCodeAt(0);
const LEFT_BRACKET = "[".charCodeAt(0);
const RIGHT_BRACKET = "]".charCodeAt(0);
const LEFT_BRACE = "{".charCodeAt(0);
const RIGHT_BRACE = "}".charCodeAt(0);
const LEFT_PAREN = "(".charCodeAt(0);
const RIGHT_PAREN = ")".charCodeAt(0);
const COMMA = ",".charCodeAt(0);
const SINGLE_QUOTE = "'".charCodeAt(0);
const DOUBLE_QUOTE = '"'.charCodeAt(0);
const BOF = 0;

const identPattern = /[$A-Za-z_][$\w]*/;
const identPartPattern = /[$\w]/;

class BackwardIterator {
  private model: TextDocument;
  private lineNumber: number;
  private offset: number;
  private lineText: string;

  constructor(model: TextDocument, offset: number, lineNumber: number) {
    this.model = model;
    this.lineNumber = lineNumber;
    this.offset = offset;
    this.lineText = model.lineAt(this.lineNumber).text;
  }

  /**
   * Returns whether there is another character
   */
  public hasNext(): boolean {
    return this.lineNumber >= 0;
  }

  /**
   * Gets the next character code
   */
  public next(): number {
    if (this.offset < 0) {
      if (this.lineNumber > 0) {
        this.lineNumber--;
        this.lineText = this.model.lineAt(this.lineNumber).text;
        this.offset = this.lineText.length - 1;
        return NEW_LINE;
      }
      this.lineNumber = -1;
      return BOF;
    }
    const ch: number = this.lineText.charCodeAt(this.offset);
    this.offset--;
    return ch;
  }

  /**
   * Gets current position in iterator
   */
  public getPosition(): Position {
    return new Position(this.lineNumber, this.offset);
  }

  /**
   * Gets document
   */
  public getDocument(): TextDocument {
    return this.model;
  }
}


export default class CFMLSignatureHelpProvider implements SignatureHelpProvider {
  /**
   * Provide help for the signature at the given position and document.
   * @param document The document in which the command was invoked.
   * @param position The position at which the command was invoked.
   * @param token A cancellation token.
   */
  public async provideSignatureHelp(document: TextDocument, position: Position, token: CancellationToken): Promise<SignatureHelp | null> {
    const cfmlSignatureSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml.signature");
    if (!cfmlSignatureSettings.get<boolean>("enable", true)) {
      return null;
    }

    const documentPositionStateContext: DocumentPositionStateContext = getDocumentPositionStateContext(document, position);

    const thisComponent: Component = documentPositionStateContext.component;
    // let isUserFunction = false;

    if (documentPositionStateContext.positionInComment) {
      return null;
    }

    const sanitizedDocumentText: string = documentPositionStateContext.sanitizedDocumentText;

    let iterator: BackwardIterator = new BackwardIterator(document, position.character - 1, position.line);

    let functionArgs: string[] = this.readArguments(iterator);
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
          const initMethod = initComponent.initmethod ? initComponent.initmethod.toLowerCase() : "init";
          if (initComponent.functions.has(initMethod)) {
            entry = initComponent.functions.get(initMethod);
          }
        }
      }
    }

    if (!entry) {
      const identWordRange: Range = this.readIdentRange(iterator);
      if (!identWordRange) {
        return null;
      }

      const ident: string = document.getText(identWordRange);

      const startIdentPositionPrefix: string = sanitizedDocumentText.slice(0, document.offsetAt(identWordRange.start));

      // Global function
      entry = cachedEntity.getGlobalFunction(ident.toLowerCase());

      // Check if component function
      if (!entry) {
        const varPrefixMatch: RegExpExecArray = variableExpressionPrefix.exec(startIdentPositionPrefix);
        // Check current component
        if (thisComponent) {
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
            if (currComponent.functions.has(ident.toLowerCase())) {
              const userFun: UserFunction = currComponent.functions.get(ident.toLowerCase());

              // Ensure this does not trigger on function definition
              if (userFun.location.range.contains(position) && !userFun.bodyRange.contains(position)) {
                break;
              }

              const validScopes: Scope[] = userFun.access === Access.Private ? [Scope.Variables] : [Scope.Variables, Scope.This];
              const funcPrefixPattern = getValidScopesPrefixPattern(validScopes, true);
              if (!checkScope || funcPrefixPattern.test(startIdentPositionPrefix)) {
                entry = userFun;
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
      }
    }

    // TODO: Check if external user function

    if (!entry) {
      return null;
    }

    let ret = new SignatureHelp();

    entry.signatures.forEach((signature: Signature) => {
      const sigDesc: string = signature.description  ? signature.description : entry.description;
      let signatureInfo = new SignatureInformation(getSyntaxString(entry), textToMarkdownString(sigDesc));
      signatureInfo.parameters = signature.parameters.map((param: Parameter) => {
        return new ParameterInformation(constructParameterLabel(param), textToMarkdownString(param.description));
      });
      ret.signatures.push(signatureInfo);
    });

    ret.activeSignature = 0;

    for (let i = 0; i < ret.signatures.length; i++) {
      const currSig = ret.signatures[i];
      if (paramCount < currSig.parameters.length) {
        ret.activeSignature = i;
        break;
      }
    }
    ret.activeParameter = Math.min(paramCount, ret.signatures[ret.activeSignature].parameters.length - 1);

    return Promise.resolve(ret);
  }

  /**
   * Gets an array of arguments including and preceding the currently selected argument
   * @param iterator A BackwardIterator to use to read arguments
   */
  private readArguments(iterator: BackwardIterator): string[] {
    let parenNesting = 0;
    let bracketNesting = 0;
    let braceNesting = 0;
    let allArgs = [];
    let currArg = [];
    while (iterator.hasNext()) {
      const ch: number = iterator.next();
      currArg.unshift(String.fromCharCode(ch));
      switch (ch) {
        case LEFT_PAREN:
          parenNesting--;
          if (parenNesting < 0) {
            currArg.shift();
            allArgs.unshift(currArg.join("").trim());
            return allArgs;
          }
          break;
        case RIGHT_PAREN: parenNesting++; break;
        case LEFT_BRACE: braceNesting--; break;
        case RIGHT_BRACE: braceNesting++; break;
        case LEFT_BRACKET: bracketNesting--; break;
        case RIGHT_BRACKET: bracketNesting++; break;
        case DOUBLE_QUOTE: case SINGLE_QUOTE:
          // FIXME: If position is within string, it breaks the provider
          currArg.unshift(String.fromCharCode(ch));
          while (iterator.hasNext()) {
            const nch: number = iterator.next();
            // find the closing quote or double quote
            currArg.unshift(String.fromCharCode(nch));
            // TODO: Ignore if escaped
            if (ch === nch) {
              break;
            }
          }
          break;
        case COMMA:
          if (!parenNesting && !bracketNesting && !braceNesting) {
            currArg.shift();
            allArgs.unshift(currArg.join("").trim());
            currArg = [];
          }
          break;
      }
    }
    return [];
  }

  /**
   * Tests whether the given character can be part of a valid CFML identifier
   * @param char Character to test
   */
  private isIdentPart(char: string): boolean {
    return identPartPattern.test(char);
  }

  /**
   * Returns the range of the identifier for the current signature or undefined if invalid
   * @param iterator A BackwardIterator to use
   */
  private readIdentRange(iterator: BackwardIterator): Range | undefined {
    let identRange: Range;
    let charStr = "";
    while (iterator.hasNext()) {
      const ch: number = iterator.next();
      charStr = String.fromCharCode(ch);
      if (!/[\s]/.test(charStr)) {
        break;
      }
    }

    if (this.isIdentPart(charStr)) {
      const document: TextDocument = iterator.getDocument();
      const currentWordRange: Range = document.getWordRangeAtPosition(iterator.getPosition());
      const currentWord: string = document.getText(currentWordRange);
      if (identPattern.test(currentWord)) {
        identRange = currentWordRange;
      }
    }

    return identRange;
  }
}
