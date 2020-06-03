import * as path from "path";
import { DataType } from "./dataType";
import { Location, Uri, TextDocument, Position, Range } from "vscode";
import { Function, getScriptFunctionArgRanges } from "./function";
import { Parameter } from "./parameter";
import { Signature } from "./signature";
import { Component, isSubcomponentOrEqual } from "./component";
import { Variable, parseVariableAssignments, collectDocumentVariableAssignments, getApplicationVariables, getBestMatchingVariable, getVariableExpressionPrefixPattern } from "./variable";
import { Scope } from "./scope";
import { DocBlockKeyValue, parseDocBlock, getKeyPattern } from "./docblock";
import { Attributes, Attribute, parseAttributes } from "./attribute";
import { equalsIgnoreCase } from "../utils/textUtil";
import { MyMap, MySet } from "../utils/collections";
import { getComponent, hasComponent } from "../features/cachedEntities";
import { parseTags, parseTopLevelTags, Tag } from "./tag";
import { DocumentStateContext, DocumentPositionStateContext } from "../utils/documentUtil";
import { getClosingPosition, getNextCharacterPosition, isInRanges, getCfScriptRanges } from "../utils/contextUtil";

const scriptFunctionPattern: RegExp = /((\/\*\*((?:\*(?!\/)|[^*])*)\*\/\s+)?(?:\b(private|package|public|remote|static|final|abstract|default)\s+)?(?:\b(private|package|public|remote|static|final|abstract|default)\s+)?)(?:\b([A-Za-z0-9_\.$]+)\s+)?function\s+([_$a-zA-Z][$\w]*)\s*\(/gi;
const scriptFunctionArgPattern: RegExp = /((?:(required)\s+)?(?:\b([\w.]+)\b\s+)?(\b[_$a-zA-Z][$\w]*\b)(?:\s*=\s*(\{[^\}]*\}|\[[^\]]*\]|\([^\)]*\)|(?:(?!\b\w+\s*=).)+))?)(.*)?/i;
export const functionValuePattern: RegExp = /^function\s*\(/i;

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
  bodyRange?: Range;
  signatures: UserFunctionSignature[];
  location: Location;
  isImplicit: boolean;
}

export interface UserFunctionVariable extends Variable {
  signature: UserFunctionSignature;
  // returnType?
}

/**
 * Checks whether a Variable is a UserFunction
 * @param variable The variable object to check
 */
export function isUserFunctionVariable(variable: Variable): variable is UserFunctionVariable {
  return "signature" in variable;
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
 * @param documentStateContext The context information for a TextDocument in which to parse the CFScript functions
 */
export function parseScriptFunctions(documentStateContext: DocumentStateContext): UserFunction[] {
  const document: TextDocument = documentStateContext.document;
  let userFunctions: UserFunction[] = [];
  // sanitizedDocumentText removes doc blocks
  const componentBody: string = document.getText();
  let scriptFunctionMatch: RegExpExecArray = null;
  while (scriptFunctionMatch = scriptFunctionPattern.exec(componentBody)) {
    const fullMatch: string = scriptFunctionMatch[0];
    const returnTypePrefix: string = scriptFunctionMatch[1];
    const fullDocBlock: string = scriptFunctionMatch[2];
    const scriptDocBlockContent: string = scriptFunctionMatch[3];
    const modifier1: string = scriptFunctionMatch[4];
    const modifier2: string = scriptFunctionMatch[5];
    const returnType: string = scriptFunctionMatch[6];
    const functionName: string = scriptFunctionMatch[7];

    const functionNameStartOffset: number = scriptFunctionMatch.index + fullMatch.lastIndexOf(functionName);
    const functionNameRange: Range = new Range(
      document.positionAt(functionNameStartOffset),
      document.positionAt(functionNameStartOffset + functionName.length)
    );

    const argumentsStartOffset: number = scriptFunctionMatch.index + fullMatch.length;
    const argumentsEndPosition: Position = getClosingPosition(documentStateContext, argumentsStartOffset, ")");
    const functionArgsRange: Range = new Range(
      document.positionAt(argumentsStartOffset),
      argumentsEndPosition.translate(0, -1)
    );

    let functionBodyStartPos: Position;
    let functionEndPosition: Position;
    let functionAttributeRange: Range;
    let functionBodyRange: Range;

    if ((documentStateContext.component && documentStateContext.component.isInterface && !equalsIgnoreCase(modifier1, "default") && !equalsIgnoreCase(modifier2, "default"))
      || equalsIgnoreCase(modifier1, "abstract") || equalsIgnoreCase(modifier2, "abstract")
    )
    {
      functionBodyStartPos = getNextCharacterPosition(documentStateContext, document.offsetAt(argumentsEndPosition), componentBody.length - 1, ";", false);
      functionEndPosition = functionBodyStartPos;
      functionAttributeRange = new Range(
        argumentsEndPosition,
        functionEndPosition
      );
    } else {
      functionBodyStartPos = getNextCharacterPosition(documentStateContext, document.offsetAt(argumentsEndPosition), componentBody.length - 1, "{");
      functionEndPosition = getClosingPosition(documentStateContext, document.offsetAt(functionBodyStartPos), "}");

      try {
        functionAttributeRange = new Range(
          argumentsEndPosition,
          functionBodyStartPos.translate(0, -1)
        );
      } catch (ex) {
        console.error(ex);
        console.error(`Error parsing ${document.uri.fsPath}:${functionName}`);
        functionAttributeRange = new Range(
          argumentsEndPosition,
          functionBodyStartPos
        );
      }

      functionBodyRange = new Range(
        functionBodyStartPos,
        functionEndPosition.translate(0, -1)
      );
    }

    const functionRange: Range = new Range(
      document.positionAt(scriptFunctionMatch.index),
      functionEndPosition
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
      location: new Location(document.uri, functionRange),
      isImplicit: false
    };

    if (returnType) {
      const checkDataType = DataType.getDataTypeAndUri(returnType, document.uri);
      if (checkDataType) {
        userFunction.returntype = checkDataType[0];
        if (checkDataType[1]) {
          userFunction.returnTypeUri = checkDataType[1];
        }
        const returnTypeOffset: number = scriptFunctionMatch.index + returnTypePrefix.length;
        userFunction.returnTypeRange = new Range(
          document.positionAt(returnTypeOffset),
          document.positionAt(returnTypeOffset + returnType.length)
        );
      }
    }

    if (modifier1) {
      const modifier1Type: string = parseModifier(modifier1);
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

    const parsedAttributes: Attributes = parseAttributes(document, functionAttributeRange);
    userFunction = assignFunctionAttributes(userFunction, parsedAttributes);

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
              const returnTypeOffset: number = scriptFunctionMatch.index + returnTypeKeyMatch.index;
              userFunction.returnTypeRange = new Range(
                document.positionAt(returnTypeOffset),
                document.positionAt(returnTypeOffset + returnTypePath.length)
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
export function parseScriptFunctionArgs(documentStateContext: DocumentStateContext, argsRange: Range, docBlock: DocBlockKeyValue[]): Argument[] {
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

          const argTypeOffset: number = fullArg.indexOf(argType);
          argTypeRange = new Range(
            document.positionAt(argOffset + argTypeOffset),
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
        if (argDefault.length > 2 && argDefault.startsWith("#") && argDefault.endsWith("#") && !argDefault.slice(1, -1).includes("#")) {
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

              argument.dataTypeRange = new Range(
                attr.valueRange.start,
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

            argument.dataTypeRange = new Range(
              docElem.valueRange.start,
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
 * Parses the tag function definitions and returns an array of UserFunction objects
 * @param documentStateContext The context information for a TextDocument in which to parse the tag functions
 */
export function parseTagFunctions(documentStateContext: DocumentStateContext): UserFunction[] {
  let userFunctions: UserFunction[] = [];
  const documentUri: Uri = documentStateContext.document.uri;

  const parsedFunctionTags: Tag[] = parseTags(documentStateContext, "cffunction");

  parsedFunctionTags.forEach((tag: Tag) => {
    const functionRange: Range = tag.tagRange;
    const functionBodyRange: Range = parseTopLevelTags(documentStateContext, "cffunction", new Range(tag.tagRange.start, documentStateContext.document.lineAt(documentStateContext.document.lineCount-1).range.end))[0].bodyRange;
    const parsedAttributes: Attributes = tag.attributes;

    if (!parsedAttributes.has("name") || !parsedAttributes.get("name").value) {
      return;
    }

    let userFunction: UserFunction = {
      access: Access.Public,
      static: false,
      abstract: false,
      final: false,
      name: parsedAttributes.get("name").value,
      description: "",
      returntype: DataType.Any,
      signatures: [],
      nameRange: parsedAttributes.get("name").valueRange,
      bodyRange: functionBodyRange,
      location: new Location(documentUri, functionRange),
      isImplicit: false
    };

    assignFunctionAttributes(userFunction, parsedAttributes);

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
function parseTagFunctionArguments(documentStateContext: DocumentStateContext, functionBodyRange: Range | undefined): Argument[] {
  let args: Argument[] = [];
  const documentUri: Uri = documentStateContext.document.uri;

  if (functionBodyRange === undefined) {
    return args;
  }

  const parsedArgumentTags: Tag[] = parseTags(documentStateContext, "cfargument", functionBodyRange);
  const parsedNestedFunctionTags: Tag[] = parseTopLevelTags(documentStateContext, "cffunction", functionBodyRange);

  parsedArgumentTags.forEach((tag: Tag) => {
    for (let nestedFunctionTag of parsedNestedFunctionTags) {
      if (nestedFunctionTag.bodyRange.contains(tag.tagRange)) {
        return;
      }
    }
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
        argTypeRange = new Range(
          argTypeRange.start,
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
      if (argDefault.length > 2 && argDefault.startsWith("#") && argDefault.endsWith("#") && !argDefault.slice(1, -1).includes("#")) {
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
 * Assigns the given function attributes to the given user function
 * @param userFunction The user function to which the attributes will be assigned
 * @param functionAttributes The attributes that will be assigned to the user function
 */
function assignFunctionAttributes(userFunction: UserFunction, functionAttributes: Attributes): UserFunction {
  functionAttributes.forEach((attribute: Attribute) => {
    const attrName: string = attribute.name;
    if (attribute.value) {
      const attrVal: string = attribute.value;
      if (attrName === "access") {
        userFunction.access = Access.valueOf(attrVal);
      } else if (attrName === "returntype") {
        const checkDataType = DataType.getDataTypeAndUri(attrVal, userFunction.location.uri);
        if (checkDataType) {
          userFunction.returntype = checkDataType[0];
          if (checkDataType[1]) {
            userFunction.returnTypeUri = checkDataType[1];
          }
          const returnTypeRange: Range = functionAttributes.get("returntype").valueRange;
          userFunction.returnTypeRange = new Range(
            returnTypeRange.start,
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

  return userFunction;
}

/**
 * Parses a set of attribute/value pairs for a function argument and returns an object conforming to the ArgumentAttributes interface
 * @param attributes A set of attribute/value pairs for a function argument
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
 * @param documentStateContext The contextual information of the state of a document containing the given function
 * @param isScript Whether this function is defined entirely in CFScript
 */
export function getLocalVariables(func: UserFunction, documentStateContext: DocumentStateContext, isScript: boolean): Variable[] {
  if (!func || !func.bodyRange) {
    return [];
  }

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
  if (accessArr.includes(modifier.toLowerCase())) {
    return "access";
  }

  return modifier;
}

/**
 * Gets the function based on its key and position in the document
 * @param documentPositionStateContext The contextual information of the state of a document and the cursor position
 * @param functionKey The function key for which to get
 * @param docPrefix The document prefix of the function if not the same as docPrefix within documentPositionStateContext
 */
export async function getFunctionFromPrefix(documentPositionStateContext: DocumentPositionStateContext, functionKey: string, docPrefix?: string): Promise<UserFunction | undefined> {
  let foundFunction: UserFunction;

  if (docPrefix === undefined) {
    docPrefix = documentPositionStateContext.docPrefix;
  }

  // TODO: Replace regex check with variable references range check
  // TODO: Check for function variables?
  const varPrefixMatch: RegExpExecArray = getVariableExpressionPrefixPattern().exec(docPrefix);
  if (varPrefixMatch) {
    const varMatchText: string = varPrefixMatch[0];
    const varScope: string = varPrefixMatch[2];
    const varQuote: string = varPrefixMatch[3];
    const varName: string = varPrefixMatch[4];

    let dotSeparatedCount = 2;
    if (varScope && !varQuote) {
      dotSeparatedCount++;
    }

    if (varMatchText.split(".").length === dotSeparatedCount) {
      if (documentPositionStateContext.isCfcFile && !varScope && equalsIgnoreCase(varName, "super")) {
        if (documentPositionStateContext.component && documentPositionStateContext.component.extends) {
          const baseComponent: Component = getComponent(documentPositionStateContext.component.extends);
          if (baseComponent) {
            foundFunction = getFunctionFromComponent(baseComponent, functionKey, documentPositionStateContext.document.uri);
          }
        }
      } else if (documentPositionStateContext.isCfcFile && !varScope && (equalsIgnoreCase(varName, Scope.Variables) || equalsIgnoreCase(varName, Scope.This))) {
        // TODO: Disallow implicit functions if using variables scope
        let disallowedAccess: Access;
        if (equalsIgnoreCase(varName, Scope.This)) {
          disallowedAccess = Access.Private;
        }
        const disallowImplicit: boolean = equalsIgnoreCase(varName, Scope.Variables);

        foundFunction = getFunctionFromComponent(documentPositionStateContext.component, functionKey, documentPositionStateContext.document.uri, disallowedAccess, disallowImplicit);
      } else if (documentPositionStateContext.isCfmFile && !varScope && equalsIgnoreCase(varName, Scope.Variables)) {
        foundFunction = getFunctionFromTemplate(documentPositionStateContext, functionKey);
      } else {
        // TODO: Allow passing variable assignments
        const allDocumentVariableAssignments: Variable[] = collectDocumentVariableAssignments(documentPositionStateContext);

        let variableAssignments: Variable[] = allDocumentVariableAssignments;
        const fileName: string = path.basename(documentPositionStateContext.document.uri.fsPath);
        if (varScope && fileName !== "Application.cfm") {
          const applicationDocVariables: Variable[] = await getApplicationVariables(documentPositionStateContext.document.uri);
          variableAssignments = variableAssignments.concat(applicationDocVariables);
        }

        const scopeVal: Scope = varScope ? Scope.valueOf(varScope) : undefined;
        const foundVar: Variable = getBestMatchingVariable(variableAssignments, varName, scopeVal);

        if (foundVar && foundVar.dataTypeComponentUri) {
          const foundVarComponent: Component = getComponent(foundVar.dataTypeComponentUri);
          if (foundVarComponent) {
            foundFunction = getFunctionFromComponent(foundVarComponent, functionKey, documentPositionStateContext.document.uri);
          }
        }
      }
    }
  } else if (documentPositionStateContext.isCfmFile) {
    foundFunction = getFunctionFromTemplate(documentPositionStateContext, functionKey);
  } else if (documentPositionStateContext.component) {
    foundFunction = getFunctionFromComponent(documentPositionStateContext.component, functionKey, documentPositionStateContext.document.uri);
  }

  return foundFunction;
}

/**
 * Gets the function based on the component to which it belongs, its name, and from where it is being called
 * @param component The component in which to begin looking
 * @param lowerFunctionName The function name all lowercased
 * @param callerUri The URI of the document from which the function is being called
 * @param disallowedAccess An access specifier to disallow
 * @param disallowImplicit Whether to disallow implicit functions from being checked
 */
export function getFunctionFromComponent(component: Component, lowerFunctionName: string, callerUri: Uri, disallowedAccess?: Access, disallowImplicit: boolean = false): UserFunction | undefined {
  let validFunctionAccess: MySet<Access> = new MySet([Access.Remote, Access.Public]);
  if (hasComponent(callerUri)) {
    let callerComponent: Component = getComponent(callerUri);
    if (isSubcomponentOrEqual(callerComponent, component)) {
      validFunctionAccess.add(Access.Private);
      validFunctionAccess.add(Access.Package);
    }
  }

  if (!validFunctionAccess.has(Access.Package) && path.dirname(callerUri.fsPath) === path.dirname(component.uri.fsPath)) {
    validFunctionAccess.add(Access.Package);
  }

  if (disallowedAccess && validFunctionAccess.has(disallowedAccess)) {
    validFunctionAccess.delete(disallowedAccess);
  }

  let currComponent: Component = component;
  while (currComponent) {
    if (currComponent.functions.has(lowerFunctionName)) {
      const foundFunc: UserFunction = currComponent.functions.get(lowerFunctionName);
      if (validFunctionAccess.has(foundFunc.access) && !(disallowImplicit && foundFunc.isImplicit)) {
        return foundFunc;
      }
    }

    if (currComponent.extends) {
      currComponent = getComponent(currComponent.extends);
    } else {
      currComponent = undefined;
    }
  }

  return undefined;
}

/**
 * Gets the function based on the document to which it belongs and its name
 * @param documentStateContext The contextual information of the state of a document
 * @param lowerFunctionName The function name all lowercased
 */
export function getFunctionFromTemplate(documentStateContext: DocumentStateContext, lowerFunctionName: string): UserFunction | undefined {
  const tagFunctions: UserFunction[] = parseTagFunctions(documentStateContext);
  const cfscriptRanges: Range[] = getCfScriptRanges(documentStateContext.document);
  const scriptFunctions: UserFunction[] = parseScriptFunctions(documentStateContext).filter((func: UserFunction) => {
    return isInRanges(cfscriptRanges, func.location.range.start);
  });

  const allTemplateFunctions: UserFunction[] = tagFunctions.concat(scriptFunctions);

  return allTemplateFunctions.find((func: UserFunction) => {
    return equalsIgnoreCase(func.name, lowerFunctionName);
  });
}

/**
 * Returns UserFunction array representation of function variables with some properties undefined
 * @param variables The variables to convert
 */
export function variablesToUserFunctions(variables: UserFunctionVariable[]): UserFunction[] {
  return variables.map((variable: UserFunctionVariable) => {
    const userFun: UserFunction = {
      name: variable.identifier,
      description: variable.description ? variable.description : "",
      returntype: DataType.Any, // Get this from variable
      access: undefined, // Define?
      static: false,
      abstract: false,
      final: variable.final,
      nameRange: variable.declarationLocation.range,
      bodyRange: undefined, // Define
      signatures: [variable.signature],
      location: variable.declarationLocation, // Range is only declaration
      isImplicit: false
    };
    return userFun;
  });
}
