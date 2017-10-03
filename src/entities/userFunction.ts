import { DataType } from "./dataType";
import { Location, Uri, TextDocument, Position, Range } from "vscode";
import { Function } from "./function";
import { Parameter } from "./parameter";
import { Signature } from "./signature";
import { componentPathToUri, getComponentNameFromDotPath } from "./component";
import { Variable, parseVariables } from "./variable";
import { getCfScriptRanges } from "../utils/contextUtil";
import { Scope } from "./scope";
import { DocBlockKeyValue, parseDocBlock, getKeyPattern } from "./docblock";
import { ATTRIBUTES_PATTERN, Attributes, Attribute, parseAttributes } from "./attribute";
import { equalsIgnoreCase } from "../utils/textUtil";
import { MyMap } from "../utils/collections";

// TODO: For scriptFunctionPattern, add another capture group that separates arguments from function attributes
const scriptFunctionPattern: RegExp = /((\/\*\*((?:\*(?!\/)|[^*])*)\*\/\s+)?(?:\b(private|package|public|remote|static|final|abstract)\s+)?(?:\b(private|package|public|remote|static|final|abstract)\s+)?)(?:\b([A-Za-z0-9_\.$]+)\s+)?function\s+([_$a-zA-Z][$\w]*)\s*(\((?:=\s*\{|[^{])*)\{/gi;
// TODO: For scriptFunctionArgsPattern, prevent comma or close paren within string from delimiting arguments
const scriptFunctionArgsPattern: RegExp = /((?:^\(|,)\s*(?:(required)\s+)?(?:\b([\w.]+)\b\s+)?(\b[\w$]+\b)(?:\s*=\s*(\{[^\}]*\}|\[[^\]]*\]|\([^\)]*\)|(?:[^,\)](?!\b\w+\s*=))+))?)([^,\)]*)?/gi;
const tagFunctionPattern: RegExp = /((<cffunction\s+)([^>]*)>)([\s\S]*?)<\/cffunction>/gi;
const tagFunctionArgPattern: RegExp = /(<cfargument\s+)([^>]*)>/gi;

const booleanAttributes: Set<string> = new Set([
  "static",
  "abstract",
  "final"
]);
const argumentAttributesToInterfaceMapping = {
  type: "dataType",
  default: "default",
  hint: "description",
  required: "required"
};
const accessArr: string[] = ["public", "private", "package", "remote"];

export const inlineFunctionPattern = /([a-zA-Z_$][$\w.\[\]'"]*)\s*=\s*function\s*\(|function\s+([a-zA-Z_$][$\w]*)\s*\(/gi;

export enum Access {
  Public = "public",
  Private = "private",
  Package = "package",
  Remote = "remote"
}
export namespace Access {
  /**
   * Resolves a string value of access type to an enumeration member
   * @param access The access type string to resolve
   */
  export function valueOf(access: string) {
    switch (access.toLowerCase()) {
      case "public":
        return Access.Public;
      case "private":
        return Access.Private;
      case "package":
        return Access.Package;
      case "remote":
        return Access.Remote;
      default:
        return Access.Public;
    }
  }
}

export interface Argument extends Parameter {
  // description is hint
  nameRange?: Range;
  dataTypeRange?: Range;
  dataTypeComponentUri?: Uri; // Only when dataType is Component
}
interface ArgumentAttributes {
  name: string;
  type?: string;
  default?: string;
  displayname?: string;
  hint?: string;
  required?: string;
  restargsource?: string;
  restargname?: string;
}
export const argumentAttributeNames: Set<string> = new Set([
  "name",
  "type",
  "default",
  "displayname",
  "hint",
  "required",
  "restargsource",
  "restargname"
]);

export interface UserFunctionSignature extends Signature {
  parameters: Argument[];
}

export interface UserFunction extends Function {
  access: Access;
  static: boolean;
  abstract: boolean;
  final: boolean;
  returnTypeUri?: Uri; // Only when returntype is Component
  returnTypeRange?: Range;
  nameRange: Range;
  bodyRange: Range;
  signatures: UserFunctionSignature[];
  location: Location;
}
interface UserFunctionAttributes {
  name: string;
  access?: string;
  description?: string;
  displayname?: string;
  hint?: string;
  output?: string;
  returnformat?: string;
  returntype?: string;
  roles?: string;
  securejson?: string;
  verifyclient?: string;
  restpath?: string;
  httpmethod?: string;
  produces?: string;
  consumes?: string;
  modifier?: string;
}
const userFunctionAttributeNames: Set<string> = new Set([
  "name",
  "access",
  "description",
  "displayname",
  "hint",
  "output",
  "returnformat",
  "returntype",
  "roles",
  "securejson",
  "verifyclient",
  "restpath",
  "httpmethod",
  "produces",
  "consumes"
]);

// Collection of user functions for a particular component. Key is function name lowercased.
export class ComponentFunctions extends MyMap<string, UserFunction> { }

/*
export interface UserFunctionsByUri {
  [uri: string]: ComponentFunctions; // key is Uri.toString()
}
*/

export interface UserFunctionByUri {
  [uri: string]: UserFunction; // key is Uri.toString()
}

export interface UserFunctionsByName {
  [name: string]: UserFunctionByUri; // key is UserFunction.name lowercased
}

/**
 * Parses the CFScript function definitions and returns an array of UserFunction objects
 * @param document The TextDocument in which to parse the CFScript functions
 */
export function parseScriptFunctions(document: TextDocument): UserFunction[] {
  let userFunctions: UserFunction[] = [];
  const componentBody: string = document.getText();
  let scriptFunctionMatch: RegExpExecArray = null;
  while (scriptFunctionMatch = scriptFunctionPattern.exec(componentBody)) {
    const fullMatch = scriptFunctionMatch[0];
    const returnTypePrefix = scriptFunctionMatch[1];
    const fullDocBlock = scriptFunctionMatch[2];
    const scriptDocBlockContent = scriptFunctionMatch[3];
    const modifier1 = scriptFunctionMatch[4];
    const modifier2 = scriptFunctionMatch[5];
    const returnType = scriptFunctionMatch[6];
    const functionName = scriptFunctionMatch[7];
    const functionArgs = scriptFunctionMatch[8]; // Also attributes

    const functionArgsRange = new Range(
      document.positionAt(scriptFunctionMatch.index + fullMatch.length - 1 - functionArgs.length),
      document.positionAt(scriptFunctionMatch.index + fullMatch.length - 1)
    );

    const functionEndPosition: Position = getScriptFunctionEndPosition(document, scriptFunctionMatch.index + fullMatch.length);
    const functionRange: Range = new Range(
      document.positionAt(scriptFunctionMatch.index),
      functionEndPosition
    );
    const removedArgs = fullMatch.slice(0, -functionArgs.length - 1);
    const functionNameRange: Range = new Range(
      document.positionAt(scriptFunctionMatch.index + removedArgs.lastIndexOf(functionName)),
      document.positionAt(scriptFunctionMatch.index + removedArgs.lastIndexOf(functionName) + functionName.length)
    );
    const functionBodyRange: Range = new Range(
      document.positionAt(scriptFunctionMatch.index + fullMatch.length),
      functionEndPosition.translate({ characterDelta: -1 })
    );

    let userFunction: UserFunction = {
      access: Access.Public,
      static: false,
      abstract: false,
      final: false,
      name: functionName,
      description: "",
      returntype: DataType.Any,
      signatures: [],
      nameRange: functionNameRange,
      bodyRange: functionBodyRange,
      location: new Location(document.uri, functionRange)
    };

    if (returnType) {
      const checkDataType = DataType.getDataTypeAndUri(returnType, document.uri);
      if (checkDataType) {
        userFunction.returntype = checkDataType[0];
        if (checkDataType[1]) {
          userFunction.returnTypeUri = checkDataType[1];
        }
        const returnTypeName: string = getComponentNameFromDotPath(returnType);
        userFunction.returnTypeRange = new Range(
          document.positionAt(scriptFunctionMatch.index + returnTypePrefix.length + returnType.length - returnTypeName.length),
          document.positionAt(scriptFunctionMatch.index + returnTypePrefix.length + returnType.length)
        );
      }
    }

    if (modifier1) {
      const modifier1Type = parseModifier(modifier1);
      if (modifier1Type === "access") {
        userFunction.access = Access.valueOf(modifier1);
      } else {
        userFunction[modifier1Type] = true;
      }
    }

    if (modifier2) {
      const modifier2Type = parseModifier(modifier2);
      if (modifier2Type === "access") {
        userFunction.access = Access.valueOf(modifier2);
      } else {
        userFunction[modifier2Type] = true;
      }
    }

    // TODO: Parse function attributes
    let scriptDocBlockParsed: DocBlockKeyValue[] = [];
    if (fullDocBlock) {
      scriptDocBlockParsed = parseDocBlock(document,
        new Range(
          document.positionAt(scriptFunctionMatch.index + 3),
          document.positionAt(scriptFunctionMatch.index + 3 + scriptDocBlockContent.length)
        )
      );
      scriptDocBlockParsed.forEach((docElem: DocBlockKeyValue) => {
        if (docElem.key === "access") {
          userFunction.access = Access.valueOf(docElem.value);
        } else if (docElem.key === "returntype") {
          const checkDataType = DataType.getDataTypeAndUri(docElem.value, document.uri);
          if (checkDataType) {
            userFunction.returntype = checkDataType[0];

            const returnTypeKeyMatch: RegExpExecArray = getKeyPattern("returnType").exec(fullDocBlock);
            if (returnTypeKeyMatch) {
              const returnTypePath: string = returnTypeKeyMatch[1];
              const returnTypeName: string = getComponentNameFromDotPath(returnTypePath);
              const prefixLen: number = returnTypeKeyMatch[0].lastIndexOf(returnTypeName);
              const returnTypeOffset: number = scriptFunctionMatch.index + returnTypeKeyMatch.index + prefixLen;
              userFunction.returnTypeRange = new Range(
                document.positionAt(returnTypeOffset),
                document.positionAt(returnTypeOffset + returnTypeName.length)
              );
            }
            if (checkDataType[1]) {
              userFunction.returnTypeUri = checkDataType[1];
            }
          }
        } else if (booleanAttributes.has(docElem.key)) {
          userFunction[docElem.key] = DataType.isTruthy(docElem.value);
        } else if (docElem.key === "hint") {
          userFunction.description = docElem.value;
        } else if (docElem.key === "description" && userFunction.description === "") {
          userFunction.description = docElem.value;
        }
      });
    }
    const signature: UserFunctionSignature = {
      parameters: parseScriptFunctionArgs(document, functionArgsRange, scriptDocBlockParsed)
    };
    userFunction.signatures = [signature];

    userFunctions.push(userFunction);
  }

  return userFunctions;
}

/**
 * Determines the position at which the CFScript function definition ends
 * @param document The TextDocument containing the CFScript function
 * @param initialOffset A numeric offset representing the position at the beginning of the function body
 */
function getScriptFunctionEndPosition(document: TextDocument, initialOffset: number): Position {
  const LEFT_BRACE = "{";
  const RIGHT_BRACE = "}";
  const documentText: string = document.getText();
  let unclosedBraces = 0;
  for (let offset = initialOffset; offset < documentText.length; offset++) {
    const characterAtPosition: string = document.getText(new Range(document.positionAt(offset), document.positionAt(offset + 1)));
    if (characterAtPosition === LEFT_BRACE) {
      unclosedBraces++;
    } else if (characterAtPosition === RIGHT_BRACE) {
      if (unclosedBraces !== 0) {
        unclosedBraces--;
      } else {
        return document.positionAt(offset + 1);
      }
    }
  }

  return document.positionAt(initialOffset);
}

/**
 * Parses the given arguments into an array of Argument objects that is returned
 * @param document The document containing these function arguments
 * @param argsAttrsRange A range within the given document that contains the CFScript arguments and function attributes
 * @param docBlock The parsed documentation block for the function to which these arguments and attributes belong
 */
function parseScriptFunctionArgs(document: TextDocument, argsAttrsRange: Range, docBlock: DocBlockKeyValue[]): Argument[] {
  let args: Argument[] = [];
  const documentUri: Uri = document.uri;
  const argsAttrs: string = document.getText(argsAttrsRange);
  let scriptFunctionArgMatch: RegExpExecArray = null;
  while (scriptFunctionArgMatch = scriptFunctionArgsPattern.exec(argsAttrs)) {
    const fullArg = scriptFunctionArgMatch[0];
    const attributePrefix = scriptFunctionArgMatch[1];
    const argRequired = scriptFunctionArgMatch[2];
    const argType = scriptFunctionArgMatch[3];
    const argName = scriptFunctionArgMatch[4];
    const argDefault = scriptFunctionArgMatch[5];
    const argAttributes = scriptFunctionArgMatch[6];
    const argOffset = document.offsetAt(argsAttrsRange.start) + scriptFunctionArgMatch.index;

    if (!argName) {
      continue;
    }

    let argDefaultAndAttributesLen = 0;
    if (argDefault) {
      argDefaultAndAttributesLen += argDefault.length;
    }
    let parsedArgAttributes: Attributes;
    if (argAttributes) {
      argDefaultAndAttributesLen += argAttributes.length;

      const functionArgPrefixOffset = argOffset + attributePrefix.length;
      const functionArgRange = new Range(
        document.positionAt(functionArgPrefixOffset),
        document.positionAt(functionArgPrefixOffset + argAttributes.length)
      );
      parsedArgAttributes = parseAttributes(document, functionArgRange, argumentAttributeNames);
    }
    const removedDefaultAndAttributes = fullArg.slice(0, -argDefaultAndAttributesLen);
    const argNameOffset = argOffset + removedDefaultAndAttributes.lastIndexOf(argName);

    let convertedArgType: DataType = DataType.Any;
    let typeUri: Uri;
    let argTypeRange: Range;
    if (argType) {
      const checkDataType = DataType.getDataTypeAndUri(argType, documentUri);
      if (checkDataType) {
        convertedArgType = checkDataType[0];
        if (checkDataType[1]) {
          typeUri = checkDataType[1];
        }

        const argTypeName: string = getComponentNameFromDotPath(argType);
        const argTypeOffset: number = fullArg.indexOf(argType);
        argTypeRange = new Range(
          document.positionAt(argOffset + argTypeOffset + argType.length - argTypeName.length),
          document.positionAt(argOffset + argTypeOffset + argType.length)
        );
      }
    }

    let argument: Argument = {
      name: argName,
      required: argRequired ? true : false,
      dataType: convertedArgType,
      description: "",
      nameRange: new Range(
        document.positionAt(argNameOffset),
        document.positionAt(argNameOffset + argName.length)
      )
    };

    if (argDefault) {
      argument.default = argDefault;
    }

    if (typeUri) {
      argument.dataTypeComponentUri = typeUri;
    }

    if (argTypeRange) {
      argument.dataTypeRange = argTypeRange;
    }

    if (parsedArgAttributes) {
      parsedArgAttributes.forEach((attr: Attribute) => {
        const argAttrName: string = attr.name;
        const argAttrVal: string = attr.value;
        if (argAttrName === "required") {
          argument.required = DataType.isTruthy(argAttrVal);
        } else if (argAttrName === "hint") {
          argument.description = argAttrVal;
        } else if (argAttrName === "default") {
          argument.default = argAttrVal;
        } else if (argAttrName === "type") {
          let checkDataType = DataType.getDataTypeAndUri(argAttrVal, documentUri);
          if (checkDataType) {
            argument.dataType = checkDataType[0];
            if (checkDataType[1]) {
              argument.dataTypeComponentUri = checkDataType[1];
            }
            const argTypeName: string = getComponentNameFromDotPath(argAttrVal);
            argument.dataTypeRange = new Range(
              attr.valueRange.start.translate(0, argAttrVal.length - argTypeName.length),
              attr.valueRange.end
            );
          }
        }
      });
    }

    docBlock.filter((docElem: DocBlockKeyValue) => {
      return equalsIgnoreCase(docElem.key, argument.name);
    }).forEach((docElem: DocBlockKeyValue) => {
      if (docElem.subkey === "required") {
        argument.required = DataType.isTruthy(docElem.value);
      } else if (!docElem.subkey || docElem.subkey === "hint") {
        argument.description = docElem.value;
      } else if (docElem.subkey === "default") {
        argument.default = docElem.value;
      } else if (docElem.subkey === "type") {
        let checkDataType = DataType.getDataTypeAndUri(docElem.value, documentUri);
        if (checkDataType) {
          argument.dataType = checkDataType[0];
          if (checkDataType[1]) {
            argument.dataTypeComponentUri = checkDataType[1];
          }
          const argTypeName: string = getComponentNameFromDotPath(docElem.value);
          argument.dataTypeRange = new Range(
            docElem.valueRange.start.translate(0, docElem.value.length - argTypeName.length),
            docElem.valueRange.end
          );
        }
      }
    });

    args.push(argument);
  }

  return args;
}

/**
 * Parses the tag function definitions and returns an array of UserFunction objects
 * @param document The TextDocument in which to parse the tag functions
 */
export function parseTagFunctions(document: TextDocument): UserFunction[] {
  let userFunctions: UserFunction[] = [];
  const componentText: string = document.getText();
  let tagFunctionMatch: RegExpExecArray = null;

  while (tagFunctionMatch = tagFunctionPattern.exec(componentText)) {
    const head = tagFunctionMatch[1];
    const attributePrefix = tagFunctionMatch[2];
    const attributes = tagFunctionMatch[3];
    const body = tagFunctionMatch[4];

    const functionEndPosition: Position = document.positionAt(tagFunctionMatch.index + tagFunctionMatch[0].length);
    const functionRange: Range = new Range(
      document.positionAt(tagFunctionMatch.index),
      functionEndPosition
    );

    const functionBodyRange: Range = new Range(
      document.positionAt(tagFunctionMatch.index + head.length),
      document.positionAt(tagFunctionMatch.index + head.length + body.length)
    );

    let userFunction: UserFunction = {
      access: Access.Public,
      static: false,
      abstract: false,
      final: false,
      name: "",
      description: "",
      returntype: DataType.Any,
      signatures: [],
      nameRange: new Range(
        document.positionAt(tagFunctionMatch.index),
        document.positionAt(tagFunctionMatch.index + head.length)
      ),
      bodyRange: functionBodyRange,
      location: new Location(document.uri, functionRange)
    };

    const functionAttributesPrefixOffset = tagFunctionMatch.index + attributePrefix.length;
    const functionAttributesRange = new Range(
      document.positionAt(functionAttributesPrefixOffset),
      document.positionAt(functionAttributesPrefixOffset + attributes.length)
    );
    const parsedAttributes: Attributes = parseAttributes(document, functionAttributesRange, userFunctionAttributeNames);

    let functionAttributes: UserFunctionAttributes = processFunctionAttributes(parsedAttributes);

    if (!functionAttributes.name || functionAttributes.name.length === 0) {
      continue;
    }

    userFunction.name = functionAttributes.name;

    userFunction.nameRange = parsedAttributes.get("name").valueRange;

    Object.getOwnPropertyNames(functionAttributes).forEach((attrName: string) => {
      if (functionAttributes[attrName]) {
        const attrVal = functionAttributes[attrName];
        if (attrName === "access") {
          userFunction.access = Access.valueOf(attrVal);
        } else if (attrName === "returntype") {
          const checkDataType = DataType.getDataTypeAndUri(attrVal, document.uri);
          if (checkDataType) {
            userFunction.returntype = checkDataType[0];
            if (checkDataType[1]) {
              userFunction.returnTypeUri = checkDataType[1];
            }
            const returnTypeRange: Range = parsedAttributes.get("returntype").valueRange;
            const returnTypeName: string = getComponentNameFromDotPath(attrVal);
            userFunction.returnTypeRange = new Range(
              returnTypeRange.start.translate(0, attrVal.length - returnTypeName.length),
              returnTypeRange.end
            );
          }
        } else if (booleanAttributes.has(attrName)) {
          userFunction[attrVal] = DataType.isTruthy(attrVal);
        } else if (attrName === "hint") {
          userFunction.description = attrVal;
        } else if (attrName === "description" && userFunction.description === "") {
          userFunction.description = attrVal;
        }
      }
    });

    const signature: UserFunctionSignature = {
      parameters: parseTagFunctionArguments(document, functionBodyRange)
    };
    userFunction.signatures = [signature];

    userFunctions.push(userFunction);
  }

  return userFunctions;
}

/**
 * Parses the given function body to extract the arguments into an array of Argument objects that is returned
 * @param document The document containing these function arguments
 * @param functionBodyRange A range in the given document for the function body
 */
function parseTagFunctionArguments(document: TextDocument, functionBodyRange: Range): Argument[] {
  const functionBody: string = document.getText(functionBodyRange);
  let args: Argument[] = [];
  const documentUri: Uri = document.uri;
  let tagFunctionArgMatch: RegExpExecArray = null;
  while (tagFunctionArgMatch = tagFunctionArgPattern.exec(functionBody)) {
    const attributePrefix = tagFunctionArgMatch[1];
    const argAttributes = tagFunctionArgMatch[2];
    const argOffset = document.offsetAt(functionBodyRange.start) + tagFunctionArgMatch.index;

    const argRange = new Range(
      document.positionAt(argOffset + attributePrefix.length),
      document.positionAt(argOffset + attributePrefix.length + argAttributes.length)
    );

    const parsedAttributes: Attributes = parseAttributes(document, argRange, argumentAttributeNames);

    const argumentAttributes: ArgumentAttributes = processArgumentAttributes(parsedAttributes);

    if (!argumentAttributes) {
      continue;
    }

    const argNameRange: Range = parsedAttributes.get("name").valueRange;

    let argRequired: boolean;
    if (argumentAttributes.required) {
      argRequired = DataType.isTruthy(argumentAttributes.required);
    } else {
      argRequired = false;
    }

    const argType = argumentAttributes.type;
    let convertedArgType: DataType = DataType.Any;
    let typeUri: Uri;
    let argTypeRange: Range;
    if (argType) {
      const checkDataType = DataType.getDataTypeAndUri(argType, documentUri);
      if (checkDataType) {
        convertedArgType = checkDataType[0];
        if (checkDataType[1]) {
          typeUri = checkDataType[1];
        }
        argTypeRange = parsedAttributes.get("type").valueRange;
        const argTypeName: string = getComponentNameFromDotPath(argType);
        argTypeRange = new Range(
          argTypeRange.start.translate(0, argType.length - argTypeName.length),
          argTypeRange.end
        );
      }
    }

    let argument: Argument = {
      name: argumentAttributes.name,
      required: argRequired,
      dataType: convertedArgType,
      description: argumentAttributes.hint ? argumentAttributes.hint : "",
      nameRange: argNameRange
    };

    if (argumentAttributes.default) {
      argument.default = argumentAttributes.default;
    }

    if (typeUri) {
      argument.dataTypeComponentUri = typeUri;
    }

    if (argTypeRange) {
      argument.dataTypeRange = argTypeRange;
    }

    args.push(argument);
  }

  return args;
}

/**
 * Parses a set of attribute/value pairs for a function and returns an object conforming to the UserFunctionAttributes interface
 * @param attributeStr A string with the set of attribute/value pairs for a function
 */
function processFunctionAttributes(attributes: Attributes): UserFunctionAttributes {
  let attributeObj = {};

  attributes.forEach((attr: Attribute, attrKey: string) => {
    attributeObj[attrKey] = attr.value;
  });

  if (!attributeObj["name"]) {
    return null;
  }

  return <UserFunctionAttributes>attributeObj;
}

/**
 * Parses a set of attribute/value pairs for a function argument and returns an object conforming to the ArgumentAttributes interface
 * @param attributeStr A string with the set of attribute/value pairs for a function argument
 */
function processArgumentAttributes(attributes: Attributes): ArgumentAttributes {
  let attributeObj = {};
  attributes.forEach((attr: Attribute, attrKey: string) => {
    attributeObj[attrKey] = attr.value;
  });

  if (!attributeObj["name"]) {
    return null;
  }

  return <ArgumentAttributes>attributeObj;
}

/**
 * Parses the given user function to extract the local variables into an array of Variable objects that is returned
 * @param func The UserFunction within which to parse local variables
 * @param document The document containing the given function
 * @param isScript Whether this function is defined entirely in CFScript
 */
export function getLocalVariables(func: UserFunction, document: TextDocument, isScript: boolean): Variable[] {
  let allVariables: Variable[] = [];

  allVariables = parseVariables(document, isScript, func.bodyRange);

  return allVariables.filter((variable: Variable) => {
    return (variable.scope === Scope.Local);
  });
}

/**
 * Identifies if the modifier is of an Access type or other
 * @param modifier A string representing the function modifier
 */
function parseModifier(modifier: string): string {
  if (accessArr.includes(modifier)) {
    return "access";
  }

  return modifier;
}
