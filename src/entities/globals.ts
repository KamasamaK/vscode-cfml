import { SnippetString } from "vscode";
import { MyMap, NameWithOptionalValue } from "../utils/collections";
import { ATTRIBUTES_PATTERN, IncludeAttributesSetType } from "./attribute";
import { DataType } from "./dataType";
import { Function } from "./function";
import { Parameter } from "./parameter";
import { Signature } from "./signature";
import { getCfStartTagPattern } from "./tag";
import { equalsIgnoreCase } from "../utils/textUtil";

export interface GlobalEntity {
  name: string;
  syntax: string;
  description: string;
  signatures: Signature[];
}
export interface GlobalFunction extends GlobalEntity, Function { }
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
  scriptSyntax?: string;
  hasBody: boolean;
}
export interface GlobalTags {
  [name: string]: GlobalTag;
}

/**
 * TODO: Implement
 * Returns the data type of the member function variant of the given global function
 * @param functionName The global function name
 */
export function getMemberFunctionType(functionName: string): DataType {
  return DataType.Any;
}

/**
 * Transforms the global tag syntax into script syntax
 * @param globalTag The global tag for which the syntax will be transformed
 */
export function globalTagSyntaxToScript(globalTag: GlobalTag): string {
  let attributes: string[] = [];
  const cfStartTagPattern = getCfStartTagPattern();
  const attributeStr: string = cfStartTagPattern.exec(globalTag.syntax)[3];
  if (attributeStr) {
    let attributeMatch: RegExpExecArray = null;
    while (attributeMatch = ATTRIBUTES_PATTERN.exec(attributeStr)) {
      attributes.push(attributeMatch[0]);
    }
  }

  return `${globalTag.name}(${attributes.join(", ")})`;
}

/**
 * Constructs a snippet for the given global tag which includes attributes
 * @param globalTag The global tag for which to construct the snippet
 * @param includeAttributesSetType Indicates which set of attributes to include in the snippet
 * @param includeAttributesCustom Provides an optional set of attributes which overrides the set type
 * @param includeDefaultValue Whether to fill the attribute value with the default if it exists
 * @param isScript Whether this snippet for a script tag
 */
export function constructTagSnippet(
  globalTag: GlobalTag,
  includeAttributesSetType: IncludeAttributesSetType = IncludeAttributesSetType.Required,
  includeAttributesCustom?: NameWithOptionalValue<string>[],
  includeDefaultValue: boolean = false,
  isScript: boolean = false
): SnippetString | undefined {
  let tagSnippet: SnippetString;

  if (includeAttributesSetType !== IncludeAttributesSetType.None || (includeAttributesCustom !== undefined && includeAttributesCustom.length > 0)) {
    let snippetParamParts: string[] = [];
    if (globalTag.signatures.length > 0) {
      const sig: Signature = globalTag.signatures[0];

      let parameters: Parameter[] = sig.parameters;
      if (includeAttributesCustom !== undefined) {
        parameters = includeAttributesCustom.map((attributeEntry: NameWithOptionalValue<string>) => {
          return sig.parameters.find((param: Parameter) => {
            return equalsIgnoreCase(param.name, attributeEntry.name);
          });
        }).filter((param: Parameter) => {
          return param !== undefined;
        });
      } else if (includeAttributesSetType === IncludeAttributesSetType.Required) {
        parameters = parameters.filter((param: Parameter) => {
          return param.required;
        });
      }
      snippetParamParts = parameters.map((param: Parameter, index: number) => {
        const tabstopNumber: number = index + 1;

        /*
        if (param.enumeratedValues && param.enumeratedValues.length > 0 && !param.enumeratedValues.includes("|") && !param.enumeratedValues.includes(",")) {
          snippetString += `\${${tabstopNumber}|${param.enumeratedValues.join(",")}|}`;
        } else if (param.dataType === DataType.Boolean) {
          snippetString += `\${${tabstopNumber}|true,false|}`;
        } else {
          snippetString += "$" + tabstopNumber;
        }
        */

        let placeholder: string = "";

        let customValue: string;
        if (includeAttributesCustom !== undefined) {
          const customEntry: NameWithOptionalValue<string> = includeAttributesCustom.find((attributeEntry: NameWithOptionalValue<string>) => {
            return equalsIgnoreCase(attributeEntry.name, param.name);
          });

          if (customEntry !== undefined) {
            customValue = customEntry.value;
          }
        }

        if (customValue !== undefined) {
          placeholder = customValue;
        } else if (includeDefaultValue && param.default) {
          placeholder = param.default;
        }

        return `${param.name}="\${${tabstopNumber}:${placeholder}}"`;
      });
    }

    let snippetString: string = "";

    if (isScript) {
      snippetString = `${globalTag.name}(${snippetParamParts.join(", ")})$0`;
    } else {
      if (snippetParamParts.length > 0) {
        snippetString = `${globalTag.name} ${snippetParamParts.join(" ")}$0`;
      } else {
        snippetString = globalTag.name;
      }
    }

    tagSnippet = new SnippetString(snippetString);
  }

  return tagSnippet;
}
