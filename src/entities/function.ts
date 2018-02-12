import { DataType } from "./dataType";
import { Signature, constructSignatureLabel } from "./signature";
import { UserFunction } from "./userFunction";
import { COMPONENT_EXT } from "./component";
import * as path from "path";

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
 */
export function getSyntaxString(func: Function): string {
  const funcDefaultSignature = func.signatures.length !== 0 ? constructSignatureLabel(func.signatures[0]) : "";
  const returnType: string = getReturnTypeString(func);

  return `${func.name}(${funcDefaultSignature}): ${returnType}`;
}

/**
 * Gets the pattern for a function identifier suffix
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