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

/**
 * Constructs a string label representation of a parameter
 * @param param The Parameter object on which to base the label
 */
export function constructParameterLabel(param: Parameter): string {
  let paramType: string = param.dataType.toLowerCase();
  if (param.dataType === DataType.Component) {
    const arg: Argument = <Argument>param;
    if (arg.dataTypeComponentUri) {
      paramType = path.basename(arg.dataTypeComponentUri.fsPath, COMPONENT_EXT);
    }
  }

  return paramType + " " + param.name;
}