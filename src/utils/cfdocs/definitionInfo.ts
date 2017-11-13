import * as fs from "fs";
import * as path from "path";
import { CFDocsService } from "./cfDocsService";
import { GlobalFunction, GlobalTag } from "../../entities/globals";
import { Signature } from "../../entities/signature";
import { Parameter } from "../../entities/parameter";
import { DataType } from "../../entities/dataType";
import { multiSigGlobalFunctions } from "./multiSignatures";
import { equalsIgnoreCase } from "../textUtil";
import { MyMap } from "../collections";
import { CFMLEngineVendor } from "./cfmlEngine";

export interface Param {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  default?: string;
  values?: string[];
}

export interface EngineCompatibilityDetail {
  minimum_version?: string;
  deprecated?: string;
  removed?: string;
  notes?: string;
  docs?: string;
}

export interface EngineInfo {
  [vendor: string]: EngineCompatibilityDetail;
}

export interface Example {
  title: string;
  description: string;
  code: string;
  result: string;
  runnable?: boolean;
}

/**
 * Resolves a string value of data type to an enumeration member
 * @param type The data type string to resolve
 */
function getParamDataType(type: string): DataType {
  switch (type) {
    case "any":
      return DataType.Any;
    case "array":
      return DataType.Array;
    case "binary":
      return DataType.Binary;
    case "boolean":
      return DataType.Boolean;
    case "component":
      return DataType.Component;
    case "date":
      return DataType.Date;
    case "function":
      return DataType.Function;
    case "guid":
      return DataType.GUID;
    case "numeric":
      return DataType.Numeric;
    case "query":
      return DataType.Query;
    case "string":
      return DataType.String;
    case "struct":
      return DataType.Struct;
    case "uuid":
      return DataType.UUID;
    case "variablename":
      return DataType.VariableName;
    case "xml":
      return DataType.XML;
    default:
      // console.log("Unknown param type: " + type);
      return DataType.Any;
  }
}

/**
 * Resolves a string value of data type to an enumeration member
 * @param type The data type string to resolve
 */
function getReturnDataType(type: string): DataType {
  switch (type) {
    case "any":
      return DataType.Any;
    case "array":
      return DataType.Array;
    case "binary":
      return DataType.Binary;
    case "boolean":
      return DataType.Boolean;
    case "date":
      return DataType.Date;
    case "function":
      return DataType.Function;
    case "guid":
      return DataType.GUID;
    case "numeric":
      return DataType.Numeric;
    case "query":
      return DataType.Query;
    case "string":
      return DataType.String;
    case "struct":
      return DataType.Struct;
    case "uuid":
      return DataType.UUID;
    case "variablename":
      return DataType.VariableName;
    case "void":
      return DataType.Void;
    case "xml":
      return DataType.XML;
    default:
      return DataType.Any; // DataType.Void?
  }
}

export class CFDocsDefinitionInfo {
  private static allFunctionNames: string[];
  private static allTagNames: string[];

  public name: string;
  public type: string;
  public syntax: string;
  public member?: string;
  public script?: string;
  public returns?: string;
  public related?: string[];
  public description?: string;
  public discouraged?: string;
  public params?: Param[];
  public engines?: EngineInfo;
  public links?: string[];
  public examples?: Example[];

  constructor(
    name: string, type: string, syntax: string, member: string, script: string, returns: string, related: string[],
    description: string, discouraged: string, params: Param[], engines: EngineInfo, links: string[], examples: Example[]
  ) {
    this.name = name;
    this.type = type;
    this.syntax = syntax;
    this.member = member;
    this.script = script;
    this.returns = returns;
    this.related = related;
    this.description = description;
    this.discouraged = discouraged;
    this.params = params;
    this.engines = engines;
    this.links = links;
    this.examples = examples;
  }

  /**
   * Returns whether this object is a function
   */
  public isFunction(): boolean {
    return (equalsIgnoreCase(this.type, "function"));
  }

  /**
   * Returns whether this object is a tag
   */
  public isTag(): boolean {
    return (equalsIgnoreCase(this.type, "tag"));
  }

  /**
   * Returns a GlobalFunction object based on this object
   */
  public toGlobalFunction(): GlobalFunction {
    let signatures: Signature[] = [];
    if (multiSigGlobalFunctions.has(this.name)) {
      let thisMultiSigs: string[][] = multiSigGlobalFunctions.get(this.name);
      thisMultiSigs.forEach((thisMultiSig: string[]) => {
        let parameters: Parameter[] = [];
        thisMultiSig.forEach((multiSigParam: string) => {
          let paramFound = false;
          for (let param of this.params) {
            let multiSigParamParsed: string = multiSigParam.split("=")[0];
            if (param.name === multiSigParamParsed) {
              let parameter: Parameter = {
                name: multiSigParam,
                dataType: getParamDataType(param.type.toLowerCase()),
                required: param.required,
                description: param.description,
                default: param.default,
                enumeratedValues: param.values
              };
              parameters.push(parameter);
              paramFound = true;
              break;
            }
          }
          if (!paramFound) {
            let parameter: Parameter = {
              name: multiSigParam,
              dataType: DataType.Any,
              required: false,
              description: ""
            };
            parameters.push(parameter);
          }
        });
        let signatureInfo: Signature = {
          parameters: parameters
        };
        signatures.push(signatureInfo);
      });
    } else {
      let parameters: Parameter[] = this.params.map((param: Param) => {
        return {
          name: param.name,
          dataType: getParamDataType(param.type.toLowerCase()),
          required: param.required,
          description: param.description,
          default: param.default,
          values: param.values
        };
      });
      let signatureInfo: Signature = {
        parameters: parameters
      };
      signatures.push(signatureInfo);
    }

    return {
      name: this.name,
      syntax: this.syntax,
      description: (this.description ? this.description : ""),
      returntype: getReturnDataType(this.returns.toLowerCase()),
      signatures: signatures
    };
  }

  /**
   * Returns a GlobalTag object based on this object
   */
  public toGlobalTag(): GlobalTag {
    // TODO: Account for multiple signatures

    let parameters: Parameter[] = this.params.map((param: Param) => {
      return {
        name: param.name,
        dataType: getParamDataType(param.type.toLowerCase()),
        required: param.required,
        description: param.description,
        default: param.default,
        values: param.values
      };
    });

    let signatureInfo: Signature = {
      parameters: parameters
    };
    let signatures: Signature[] = [];
    signatures.push(signatureInfo);

    return {
      name: this.name,
      syntax: this.syntax,
      description: this.description,
      signatures: signatures,
      hasScript: (this.script && this.script.length !== 0),
      hasBody: true
    };
  }

  /**
   * Gets all function names documented by CFDocs. Once retrieved, they are statically stored.
   */
  public static async getAllFunctionNames(): Promise<string[]> {
    if (!CFDocsDefinitionInfo.allFunctionNames) {
      CFDocsDefinitionInfo.allFunctionNames = await CFDocsService.getAllFunctionNames();
    }

    return CFDocsDefinitionInfo.allFunctionNames;
  }

  /**
   * Gets all tag names documented by CFDocs. Once retrieved, they are statically stored.
   */
  public static async getAllTagNames(): Promise<string[]> {
    if (!CFDocsDefinitionInfo.allTagNames) {
      CFDocsDefinitionInfo.allTagNames = await CFDocsService.getAllTagNames();
    }

    return CFDocsDefinitionInfo.allTagNames;
  }

  /**
   * Returns whether the given identifier is the name of a function documented in CFDocs
   * @param name The identifier to check for
   */
  public static async isFunctionName(name: string): Promise<boolean> {
    let allFunctionNames: string[] = await CFDocsDefinitionInfo.getAllFunctionNames();
    return (allFunctionNames.indexOf(name.toLowerCase()) !== -1);
  }

  /**
   * Returns whether the given identifier is the name of a tag documented in CFDocs
   * @param name The identifier to check for
   */
  public static async isTagName(name: string): Promise<boolean> {
    let allTagNames: string[] = await CFDocsDefinitionInfo.getAllTagNames();
    return (allTagNames.indexOf(name.toLowerCase()) !== -1);
  }

  /**
   * Returns whether the given identifier is the name of a function or tag documented in CFDocs
   * @param name The identifier to check for
   */
  public static async isIdentifier(name: string): Promise<boolean> {
    return (CFDocsDefinitionInfo.isFunctionName(name) || CFDocsDefinitionInfo.isTagName(name));
  }
}
