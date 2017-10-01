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
   * Validates whether a string is numeric
   * @param numStr A string to check
   */
  export function isNumeric(numStr: string): boolean {
    return (!isNaN(parseFloat(numStr)) && isFinite(parseFloat(numStr)));
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
   * @param dataType A string to evaluate
   */
  export function isTruthy(boolStr: string): boolean {
    if (equalsIgnoreCase(boolStr, "true") || equalsIgnoreCase(boolStr, "yes")) {
      return true;
    }
    if (isNumeric(boolStr)) {
      const boolNum = parseFloat(boolStr);
      if (boolNum !== 0) {
        return true;
      }
    }

    return false;
  }

  /**
   * Gets either the data type or component URI from given string. If URI, the data type would be Component
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

    return null;
  }
}
