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
  return signature.parameters.map(constructParameterLabel).join(", ");
}
