import { Uri } from "vscode";
import { componentPathToUri } from "./component";
import { equalsIgnoreCase } from "../utils/textUtil";

export enum DataType {
  Any = "any",
  Array = "array",
  Binary = "binary",
  Boolean = "boolean",
  Component = "component",
  Date = "date",
  Function = "function",
  GUID = "guid",
  Numeric = "numeric",
  Query = "query",
  String = "string",
  Struct = "struct",
  UUID = "uuid",
  VariableName = "variablename",
  Void = "void",
  XML = "xml"
}

export namespace DataType {
  /**
   * Resolves a string value of data type to an enumeration member
   * @param dataType The data type string to resolve
   */
  export function valueOf(dataType: string): DataType {
    switch (dataType.toLowerCase()) {
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
      case "void":
        return DataType.Void;
      case "xml":
        return DataType.XML;
      default:
        return DataType.Any;
    }
  }

  /**
   * Resolves a string value of param type to an enumeration member
   * @param paramType The param type string to resolve
   */
  export function paramTypeToDataType(paramType: string): DataType {
    switch (paramType.toLowerCase()) {
      case "any":
        return DataType.Any;
      case "array":
        return DataType.Array;
      case "binary":
        return DataType.Binary;
      case "boolean":
        return DataType.Boolean;
      /*
      case "component":
        return DataType.Component;
      */
      case "date": case "eurodate": case "usdate":
        return DataType.Date;
      case "function":
        return DataType.Function;
      case "guid":
        return DataType.GUID;
      case "numeric": case "float": case "integer": case "range":
        return DataType.Numeric;
      case "query":
        return DataType.Query;
      case "string": case "creditcard": case "email": case "regex": case "regular_expression":
      case "ssn": case "social_security_number": case "telephone": case "url": case "zipcode":
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
        return DataType.Any;
    }
  }

  /**
   * Validates whether a string is numeric
   * @param numStr A string to check
   */
  export function isNumeric(numStr: string): boolean {
    let numStrTest = numStr;
    if (/^(["'])[0-9.]+\1$/.test(numStrTest)) {
      numStrTest = numStrTest.slice(1, -1);
    }
    return (!isNaN(parseFloat(numStrTest)) && isFinite(parseFloat(numStrTest)));
  }

  /**
   * Checks whether a string is a valid data type
   * @param dataType A string to check
   */
  export function isDataType(dataType: string): boolean {
    return (equalsIgnoreCase(dataType, "any") || valueOf(dataType) !== DataType.Any);
  }

  /**
   * Returns the truthy value of a string
   * @param boolStr A string to evaluate
   */
  export function isTruthy(boolStr: string): boolean {
    if (equalsIgnoreCase(boolStr, "true") || equalsIgnoreCase(boolStr, "yes")) {
      return true;
    }
    if (isNumeric(boolStr)) {
      return (parseFloat(boolStr) !== 0);
    }

    return false;
  }

  /**
   * Gets the data type and if applicable component URI from given string.
   * @param dataType The string to check
   * @param documentUri The document's URI that contains this type string
   */
  export function getDataTypeAndUri(dataType: string, documentUri: Uri): [DataType, Uri] {
    if (isDataType(dataType)) {
      return [valueOf(dataType), null];
    } else {
      const typeUri: Uri = componentPathToUri(dataType, documentUri);
      if (typeUri) {
        return [DataType.Component, typeUri];
      }
    }

    return undefined;
  }

  /**
   * Take the value and parse and try to infer its type
   * @param value
   */
  export function inferDataTypeFromValue(value: string, documentUri: Uri): [DataType, Uri] {
    if (value.length === 0) {
      return [DataType.String, null];
    }

    if (/^(['"])?(false|true|no|yes)\1$/i.test(value)) {
      return [DataType.Boolean, null];
    }

    if (isNumeric(value)) {
      return [DataType.Numeric, null];
    }

    if (/^(["'])(?!#)/.test(value)) {
      return [DataType.String, null];
    }

    if (/^(?:["']\s*#\s*)?(arrayNew\(|\[)/i.test(value)) {
      return [DataType.Array, null];
    }

    if (/^(?:["']\s*#\s*)?query(?:New|Execute)?\(/i.test(value)) {
      return [DataType.Query, null];
    }

    if (/^(?:["']\s*#\s*)?(structNew\(|\{)/i.test(value)) {
      return [DataType.Struct, null];
    }

    if (/^(?:["']\s*#\s*)?(createDate(Time)?\()/i.test(value)) {
      return [DataType.Date, null];
    }

    const objectMatch1 = /^(?:["']\s*#\s*)?(createObject\((["'])component\2\s*,\s*(["'])([^'"]+)\3)/i.exec(value);
    if (objectMatch1) {
      const findUri: [DataType, Uri] = getDataTypeAndUri(objectMatch1[4], documentUri);
      if (findUri) {
        return findUri;
      }
      return [DataType.Component, null];
    }

    const objectMatch2 = /^(?:["']\s*#\s*)?(new\s+(["'])?([^'"(]+)\2\()/i.exec(value);
    if (objectMatch2) {
      const findUri: [DataType, Uri] = getDataTypeAndUri(objectMatch2[3], documentUri);
      if (findUri) {
        return findUri;
      }
      return [DataType.Component, null];
    }

    return [DataType.Any, null];
  }
}
