import { DataType } from "./dataType";
import { Signature, constructSignatureLabelParamsPart, constructSignatureLabelParamsPrefix } from "./signature";
import { UserFunction } from "./userFunction";
import { COMPONENT_EXT } from "./component";
import * as path from "path";
import { DocumentStateContext } from "../utils/documentUtil";
import { Range, TextDocument, Position } from "vscode";
import { getNextCharacterPosition } from "../utils/contextUtil";

const functionSuffixPattern: RegExp = /^\s*\(([^)]*)/;

export interface Function {
  name: string;
  description: string;
  returntype: DataType;
  signatures: Signature[];
}

export enum MemberType {
  Array = "array",
  Date = "date",
  Image = "image",
  List = "list",
  Query = "query",
  String = "string",
  Struct = "struct",
  Spreadsheet = "spreadsheet",
  XML = "xml"
}

/**
 * Constructs a string showing a function invocation sample
 * @param func The function for which the syntax string will be constructed
 * @param signatureIndex The index of the signature to use
 */
export function constructSyntaxString(func: Function, signatureIndex: number = 0): string {
  const funcSignatureParamsLabel = func.signatures.length !== 0 ? constructSignatureLabelParamsPart(func.signatures[signatureIndex].parameters) : "";
  const returnType: string = getReturnTypeString(func);

  return `${constructSignatureLabelParamsPrefix(func)}(${funcSignatureParamsLabel}): ${returnType}`;
}

/**
 * Gets a regular expression that matches after the function identifier and captures the parameter contents
 */
export function getFunctionSuffixPattern(): RegExp {
  return functionSuffixPattern;
}

/**
 * Gets a display string for the given function's return type
 * @param func The function for which to get the display return type
 */
export function getReturnTypeString(func: Function): string {
  let returnType: string;
  if ("returnTypeUri" in func) {
    const userFunction: UserFunction = func as UserFunction;
    if (userFunction.returnTypeUri) {
      returnType = path.basename(userFunction.returnTypeUri.fsPath, COMPONENT_EXT);
    }
  }

  if (!returnType) {
    returnType = func.returntype ? func.returntype : DataType.Any;
  }

  return returnType;
}

/**
 * Gets the ranges for each argument given the range for all of the arguments
 * @param documentStateContext The context information for the TextDocument containing function arguments
 * @param argsRange The full range for a set of arguments
 * @param separatorChar The character that separates function arguments
 */
export function getScriptFunctionArgRanges(documentStateContext: DocumentStateContext, argsRange: Range, separatorChar: string = ","): Range[] {
  let argRanges: Range[] = [];
  const document: TextDocument = documentStateContext.document;
  const argsEndOffset: number = document.offsetAt(argsRange.end);

  let argStartPosition = argsRange.start;
  while (argStartPosition.isBeforeOrEqual(argsRange.end)) {
    const argSeparatorPos: Position = getNextCharacterPosition(documentStateContext, document.offsetAt(argStartPosition), argsEndOffset, separatorChar, false);
    const argRange: Range = new Range(argStartPosition, argSeparatorPos);
    argRanges.push(argRange);
    argStartPosition = argSeparatorPos.translate(0, 1);
  }

  return argRanges;
}