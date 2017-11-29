import { Parameter, constructParameterLabel } from "./parameter";

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
  signature.parameters.forEach((param: Parameter, i: number) => {
    const optional = !param.required;
    if (optional) {
      if (i > 0) {
        sigString += " ";
      }
      sigString += "[";
    }
    if (i > 0) {
      sigString += ", ";
    }

    sigString += constructParameterLabel(param);

    if (optional) {
      sigString += "]";
    }
  });

  return sigString;
}
