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
  let returnType: string = DataType.Any;
  if ("returnTypeUri" in func) {
    const userFunction: UserFunction = func as UserFunction;
    if (userFunction.returnTypeUri) {
      returnType = path.basename(userFunction.returnTypeUri.fsPath, COMPONENT_EXT);
    }
  } else if (func.returntype) {
    returnType = func.returntype;
  }
  return `${func.name}(${funcDefaultSignature}): ${returnType}`;
}

/**
 * Gets the pattern for a function identifier suffix
 */
export function getFunctionSuffixPattern(): RegExp {
  return functionSuffixPattern;
}
