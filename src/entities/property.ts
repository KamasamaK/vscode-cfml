import { TextDocument, Uri, Location, Range } from "vscode";
import { DataType } from "./dataType";
import { DocBlockKeyValue, parseDocBlock } from "./docblock";
import { parseAttributes, Attribute } from "./attribute";
import { getComponentNameFromDotPath } from "./component";
import { MyMap } from "../utils/collections";

const propertyPattern: RegExp = /((\/\*\*((?:\*(?!\/)|[^*])*)\*\/\s+)?(?:<cf)?property\b)([^;>]*)/gi;
const attributePattern = /\b(\w+)\b(?:\s*=\s*(?:(['"])(.*?)\2|([a-z0-9:.]+)))?/gi;

const propertyAttributeNames: Set<string> = new Set([
  "name",
  "displayname",
  "hint",
  "default",
  "required",
  "type",
  "serializable",
  "getter",
  "setter"
]);
const booleanAttributes: Set<string> = new Set([
  "getter",
  "setter"
]);

export interface Property {
  name: string;
  dataType: DataType;
  dataTypeComponentUri?: Uri; // Only when dataType is Component
  description?: string;
  getter?: boolean;
  setter?: boolean;
  nameRange: Range;
  dataTypeRange?: Range;
  propertyRange: Range;
}

// Collection of properties for a particular component. Key is property name lowercased.
export class Properties extends MyMap<string, Property> { }

/**
 * Returns an array of Property objects that define properties within the given component
 * @param document The document to parse which should represent a component
 */
export function parseProperties(document: TextDocument): Properties {
  let properties: Properties = new Properties();
  const componentText: string = document.getText();
  let propertyMatch: RegExpExecArray = null;
  while (propertyMatch = propertyPattern.exec(componentText)) {
    const propertyAttributePrefix = propertyMatch[1];
    const propertyFullDoc = propertyMatch[2];
    const propertyDocContent = propertyMatch[3];
    const propertyAttrs = propertyMatch[4];
    let property: Property = {
      name: "",
      dataType: DataType.Any,
      description: "",
      nameRange: new Range(
        document.positionAt(propertyMatch.index),
        document.positionAt(propertyMatch.index + propertyMatch[0].length)
      ),
      propertyRange: new Range(
        document.positionAt(propertyMatch.index),
        document.positionAt(propertyMatch.index + propertyMatch[0].length + 1)
      )
    };

    if (propertyFullDoc) {
      const propertyDocBlockParsed: DocBlockKeyValue[] = parseDocBlock(document,
        new Range(
          document.positionAt(propertyMatch.index + 3),
          document.positionAt(propertyMatch.index + 3 + propertyDocContent.length)
        )
      );

      propertyDocBlockParsed.forEach((docElem: DocBlockKeyValue) => {
        const activeKey = docElem.key;
        if (activeKey === "type") {
          const checkDataType = DataType.getDataTypeAndUri(docElem.value, document.uri);
          if (checkDataType) {
            property.dataType = checkDataType[0];
            if (checkDataType[1]) {
              property.dataTypeComponentUri = checkDataType[1];
            }

            property.dataTypeRange = docElem.valueRange;
          }
        } else if (activeKey === "hint") {
          property.description = docElem.value;
        } else if (booleanAttributes.has(activeKey)) {
          property[activeKey] = DataType.isTruthy(docElem.value);
        } else {
          property[activeKey] = docElem.value;
        }
      });
    }

    if (/=/.test(propertyAttrs)) {
      const propertyAttributesOffset = propertyMatch.index + propertyAttributePrefix.length;
      const propertyAttributeRange = new Range(
        document.positionAt(propertyAttributesOffset),
        document.positionAt(propertyAttributesOffset + propertyAttrs.length)
      );
      const parsedPropertyAttributes = parseAttributes(document, propertyAttributeRange, propertyAttributeNames);
      if (!parsedPropertyAttributes.has("name")) {
        continue;
      }

      parsedPropertyAttributes.forEach((attr: Attribute, attrKey: string) => {
        if (attrKey === "name") {
          property.name = attr.value;
          property.nameRange = attr.valueRange;
        } else if (attrKey === "type") {
          const checkDataType = DataType.getDataTypeAndUri(attr.value, document.uri);
          if (checkDataType) {
            property.dataType = checkDataType[0];
            if (checkDataType[1]) {
              property.dataTypeComponentUri = checkDataType[1];
            }

            property.dataTypeRange = attr.valueRange;
          }
        } else if (attrKey === "hint") {
          property.description = attr.value;
        } else if (booleanAttributes.has(attrKey)) {
          property[attrKey] = DataType.isTruthy(attr.value);
        } else {
          property[attrKey] = attr.value;
        }
      });
    } else {
      const parsedPropertyAttributes = /\s*(\S+)\s+([\w$]+)\s*$/.exec(propertyAttrs);
      if (!parsedPropertyAttributes) {
        continue;
      }

      const dataTypeString: string = parsedPropertyAttributes[1];
      const checkDataType = DataType.getDataTypeAndUri(dataTypeString, document.uri);
      if (checkDataType) {
        property.dataType = checkDataType[0];
        if (checkDataType[1]) {
          property.dataTypeComponentUri = checkDataType[1];
        }
      }
      property.name = parsedPropertyAttributes[2];

      const removedName = propertyMatch[0].slice(0, -property.name.length);
      const nameAttributeOffset: number = removedName.lastIndexOf(property.name);
      property.nameRange = new Range(
        document.positionAt(nameAttributeOffset),
        document.positionAt(nameAttributeOffset + property.name.length)
      );

      const dataTypeOffset: number = propertyMatch.index + propertyMatch[0].lastIndexOf(dataTypeString);
      const typeName: string = getComponentNameFromDotPath(dataTypeString);
      property.dataTypeRange = new Range(
        document.positionAt(dataTypeOffset + dataTypeString.length - typeName.length),
        document.positionAt(dataTypeOffset + dataTypeString.length)
      );
    }

    if (property.name) {
      properties.set(property.name.toLowerCase(), property);
    }
  }

  return properties;
}
