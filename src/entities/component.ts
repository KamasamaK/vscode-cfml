import { Uri, TextDocument, workspace, Position, Range, WorkspaceFolder } from "vscode";
import { UserFunction, ComponentFunctions, parseScriptFunctions, parseTagFunctions } from "./userFunction";
import { DataType } from "./dataType";
import * as path from "path";
import * as fs from "fs";
import * as cachedEntities from "../features/cachedEntities";
import { parseProperties, Properties } from "./property";
import { parseVariableAssignments, Variable } from "./variable";
import { parseDocBlock, DocBlockKeyValue } from "./docblock";
import { parseAttributes, Attributes, Attribute } from "./attribute";
import { MySet } from "../utils/collections";
import { DocumentStateContext } from "../utils/documentUtil";
import { getComponent } from "../features/cachedEntities";
import { isCfcFile } from "../utils/contextUtil";

const findConfig = require("find-config");

export const COMPONENT_EXT: string = ".cfc";
export const COMPONENT_FILE_GLOB: string = "**/*" + COMPONENT_EXT;

export const COMPONENT_PATTERN: RegExp = /((\/\*\*((?:\*(?!\/)|[^*])*)\*\/\s+)?(<cf)?(component|interface)\b)([^>{]*)/i;

export const componentDottedPathPrefix: RegExp = /\b(import|new)\s+(['"])?([^('"]*?)$/i;

export const objectNewInstanceInitPrefix: RegExp = /\bnew\s+(['"])?([^('"]+?)\1\($/i;

export interface ReferencePattern {
  pattern: RegExp;
  refIndex: number;
}

export const objectReferencePatterns: ReferencePattern[] = [
  // new object
  {
    pattern: /\bnew\s+(['"])?([^('"]+?)\1\(/gi,
    refIndex: 2
  },
  // createObject
  {
    pattern: /\bcreateObject\s*\(\s*(['"])component\1\s*,\s*(['"])([^'"]+?)\2/gi,
    refIndex: 3
  },
  // cfobject or cfinvoke
  {
    pattern: /\bcomponent\s*(?:=|:)\s*(['"])([^'"]+?)\1/gi,
    refIndex: 2
  },
  // isInstanceOf
  {
    pattern: /\bisInstanceOf\s*\(\s*[\w$.]+\s*,\s*(['"])([^'"]+?)\1/gi,
    refIndex: 2
  },
];
// TODO: variableReferencePatterns

const componentAttributeNames: MySet<string> = new MySet([
  "accessors",
  "alias",
  "autoindex",
  "bindingname",
  "consumes",
  "displayname",
  "extends",
  "hint",
  "httpmethod",
  "implements",
  "indexable",
  "indexlanguage",
  "initmethod",
  "mappedsuperclass",
  "namespace",
  "output",
  "persistent",
  "porttypename",
  "produces",
  "rest",
  "restPath",
  "serializable",
  "serviceaddress",
  "serviceportname",
  "style",
  "wsdlfile",
  "wsVersion"
]);
const booleanAttributes: MySet<string> = new MySet([
  "accessors",
  "autoindex",
  "indexable",
  "mappedsuperclass",
  "output",
  "persistent",
  "rest",
  "serializable"
]);

export interface Component {
  uri: Uri;
  name: string;
  isScript: boolean;
  isInterface: boolean; // should be a separate type, but chose this for the purpose of simplification
  declarationRange: Range;
  displayname: string;
  hint: string;
  accessors: boolean;
  initmethod?: string;
  extends?: Uri;
  extendsRange?: Range;
  implements?: Uri[];
  implementsRange?: Range;
  functions: ComponentFunctions;
  properties: Properties;
  variables: Variable[];
}

interface ComponentAttributes {
  accessors?: boolean;
  alias?: string;
  autoindex?: boolean;
  bindingname?: string;
  consumes?: string;
  displayname?: string;
  extends?: string;
  hint?: string;
  httpmethod?: string;
  implements?: string;
  indexable?: boolean;
  indexlanguage?: string;
  initmethod?: string;
  mappedsuperclass?: boolean;
  namespace?: string;
  output?: boolean;
  persistent?: boolean;
  porttypename?: string;
  produces?: string;
  rest?: boolean;
  restPath?: string;
  serializable?: boolean;
  serviceaddress?: string;
  serviceportname?: string;
  style?: string;
  wsdlfile?: string;
  wsVersion?: string;
}
export interface ComponentsByUri {
  [uri: string]: Component; // key is Uri.toString()
}
export interface ComponentsByName {
  [name: string]: ComponentsByUri; // key is Component name lowercased
}

export function isScriptComponent(document: TextDocument): boolean {
  const component: Component = getComponent(document.uri);
  if (component) {
    return component.isScript;
  }

  const componentMatch: RegExpExecArray = COMPONENT_PATTERN.exec(document.getText());
  if (!componentMatch) {
    return false;
  }
  const checkTag: string = componentMatch[4];

  return isCfcFile(document) && !checkTag;
}

/**
 * Parses a component document and returns an object conforming to the Component interface
 * @param documentStateContext The content information for a TextDocument to be parsed
 */
export function parseComponent(documentStateContext: DocumentStateContext): Component | undefined {
  const document: TextDocument = documentStateContext.document;
  const documentText: string = document.getText();
  const componentMatch: RegExpExecArray = COMPONENT_PATTERN.exec(documentText);

  if (!componentMatch) {
    return undefined;
  }

  const head: string = componentMatch[0];
  const attributePrefix: string = componentMatch[1];
  const fullPrefix: string = componentMatch[2];
  const componentDoc: string = componentMatch[3];
  const checkTag: string = componentMatch[4];
  const componentType: string = componentMatch[5];
  const componentAttr: string = componentMatch[6];

  const componentIsScript: boolean = !checkTag;

  let declarationStartOffset: number = componentMatch.index;
  if (fullPrefix) {
    declarationStartOffset += fullPrefix.length;
  }
  if (checkTag) {
    declarationStartOffset += checkTag.length;
  }

  let componentAttributes: ComponentAttributes = {};
  let component: Component = {
    uri: document.uri,
    name: path.basename(document.fileName, COMPONENT_EXT),
    isScript: componentIsScript,
    isInterface: componentType === "interface",
    declarationRange: new Range(document.positionAt(declarationStartOffset), document.positionAt(declarationStartOffset + componentType.length)),
    displayname: "",
    hint: "",
    extends: null,
    implements: null,
    accessors: false,
    functions: new ComponentFunctions(),
    properties: parseProperties(document),
    variables: []
  };

  if (componentDoc) {
    const parsedDocBlock: DocBlockKeyValue[] = parseDocBlock(
      document,
      new Range(
        document.positionAt(componentMatch.index + 3),
        document.positionAt(componentMatch.index + 3 + componentDoc.length)
      )
    );
    const docBlockAttributes: ComponentAttributes = processDocBlock(parsedDocBlock);
    Object.assign(componentAttributes, docBlockAttributes);

    parsedDocBlock.filter((docAttribute: DocBlockKeyValue) => {
      return docAttribute.key === "extends";
    }).forEach((docAttr: DocBlockKeyValue) => {
      const extendsName: string = getComponentNameFromDotPath(docAttr.value);
      component.extendsRange = new Range(
        docAttr.valueRange.start.translate(0, docAttr.value.length - extendsName.length),
        docAttr.valueRange.end
      );
    });
  }

  if (componentAttr) {
    const componentAttributePrefixOffset: number = componentMatch.index + attributePrefix.length;
    const componentAttributeRange = new Range(
      document.positionAt(componentAttributePrefixOffset),
      document.positionAt(componentAttributePrefixOffset + componentAttr.length)
    );

    const parsedAttributes: Attributes = parseAttributes(document, componentAttributeRange, componentAttributeNames);

    const tagAttributes: ComponentAttributes = processAttributes(parsedAttributes);
    Object.assign(componentAttributes, tagAttributes);

    if (parsedAttributes.has("extends")) {
      const extendsAttr: Attribute = parsedAttributes.get("extends");
      const extendsName: string = getComponentNameFromDotPath(extendsAttr.value);
      component.extendsRange = new Range(
        extendsAttr.valueRange.start.translate(0, extendsAttr.value.length - extendsName.length),
        extendsAttr.valueRange.end
      );
    }
  }

  Object.getOwnPropertyNames(component).forEach((propName: string) => {
    if (componentAttributes[propName]) {
      if (propName === "extends") {
        component.extends = componentPathToUri(componentAttributes.extends, document.uri);
      } else if (propName === "implements") {
        componentAttributes.implements.split(",").forEach((element: string) => {
          const implementsUri: Uri = componentPathToUri(element.trim(), document.uri);
          if (implementsUri) {
            if (!component.implements) {
              component.implements = [];
            }
            component.implements.push(implementsUri);
          }
        });
      } else if (propName === "persistent" && componentAttributes.persistent) {
        component.accessors = true;
      } else {
        component[propName] = componentAttributes[propName];
      }
    }
  });

  let componentFunctions = new ComponentFunctions();
  let userFunctions: UserFunction[] = parseScriptFunctions(documentStateContext);
  userFunctions = userFunctions.concat(parseTagFunctions(documentStateContext));
  let earliestFunctionRangeStart: Position = document.positionAt(documentText.length);
  userFunctions.forEach((compFun: UserFunction) => {
    if (compFun.location.range.start.isBefore(earliestFunctionRangeStart)) {
      earliestFunctionRangeStart = compFun.location.range.start;
    }
    componentFunctions.set(compFun.name.toLowerCase(), compFun);
  });

  component.functions = componentFunctions;

  // TODO: ImplicitFunctions

  const componentDefinitionRange = new Range(document.positionAt(head.length), earliestFunctionRangeStart);
  documentStateContext.component = component;
  component.variables = parseVariableAssignments(documentStateContext, componentIsScript, componentDefinitionRange);

  return component;
}

/**
 * Parses a documentation block for a component and returns an object conforming to the ComponentAttributes interface
 * @param docBlock The documentation block to be processed
 */
function processDocBlock(docBlock: DocBlockKeyValue[]): ComponentAttributes {
  let docBlockObj: ComponentAttributes = {};
  docBlock.forEach((docElem: DocBlockKeyValue) => {
    const activeKey = docElem.key;
    if (booleanAttributes.has(activeKey)) {
      docBlockObj[activeKey] = DataType.isTruthy(docElem.value);
    } else {
      docBlockObj[activeKey] = docElem.value;
    }
  });

  return docBlockObj;
}

/**
 * Processes a set of attributes for a component and returns an object conforming to the ComponentAttributes interface
 * @param attributes A set of attributes
 */
function processAttributes(attributes: Attributes): ComponentAttributes {
  let attributeObj: ComponentAttributes = {};

  attributes.forEach((attr: Attribute, attrKey: string) => {
    if (booleanAttributes.has(attrKey)) {
      attributeObj[attrKey] = DataType.isTruthy(attr.value);
    } else {
      attributeObj[attrKey] = attr.value;
    }
  });

  return attributeObj;
}

/**
 * Resolves a component in dot-path notation to a URI
 * @param dotPath A string for a component in dot-path notation
 * @param baseUri The URI from which the component path will be resolved
 */
export function componentPathToUri(dotPath: string, baseUri: Uri): Uri {
  const cachedResult: Uri = cachedEntities.componentPathToUri(dotPath, baseUri);
  if (cachedResult) {
    return cachedResult;
  }

  const normalizedPath: string = dotPath.replace(/\./g, path.sep) + COMPONENT_EXT;

  // relative to local directory
  const baseDir: string = path.dirname(baseUri.fsPath);
  const localPath: string = path.join(baseDir, normalizedPath);
  if (fs.existsSync(localPath)) {
    return Uri.file(localPath);
  }

  // relative to web root
  const root: WorkspaceFolder = workspace.getWorkspaceFolder(baseUri);
  const rootPath: string = path.join(root.uri.fsPath, normalizedPath);
  if (fs.existsSync(rootPath)) {
    return Uri.file(rootPath);
  }

  // TODO: custom mappings

  return undefined;
}

/**
 * Returns just the name part for a component dot path
 * @param path Dot path to a component
 */
export function getComponentNameFromDotPath(path: string): string {
  return path.split(".").pop();
}

/**
 * Finds the applicable Application file for the given file URI
 * @param baseUri The URI from which the Application file will be searched
 */
export function getApplicationUri(baseUri: Uri): Uri | undefined {
  let componentUri: Uri;

  const fileNames = ["Application.cfc", "Application.cfm"];
  fileNames.forEach((fileName: string) => {
    const currentWorkingDir: string = path.dirname(baseUri.fsPath);
    const applicationFile: string = findConfig(fileName, { cwd: currentWorkingDir });
    if (applicationFile) {
      componentUri = Uri.file(applicationFile);
      return;
    }
  });

  return componentUri;
}