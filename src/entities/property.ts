import { Location, Range, TextDocument, Uri } from "vscode";
import { MyMap, MySet } from "../utils/collections";
import { Attribute, Attributes, parseAttributes } from "./attribute";
import { getComponentNameFromDotPath } from "./component";
import { DataType } from "./dataType";
import { DocBlockKeyValue, parseDocBlock } from "./docblock";
import { Access, UserFunction, UserFunctionSignature } from "./userFunction";
import { DocumentStateContext } from "../utils/documentUtil";

const propertyPattern: RegExp = /((\/\*\*((?:\*(?!\/)|[^*])*)\*\/\s+)?(?:<cf)?property\b)([^;>]*)/gi;
// const attributePattern: RegExp = /\b(\w+)\b(?:\s*=\s*(?:(['"])(.*?)\2|([a-z0-9:.]+)))?/gi;

const propertyAttributeNames: MySet<string> = new MySet([
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
const booleanAttributes: MySet<string> = new MySet([
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
  default?: string;
}

// Collection of properties for a particular component. Key is property name lowercased.
export class Properties extends MyMap<string, Property> { }

/**
 * Returns an array of Property objects that define properties within the given component
 * @param document The document to parse which should represent a component
 */
export function parseProperties(documentStateContext: DocumentStateContext): Properties {
  let properties: Properties = new Properties();
  const document: TextDocument = documentStateContext.document;
  const componentText: string = document.getText();
  let propertyMatch: RegExpExecArray = null;
  while (propertyMatch = propertyPattern.exec(componentText)) {
    const propertyAttributePrefix: string = propertyMatch[1];
    const propertyFullDoc: string = propertyMatch[2];
    const propertyDocContent: string = propertyMatch[3];
    const propertyAttrs: string = propertyMatch[4];
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
        const activeKey: string = docElem.key;
        if (activeKey === "type") {
          const checkDataType: [DataType, Uri] = DataType.getDataTypeAndUri(docElem.value, document.uri);
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
      const propertyAttributesOffset: number = propertyMatch.index + propertyAttributePrefix.length;
      const propertyAttributeRange = new Range(
        document.positionAt(propertyAttributesOffset),
        document.positionAt(propertyAttributesOffset + propertyAttrs.length)
      );
      const parsedPropertyAttributes: Attributes = parseAttributes(document, propertyAttributeRange, propertyAttributeNames);
      if (!parsedPropertyAttributes.has("name")) {
        continue;
      }

      parsedPropertyAttributes.forEach((attr: Attribute, attrKey: string) => {
        if (attrKey === "name") {
          property.name = attr.value;
          property.nameRange = attr.valueRange;
        } else if (attrKey === "type") {
          const checkDataType: [DataType, Uri] = DataType.getDataTypeAndUri(attr.value, document.uri);
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
      const parsedPropertyAttributes: RegExpExecArray = /\s*(\S+)\s+([\w$]+)\s*$/.exec(propertyAttrs);
      if (!parsedPropertyAttributes) {
        continue;
      }

      const dataTypeString: string = parsedPropertyAttributes[1];
      const checkDataType: [DataType, Uri] = DataType.getDataTypeAndUri(dataTypeString, document.uri);
      if (checkDataType) {
        property.dataType = checkDataType[0];
        if (checkDataType[1]) {
          property.dataTypeComponentUri = checkDataType[1];
        }
      }
      property.name = parsedPropertyAttributes[2];

      const removedName: string = propertyMatch[0].slice(0, -property.name.length);
      const nameAttributeOffset: number = propertyMatch.index + removedName.length;
      property.nameRange = new Range(
        document.positionAt(nameAttributeOffset),
        document.positionAt(nameAttributeOffset + property.name.length)
      );

      const dataTypeOffset: number = propertyMatch.index + removedName.lastIndexOf(dataTypeString);
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

/**
 * Constructs the getter implicit function for the given component property
 * @param property The component property for which to construct the getter
 * @param componentUri The URI of the component in which the property is defined
 */
export function constructGetter(property: Property, componentUri: Uri): UserFunction {
  return {
    access: Access.Public,
    static: false,
    abstract: false,
    final: false,
    bodyRange: undefined,
    name: "get" + property.name.charAt(0).toUpperCase() + property.name.slice(1),
    description: property.description,
    returntype: property.dataType,
    returnTypeUri: property.dataTypeComponentUri,
    nameRange: property.nameRange,
    signatures: [{parameters: []}],
    location: new Location(componentUri, property.propertyRange),
    isImplicit: true
  };
}

/**
 * Constructs the setter implicit function for the given component property
 * @param property The component property for which to construct the setter
 * @param componentUri The URI of the component in which the property is defined
 */
export function constructSetter(property: Property, componentUri: Uri): UserFunction {
  let implicitFunctionSignature: UserFunctionSignature = {
    parameters: [
      {
        name: property.name,
        nameRange: undefined,
        description: property.description,
        required: true,
        dataType: property.dataType,
        dataTypeComponentUri: property.dataTypeComponentUri,
        default: property.default
      }
    ]
  };

  return {
    access: Access.Public,
    static: false,
    abstract: false,
    final: false,
    bodyRange: undefined,
    name: "set" + property.name.charAt(0).toUpperCase() + property.name.slice(1),
    description: property.description,
    returntype: DataType.Component,
    returnTypeUri: componentUri,
    nameRange: property.nameRange,
    signatures: [implicitFunctionSignature],
    location: new Location(componentUri, property.propertyRange),
    isImplicit: true
  };
}
