import { Range, TextDocument } from "vscode";
import { MyMap, MySet } from "../utils/collections";

export const ATTRIBUTES_PATTERN = /\b(\w+)\b(?:(\s*=\s*)(?:(['"])(.*?)\3|([a-z0-9:.]+)))?/gi;
export const VALUE_PATTERN = /=\s*['"]?$/;

export interface Attribute {
  name: string; // lowercased
  value: string;
  valueRange: Range;
}

// Collection of attributes. Key is attribute name lowercased
export class Attributes extends MyMap<string, Attribute> { }

/**
 * Gets a regular expression that matches an attribute with the given name
 * @param attributeName The attribute name to use for the pattern
 */
export function getAttributePattern(attributeName: string): RegExp {
  return new RegExp(`\\b${attributeName}\\s*=\\s*(?:['"])?`, "i");
}

/**
 * Parses a given attribute string and returns an object representation
 * @param document A text document containing attributes
 * @param attributeRange A range in which the attributes are found
 * @param validAttributeNames A set of valid names
 */
export function parseAttributes(document: TextDocument, attributeRange: Range, validAttributeNames = new MySet<string>()): Attributes {
  let attributeStr: string = document.getText(attributeRange);
  let attributes: Attributes = new Attributes();
  let attributeMatch: RegExpExecArray = null;
  while (attributeMatch = ATTRIBUTES_PATTERN.exec(attributeStr)) {
    const attributeName = attributeMatch[1];
    if (!validAttributeNames.has(attributeName.toLowerCase())) {
      continue;
    }
    const separator: string = attributeMatch[2];
    const quotedValue: string = attributeMatch[4];
    const unquotedValue:string = attributeMatch[5];
    const attributeValue: string = quotedValue ? quotedValue : unquotedValue;

    let attributeValueOffset: number;
    let attributeValueRange: Range;
    if (attributeValue) {
      attributeValueOffset = document.offsetAt(attributeRange.start) + attributeMatch.index + attributeName.length
        + separator.length + (quotedValue ? 1 : 0);
      attributeValueRange = new Range(
        document.positionAt(attributeValueOffset),
        document.positionAt(attributeValueOffset + attributeValue.length)
      );
    }

    attributes.set(attributeName.toLowerCase(), {
      name: attributeName,
      value: attributeValue,
      valueRange: attributeValueRange
    });
  }

  return attributes;
}
