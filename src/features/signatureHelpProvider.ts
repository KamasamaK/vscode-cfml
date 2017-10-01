import {
  SignatureHelpProvider, SignatureHelp, SignatureInformation, ParameterInformation, CancellationToken,
  TextDocument, Position, Range, WorkspaceConfiguration, workspace
} from "vscode";
import * as fs from "fs";
import * as cachedEntity from "./cachedEntities";
import { Function } from "../entities/function";
import { Signature, constructSignatureLabel } from "../entities/signature";
import { Component } from "../entities/component";
import { getComponent } from "./cachedEntities";
import { Parameter } from "../entities/parameter";

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

const identRegex = /[$A-Za-z_][$\w]*/;
const identPartRegex = /[$\w]/;

class BackwardIterator {
  private model: TextDocument;
  private offset: number;
  private lineNumber: number;
  private lineText: string;

  constructor(model: TextDocument, offset: number, lineNumber: number) {
    this.lineNumber = lineNumber;
    this.offset = offset;
    this.lineText = model.lineAt(this.lineNumber).text;
    this.model = model;
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
  public async provideSignatureHelp(document: TextDocument, position: Position, token: CancellationToken): Promise<SignatureHelp> {
    const cfmlSignatureSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml.signature");
    if (!cfmlSignatureSettings.get<boolean>("enable", true)) {
      return null;
    }

    let iterator = new BackwardIterator(document, position.character - 1, position.line);

    let functionArgs: string[] = this.readArguments(iterator);
    const paramCount: number = functionArgs.length - 1;
    if (paramCount < 0) {
      return null;
    }

    const ident: string = this.readIdent(iterator);
    if (!ident) {
      return null;
    }

    // Initialize as global function
    let entry: Function = cachedEntity.getGlobalFunction(ident.toLowerCase());

    // Check if component function
    if (!entry) {
      const comp: Component = getComponent(document.uri);
      if (comp && comp.functions.has(ident.toLowerCase())) {
        entry = comp.functions.get(ident.toLowerCase());
      }
    }

    if (!entry) {
      return null;
    }

    let ret = new SignatureHelp();

    entry.signatures.forEach((signature: Signature) => {
      const sigLabel: string = constructSignatureLabel(signature);
      const sigDesc: string = signature.description && signature.description.length > 0 ? signature.description : entry.description;
      let signatureInfo = new SignatureInformation(`${entry.name}( ${sigLabel} )`, sigDesc);
      signatureInfo.parameters = signature.parameters.map((param: Parameter) => {
        return new ParameterInformation(param.dataType + " " + param.name, param.description);
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
    return identPartRegex.test(char);
  }

  /**
   * Gets the character immediately preceding the given position within the given document
   * @param document The document to check
   * @param position The position to check
   */
  private getPrefixChar(document: TextDocument, position: Position): string {
    let char = "";
    if (position.character !== 0) {
      const newPos: Position = position.translate(0, -1);
      char = document.getText(new Range(newPos, position));
    }
    return char;
  }

  /**
   * Returns the identifier for the current signature or empty string if invalid
   * @param iterator A BackwardIterator to use
   */
  private readIdent(iterator: BackwardIterator): string {
    let ident = "";
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
      if (identRegex.test(currentWord) && this.getPrefixChar(document, currentWordRange.start) !== ".") {
        ident = currentWord;
      }
    }

    return ident;
  }
}
