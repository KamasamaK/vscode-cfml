import { DataType } from "../../entities/dataType";
import { GlobalFunction, GlobalTag } from "../../entities/globals";
import { Parameter } from "../../entities/parameter";
import { Signature } from "../../entities/signature";
import { equalsIgnoreCase } from "../textUtil";
import CFDocsService from "./cfDocsService";
import { CFMLEngine, CFMLEngineName } from "./cfmlEngine";
import { multiSigGlobalFunctions } from "./multiSignatures";
import * as htmlEntities from "html-entities";

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
  [name: string]: EngineCompatibilityDetail;
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
          for (const param of this.params) {
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
          description: htmlEntities.decode(param.description),
          default: param.default,
          enumeratedValues: param.values
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
      description: (this.description ? htmlEntities.decode(this.description) : ""),
      returntype: getReturnDataType(this.returns.toLowerCase()),
      signatures: signatures
    };
  }

  /**
   * Returns a GlobalTag object based on this object
   */
  public toGlobalTag(): GlobalTag {
    let parameters: Parameter[] = this.params.map((param: Param) => {
      return {
        name: param.name,
        dataType: getParamDataType(param.type.toLowerCase()),
        required: param.required,
        description: htmlEntities.decode(param.description),
        default: param.default,
        enumeratedValues: param.values
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
      scriptSyntax: this.script,
      description: (this.description ? htmlEntities.decode(this.description) : ""),
      signatures: signatures,
      hasBody: true
    };
  }

  /**
   * Checks if this definition is compatible with given engine
   * @param engine The CFML engine with which to check compatibility
   */
  public isCompatible(engine: CFMLEngine): boolean {
    const engineVendor: CFMLEngineName = engine.getName();
    if (engineVendor === CFMLEngineName.Unknown || !this.engines) {
      return true;
    }

    const engineCompat: EngineCompatibilityDetail = this.engines[engineVendor];
    if (!engineCompat) {
      return false;
    }

    const engineVersion: string = engine.getVersion();
    if (!engineVersion) {
      return true;
    }

    if (engineCompat.minimum_version) {
      const minEngine: CFMLEngine = new CFMLEngine(engineVendor, engineCompat.minimum_version);
      if (engine.isOlder(minEngine)) {
        return false;
      }
    }

    if (engineCompat.removed) {
      const maxEngine: CFMLEngine = new CFMLEngine(engineVendor, engineCompat.removed);
      if (engine.isNewerOrEquals(maxEngine)) {
        return false;
      }
    }

    return true;
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
    return allFunctionNames.includes(name.toLowerCase());
  }

  /**
   * Returns whether the given identifier is the name of a tag documented in CFDocs
   * @param name The identifier to check for
   */
  public static async isTagName(name: string): Promise<boolean> {
    let allTagNames: string[] = await CFDocsDefinitionInfo.getAllTagNames();
    return allTagNames.includes(name.toLowerCase());
  }

  /**
   * Returns whether the given identifier is the name of a function or tag documented in CFDocs
   * @param name The identifier to check for
   */
  public static async isIdentifier(name: string): Promise<boolean> {
    return (CFDocsDefinitionInfo.isFunctionName(name) || CFDocsDefinitionInfo.isTagName(name));
  }
}
