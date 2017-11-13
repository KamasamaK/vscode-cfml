import { Parameter } from "./parameter";

export interface Signature  {
  parameters: Parameter[];
  description?: string;
}

/**
 * Constructs a string label representation of a signature
 * @param signature The Signature object on which to base the label
 */
export function constructSignatureLabel(signature: Signature): string {
  let sigString = "";
  let startOptional = false;
  // TODO: Account for non-sequential optional parameters
  signature.parameters.forEach((param: Parameter, i: number) => {
    if (!param.required && !startOptional) {
      startOptional = true;
      sigString += "[";
    }
    if (i > 0) {
      sigString += ", ";
    }
    sigString += param.dataType + " " + param.name + " ";
  });


  if (sigString.length > 0 && startOptional) {
    sigString += "]";
  }

  return sigString;
}
