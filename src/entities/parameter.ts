import { DataType } from "./dataType";
import { Argument } from "./userFunction";
import { COMPONENT_EXT } from "./component";
import * as path from "path";

export interface Parameter {
  name: string;
  description: string;
  dataType: DataType;
  required: boolean;
  default?: string;
  enumeratedValues?: string[];
}

export const namedParameterPattern: RegExp = /^\s*([\w$]+)\s*=(?!=)/;

/**
 * Gets the parameter's name
 * @param param The Parameter object from which to get the name
 */
export function getParameterName(param: Parameter): string {
  return param.name.split("=")[0];
}

/**
 * Constructs a string label representation of a parameter
 * @param param The Parameter object on which to base the label
 */
export function constructParameterLabel(param: Parameter): string {
  let paramLabel = getParameterName(param);
  if (!param.required) {
    paramLabel += "?";
  }

  let paramType: string = param.dataType.toLowerCase();
  if (param.dataType === DataType.Component) {
    const arg: Argument = param as Argument;
    if (arg.dataTypeComponentUri) {
      paramType = path.basename(arg.dataTypeComponentUri.fsPath, COMPONENT_EXT);
    }
  }

  paramLabel += ": " + paramType;

  return paramLabel;
}
