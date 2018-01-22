import { DataType } from "./dataType";
import { Function } from "./function";
import { Signature } from "./signature";
import { MyMap } from "../utils/collections";
import { getCfOpenTagPattern } from "./tag";
import { ATTRIBUTES_PATTERN } from "./attribute";

export interface GlobalEntity {
  name: string;
  syntax: string;
  description: string;
  signatures: Signature[];
}
export interface GlobalFunction extends GlobalEntity, Function {
  name: string;
  syntax: string;
  description: string;
  returntype: DataType;
  signatures: Signature[];
}
export interface GlobalFunctions {
  [name: string]: GlobalFunction;
}
export interface MemberFunction extends Function {
  name: string;
  syntax: string;
  description: string;
  returntype: DataType;
  signatures: Signature[];
}
export interface MemberFunctionsByType extends MyMap<DataType, Set<MemberFunction>> { }
export interface GlobalTag extends GlobalEntity {
  name: string;
  syntax: string;
  scriptSyntax?: string;
  description: string;
  signatures: Signature[];
  hasBody: boolean;
}
export interface GlobalTags {
  [name: string]: GlobalTag;
}

/**
 * (Unimplemented)
 * Returns the data type of the member function variant of the given global function
 * @param functionName The global function name
 */
export function getMemberFunctionType(functionName: string): DataType {
  return DataType.Any;
}

/**
 * Transforms the global tag syntax into script syntax
 */
export function globalTagSyntaxToScript(globalTag: GlobalTag): string {
  let scriptSyntax: string = globalTag.name + "(";
  let attributes: string[] = [];
  const cfOpenTagPattern = getCfOpenTagPattern();
  const attributeStr: string = cfOpenTagPattern.exec(globalTag.syntax)[3];
  if (attributeStr) {
    let attributeMatch: RegExpExecArray = null;
    while (attributeMatch = ATTRIBUTES_PATTERN.exec(attributeStr)) {
      attributes.push(attributeMatch[0]);
    }
  }

  scriptSyntax += attributes.join(", ") + ")";

  return scriptSyntax;
}
