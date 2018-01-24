import { DataType } from "./dataType";
import { Location, Uri, TextDocument, Position, Range } from "vscode";
import { Function } from "./function";
import { Parameter } from "./parameter";
import { Signature } from "./signature";
import { getComponentNameFromDotPath, Component } from "./component";
import { Variable, parseVariableAssignments } from "./variable";
import { Scope } from "./scope";
import { DocBlockKeyValue, parseDocBlock, getKeyPattern } from "./docblock";
import { Attributes, Attribute, parseAttributes } from "./attribute";
import { equalsIgnoreCase } from "../utils/textUtil";
import { MyMap, MySet } from "../utils/collections";
import { getComponent } from "../features/cachedEntities";
import { parseTags, Tag } from "./tag";
import { DocumentStateContext } from "../utils/documentUtil";
import { getClosingPosition, getNextCharacterPosition } from "../utils/contextUtil";

const scriptFunctionPattern: RegExp = /((\/\*\*((?:\*(?!\/)|[^*])*)\*\/\s+)?(?:\b(private|package|public|remote|static|final|abstract)\s+)?(?:\b(private|package|public|remote|static|final|abstract)\s+)?)(?:\b([A-Za-z0-9_\.$]+)\s+)?function\s+([_$a-zA-Z][$\w]*)\s*\(/gi;
const scriptFunctionArgPattern: RegExp = /((?:(required)\s+)?(?:\b([\w.]+)\b\s+)?(\b[_$a-zA-Z][$\w]*\b)(?:\s*=\s*(\{[^\}]*\}|\[[^\]]*\]|\([^\)]*\)|(?:(?!\b\w+\s*=).)+))?)(.*)?/i;

/*
const userFunctionAttributeNames: MySet<string> = new MySet([
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
*/

const userFunctionBooleanAttributes: MySet<string> = new MySet([
  "static",
  "abstract",
  "final"
]);

const accessArr: string[] = ["public", "private", "package", "remote"];

export const inlineScriptFunctionPattern = /([a-zA-Z_$][$\w.\[\]'"]*)\s*=\s*function\s*\(|function\s+([a-zA-Z_$][$\w]*)\s*\(/gi;

// TODO: Add pattern for arrow function

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
  export function valueOf(access: string): Access {
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
  nameRange: Range;
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
/*
const argumentAttributesToInterfaceMapping = {
  type: "dataType",
  default: "default",
  hint: "description",
  required: "required"
};
*/
const argumentAttributeNames: MySet<string> = new MySet([
  "name",
  "type",
  "default",
  "displayname",
  "hint",
  "required",
  "restargsource",
  "restargname"
]);
/*
const argumentBooleanAttributes: MySet<string> = new MySet([
  "required"
]);
*/
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
 * @param documentStateContext The content information for a TextDocument in which to parse the CFScript functions
 */
export function parseScriptFunctions(documentStateContext: DocumentStateContext): UserFunction[] {
  const document: TextDocument = documentStateContext.document;
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

    const functionNameStartOffset = scriptFunctionMatch.index + fullMatch.lastIndexOf(functionName);
    const functionNameRange: Range = new Range(
      document.positionAt(functionNameStartOffset),
      document.positionAt(functionNameStartOffset + functionName.length)
    );

    const argumentStartOffset = scriptFunctionMatch.index + fullMatch.length;
    const argumentEndPosition = getClosingPosition(documentStateContext, argumentStartOffset, ")");
    const functionArgsRange = new Range(
      document.positionAt(argumentStartOffset),
      argumentEndPosition.translate(0, -1)
    );

    const functionBodyStartPos = getNextCharacterPosition(documentStateContext, document.offsetAt(argumentEndPosition), componentBody.length - 1, "{");
    let functionEndPosition: Position;
    const comp: Component = getComponent(document.uri);
    if (comp && comp.isInterface) {
      functionEndPosition = functionBodyStartPos;
    } else {
      functionEndPosition = getClosingPosition(documentStateContext, document.offsetAt(functionBodyStartPos), "}");
    }

    const functionRange: Range = new Range(
      document.positionAt(scriptFunctionMatch.index),
      functionEndPosition
    );

    /*
    const functionAttributeRange: Range = new Range(
      argumentEndPosition,
      functionBodyStartPos.translate(0, -1)
    );
    */

    const functionBodyRange: Range = new Range(
      functionBodyStartPos,
      functionEndPosition.translate(0, -1)
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

    // TODO: Parse text in functionAttributeRange

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
        } else if (userFunctionBooleanAttributes.has(docElem.key)) {
          userFunction[docElem.key] = DataType.isTruthy(docElem.value);
        } else if (docElem.key === "hint") {
          userFunction.description = docElem.value;
        } else if (docElem.key === "description" && userFunction.description === "") {
          userFunction.description = docElem.value;
        }
      });
    }
    const signature: UserFunctionSignature = {
      parameters: parseScriptFunctionArgs(documentStateContext, functionArgsRange, scriptDocBlockParsed)
    };
    userFunction.signatures = [signature];

    userFunctions.push(userFunction);
  }

  return userFunctions;
}

/**
 * Parses the given arguments into an array of Argument objects that is returned
 * @param documentStateContext The context information for a TextDocument possibly containing function arguments
 * @param argsRange A range within the given document that contains the CFScript arguments
 * @param docBlock The parsed documentation block for the function to which these arguments belong
 */
function parseScriptFunctionArgs(documentStateContext: DocumentStateContext, argsRange: Range, docBlock: DocBlockKeyValue[]): Argument[] {
  let args: Argument[] = [];
  const document: TextDocument = documentStateContext.document;
  const documentUri: Uri = document.uri;

  const scriptArgRanges: Range[] = getScriptFunctionArgRanges(documentStateContext, argsRange);
  scriptArgRanges.forEach((argRange: Range) => {
    const argText: string = documentStateContext.sanitizedDocumentText.slice(document.offsetAt(argRange.start), document.offsetAt(argRange.end));
    const argStartOffset = document.offsetAt(argRange.start);
    const scriptFunctionArgMatch: RegExpExecArray = scriptFunctionArgPattern.exec(argText);
    if (scriptFunctionArgMatch) {
      const fullArg = scriptFunctionArgMatch[0];
      const attributePrefix = scriptFunctionArgMatch[1];
      const argRequired = scriptFunctionArgMatch[2];
      const argType = scriptFunctionArgMatch[3];
      const argName = scriptFunctionArgMatch[4];
      let argDefault = scriptFunctionArgMatch[5];
      const argAttributes = scriptFunctionArgMatch[6];
      const argOffset = argStartOffset + scriptFunctionArgMatch.index;

      if (!argName) {
        return;
      }

      let argDefaultAndAttributesLen = 0;
      if (argDefault) {
        argDefaultAndAttributesLen += argDefault.length;
      }
      let parsedArgAttributes: Attributes;
      if (argAttributes) {
        argDefaultAndAttributesLen += argAttributes.length;

        const functionArgPrefixOffset = argOffset + attributePrefix.length;
        // Account for trailing comma?
        const functionArgRange = new Range(
          document.positionAt(functionArgPrefixOffset),
          document.positionAt(functionArgPrefixOffset + argDefaultAndAttributesLen)
        );
        parsedArgAttributes = parseAttributes(document, functionArgRange, argumentAttributeNames);
      }
      let removedDefaultAndAttributes = fullArg;
      if (argDefaultAndAttributesLen > 0) {
        removedDefaultAndAttributes = fullArg.slice(0, -argDefaultAndAttributesLen);
      }
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
        argDefault = argDefault.trim();
        if (argDefault.length > 1 && /['"]/.test(argDefault.charAt(0)) && /['"]/.test(argDefault.charAt(argDefault.length - 1))) {
          argDefault = argDefault.slice(1, -1).trim();
        }
        if (argDefault.length > 2 && argDefault.startsWith("#") && argDefault.endsWith("#") && argDefault.slice(1, -1).indexOf("#") === -1) {
          argDefault = argDefault.slice(1, -1).trim();
        }
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
  });

  return args;
}

/**
 * Parses the given arguments into an array of Argument objects that is returned
 * @param documentStateContext The context information for a TextDocument possibly containing function arguments
 * @param argsRange A range within the given document that contains the CFScript arguments
 */
function getScriptFunctionArgRanges(documentStateContext: DocumentStateContext, argsRange: Range): Range[] {
  let argRanges: Range[] = [];
  const document: TextDocument = documentStateContext.document;
  const argsEndOffset: number = document.offsetAt(argsRange.end);
  const separatorChar: string = ",";

  let argStartPosition = argsRange.start;
  while (argStartPosition.isBefore(argsRange.end)) {
    const argSeparatorPos = getNextCharacterPosition(documentStateContext, document.offsetAt(argStartPosition), argsEndOffset, separatorChar, false);
    const argRange = new Range(argStartPosition, argSeparatorPos);
    argRanges.push(argRange);
    argStartPosition = argSeparatorPos.translate(0, 1);
  }

  return argRanges;
}

/**
 * Parses the tag function definitions and returns an array of UserFunction objects
 * @param documentStateContext The context information for a TextDocument in which to parse the tag functions
 */
export function parseTagFunctions(documentStateContext: DocumentStateContext): UserFunction[] {
  let userFunctions: UserFunction[] = [];
  const documentUri: Uri = documentStateContext.document.uri;

  const parsedFunctionTags: Tag[] = parseTags(documentStateContext, "cffunction");

  parsedFunctionTags.forEach((tag: Tag) => {
    const functionRange: Range = tag.tagRange;
    const functionBodyRange: Range = tag.bodyRange;
    const parsedAttributes: Attributes = tag.attributes;
    let functionAttributes: UserFunctionAttributes = processFunctionAttributes(parsedAttributes);

    if (!functionAttributes.name) {
      return;
    }

    let userFunction: UserFunction = {
      access: Access.Public,
      static: false,
      abstract: false,
      final: false,
      name: functionAttributes.name,
      description: "",
      returntype: DataType.Any,
      signatures: [],
      nameRange: parsedAttributes.get("name").valueRange,
      bodyRange: functionBodyRange,
      location: new Location(documentUri, functionRange)
    };

    Object.getOwnPropertyNames(functionAttributes).forEach((attrName: string) => {
      if (functionAttributes[attrName]) {
        const attrVal = functionAttributes[attrName];
        if (attrName === "access") {
          userFunction.access = Access.valueOf(attrVal);
        } else if (attrName === "returntype") {
          const checkDataType = DataType.getDataTypeAndUri(attrVal, documentUri);
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
        } else if (userFunctionBooleanAttributes.has(attrName)) {
          userFunction[attrVal] = DataType.isTruthy(attrVal);
        } else if (attrName === "hint") {
          userFunction.description = attrVal;
        } else if (attrName === "description" && userFunction.description === "") {
          userFunction.description = attrVal;
        }
      }
    });

    const signature: UserFunctionSignature = {
      parameters: parseTagFunctionArguments(documentStateContext, functionBodyRange)
    };
    userFunction.signatures = [signature];

    userFunctions.push(userFunction);
  });

  return userFunctions;
}

/**
 * Parses the given function body to extract the arguments into an array of Argument objects that is returned
 * @param documentStateContext The context information for a TextDocument containing these function arguments
 * @param functionBodyRange A range in the given document for the function body
 */
function parseTagFunctionArguments(documentStateContext: DocumentStateContext, functionBodyRange: Range): Argument[] {
  let args: Argument[] = [];
  const documentUri: Uri = documentStateContext.document.uri;

  const parsedArgumentTags: Tag[] = parseTags(documentStateContext, "cfargument", functionBodyRange);

  parsedArgumentTags.forEach((tag: Tag) => {
    const parsedAttributes: Attributes = tag.attributes;

    const argumentAttributes: ArgumentAttributes = processArgumentAttributes(parsedAttributes);

    if (!argumentAttributes) {
      return;
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

    let argDefault: string = argumentAttributes.default;
    if (argDefault) {
      argDefault = argDefault.trim();
      if (argDefault.length > 1 && /['"]/.test(argDefault.charAt(0)) && /['"]/.test(argDefault.charAt(argDefault.length - 1))) {
        argDefault = argDefault.slice(1, -1).trim();
      }
      if (argDefault.length > 2 && argDefault.startsWith("#") && argDefault.endsWith("#") && argDefault.slice(1, -1).indexOf("#") === -1) {
        argDefault = argDefault.slice(1, -1).trim();
      }
      argument.default = argDefault;
    }

    if (typeUri) {
      argument.dataTypeComponentUri = typeUri;
    }

    if (argTypeRange) {
      argument.dataTypeRange = argTypeRange;
    }

    args.push(argument);
  });

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

  return attributeObj as ArgumentAttributes;
}

/**
 * Parses the given user function to extract the local variables into an array of Variable objects that is returned
 * @param func The UserFunction within which to parse local variables
 * @param document The document containing the given function
 * @param isScript Whether this function is defined entirely in CFScript
 */
export function getLocalVariables(func: UserFunction, documentStateContext: DocumentStateContext, isScript: boolean): Variable[] {
  const allVariables: Variable[] = parseVariableAssignments(documentStateContext, isScript, func.bodyRange);

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
