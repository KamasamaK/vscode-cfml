import { Parameter, constructParameterLabel } from "./parameter";
import { Function } from "./function";

export interface Signature {
  parameters: Parameter[];
  description?: string;
}

/**
 * Constructs the beginning part of the signature label
 * @param func The function from which to construct the parameter prefix
 */
export function constructSignatureLabelParamsPrefix(func: Function): string {
  // TODO: If UserFunction, use ComponentName.functionName based on location
  return func.name;
}

/**
 * Constructs a string label representation of the parameters in a signature
 * @param parameters The parameters on which to base the label
 */
export function constructSignatureLabelParamsPart(parameters: Parameter[]): string {
  return parameters.map(constructParameterLabel).join(", ");
}

/**
 * Gets offset tuple ranges for the signature param label
 * @param parameters The parameters in a signature
 */
export function getSignatureParamsLabelOffsetTuples(parameters: Parameter[]): [number, number][] {
  let endIdx: number = -2;

  return parameters.map(constructParameterLabel).map((paramLabel: string) => {
    const startIdx: number = endIdx + 2;
    endIdx = startIdx + paramLabel.length;

    return [startIdx, endIdx] as [number, number];
  });
}
