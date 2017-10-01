import { DataType } from "./dataType";

export interface Parameter {
  name: string;
  description: string;
  dataType: DataType;
  required: boolean;
  default?: string;
  enumeratedValues?: string[];
}
