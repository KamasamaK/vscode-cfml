import { Uri, workspace, TextDocument, WorkspaceFolder, WorkspaceConfiguration, ConfigurationTarget, extensions } from "vscode";
import { DataType } from "../entities/dataType";
import { GlobalFunctions, GlobalTags, MemberFunctionsByType, GlobalFunction, GlobalTag, MemberFunction } from "../entities/globals";
import { UserFunction, UserFunctionsByName, ComponentFunctions, UserFunctionByUri } from "../entities/userFunction";
import { Component, ComponentsByUri, ComponentsByName, COMPONENT_EXT, COMPONENT_FILE_GLOB, parseComponent } from "../entities/component";
import * as path from "path";
import * as fs from "fs";
import { MyMap } from "../utils/collections";

const trie = require("trie-prefix-tree");

let allGlobalFunctions: GlobalFunctions = {};
let allGlobalTags: GlobalTags = {};
let allMemberFunctions: MemberFunctionsByType = new MyMap<DataType, Set<MemberFunction>>();

let allComponentsByUri: ComponentsByUri = {};
let allComponentsByName: ComponentsByName = {};

// let allUserFunctionsByUri: UserFunctionsByUri = {};
let allUserFunctionsByName: UserFunctionsByName = {};

let allComponentNames = trie([]);
let allFunctionNames = trie([]);

/**
 * Checks whether the given identifier is a cached global function
 * @param name The identifier to check
 */
export function isGlobalFunction(name: string): boolean {
  if (allGlobalFunctions[name.toLowerCase()]) {
    return true;
  }

  return false;
}

/**
 * Checks whether the given identifier is a cached global tag
 * @param name The identifier to check
 */
export function isGlobalTag(name: string): boolean {
  if (allGlobalTags[name.toLowerCase()]) {
    return true;
  }

  return false;
}

/**
 * Sets the given global function object into cache
 * @param functionDefinition The global function object to cache
 */
export function setGlobalFunction(functionDefinition: GlobalFunction): void {
  allGlobalFunctions[functionDefinition.name.toLowerCase()] = functionDefinition;
}

/**
 * Retrieves the cached global function identified by the given function name
 * @param functionName The name of the global function to be retrieved
 */
export function getGlobalFunction(functionName: string): GlobalFunction {
  return allGlobalFunctions[functionName.toLowerCase()];
}

/**
 * Returns all of the cached global functions
 */
export function getAllGlobalFunctions(): GlobalFunctions {
  return allGlobalFunctions;
}

/**
 * Sets the given global tag object into cache
 * @param tagDefinition The global tag object to cache
 */
export function setGlobalTag(tagDefinition: GlobalTag): void {
  allGlobalTags[tagDefinition.name.toLowerCase()] = tagDefinition;
}

/**
 * Retrieves the cached global tag identified by the given tag name
 * @param tagName The name of the global tag to be retrieved
 */
export function getGlobalTag(tagName: string): GlobalTag {
  return allGlobalTags[tagName.toLowerCase()];
}

/**
 * Returns all of the cached global tags
 */
export function getAllGlobalTags(): GlobalTags {
  return allGlobalTags;
}

/**
 * Sets the given component object into cache
 * @param comp The component to cache
 */
export function setComponent(comp: Component): void {
  allComponentsByUri[comp.uri.toString()] = comp;
  const componentKey: string = path.basename(comp.uri.fsPath, COMPONENT_EXT).toLowerCase();
  if (!allComponentsByName[componentKey]) {
    allComponentsByName[componentKey] = {};
  }
  allComponentsByName[componentKey][comp.uri.toString()] = comp;

  allComponentNames.addWord(componentKey);
}

/**
 * Retrieves the cached component identified by the given URI
 * @param uri The URI of the component to be retrieved
 */
export function getComponent(uri: Uri): Component {
  return allComponentsByUri[uri.toString()];
}

/**
 * Retrieves all cached components matched by the given query
 * @param query Some query text used to search for cached components
 */
export function searchAllComponentNames(query: string): Component[] {
  let components: Component[] = [];
  allComponentNames.getPrefix(query.toLowerCase()).forEach((compKey: string) => {
    components = components.concat(Object.values(allComponentsByName[compKey]));
  });
  return components;
}

/**
 * Sets the given user function object into cache
 * @param userFunction The user function to cache
 */
export function setUserFunction(userFunction: UserFunction): void {
  const functionKey: string = userFunction.name.toLowerCase();

  if (!allUserFunctionsByName[functionKey]) {
    allUserFunctionsByName[functionKey] = {};
  }
  allUserFunctionsByName[functionKey][userFunction.location.uri.toString()] = userFunction;

  allFunctionNames.addWord(functionKey);
}

/**
 * Retrieves all cached user functions matched by the given query
 * @param query Some query text used to search for cached user functions
 */
export function searchAllFunctionNames(query: string): UserFunction[] {
  let functions: UserFunction[] = [];
  // let usedFunctionNames = new MySet<string>();
  allFunctionNames.getPrefix(query.toLowerCase()).forEach((funcKey: string) => {
    functions = functions.concat(Object.values(allUserFunctionsByName[funcKey]));
    // usedFunctionNames.add(funcKey);
  });
  // TODO: Also check for arbitrary substrings

  return functions;
}

/**
 * Resolves a component in dot-path notation to a URI
 * @param dotPath A string for a component in dot-path notation
 * @param baseUri The URI from which the component path will be resolved
 */
export function componentPathToUri(dotPath: string, baseUri: Uri): Uri {
  const normalizedPath: string = dotPath.replace(/\./g, path.sep) + COMPONENT_EXT;

  // relative to local directory
  const baseDir: string = path.dirname(baseUri.fsPath);
  const localPath: string = path.join(baseDir, normalizedPath);
  const localFile: Uri = Uri.file(localPath);
  if (allComponentsByUri[localFile.toString()]) {
    return localFile;
  }

  // relative to web root
  const root: WorkspaceFolder = workspace.getWorkspaceFolder(baseUri);
  const rootPath: string = path.join(root.uri.fsPath, normalizedPath);
  const rootFile: Uri = Uri.file(rootPath);
  if (allComponentsByUri[rootFile.toString()]) {
    return rootFile;
  }

  // TODO: custom mappings

  return undefined;
}

/**
 * Caches given component and its contents
 * @param component The component to cache
 */
export function cacheComponent(component: Component): void {
  setComponent(component);
  component.functions.forEach((funcObj: UserFunction) => {
    setUserFunction(funcObj);
  });
}

/**
 * Reads and parses all cfc files in the current workspace and caches their definitions
 */
export function cacheAllComponents(): void {
  clearAllCachedComponents();

  workspace.findFiles(COMPONENT_FILE_GLOB).then((componentUris: Uri[]) => {
    // TODO: Revisit when https://github.com/Microsoft/vscode/issues/15178 is addressed
    const cflintExt = extensions.getExtension("KamasamaK.vscode-cflint");
    if (cflintExt) {
      const cflintSettings: WorkspaceConfiguration = workspace.getConfiguration("cflint");
      const cflintEnabledValues = cflintSettings.inspect<boolean>("enabled");
      const cflintEnabledPrevWSValue: boolean = cflintEnabledValues.workspaceValue;
      cflintSettings.update("enabled", false, ConfigurationTarget.Workspace).then(() => {
        cacheGivenComponents(componentUris);
        cflintSettings.update("enabled", cflintEnabledPrevWSValue, ConfigurationTarget.Workspace);
      });
    } else {
      cacheGivenComponents(componentUris);
    }
  },
  (reason) => {
    console.error(reason);
  });
}

/**
 * Reads and parses given cfc files and caches their definitions
 */
function cacheGivenComponents(componentUris: Uri[]): void {
  componentUris.forEach((componentUri: Uri) => {
    workspace.openTextDocument(componentUri).then((document: TextDocument) => {
      const parsedComponent = parseComponent(document);
      if (parsedComponent) {
        cacheComponent(parsedComponent);
      }
      if (path.basename(componentUri.fsPath) === "Application.cfc") {
        // TODO: Perform Application-specific tasks
      }
    });
  });
}

/**
 * Removes all cached references to the given component
 * @param componentUri The URI of the component to be removed from cache
 */
export function clearCachedComponent(componentUri: Uri): void {
  const componentByUri: Component = allComponentsByUri[componentUri.toString()];
  if (componentByUri) {
    delete allComponentsByUri[componentUri.toString()];
  }

  const componentKey: string = path.basename(componentUri.fsPath, COMPONENT_EXT).toLowerCase();
  const componentsByName: ComponentsByUri = allComponentsByName[componentKey];
  if (componentsByName) {
    const componentsByNameLen: number = Object.keys(componentsByName).length;
    if (componentsByName[componentUri.toString()]) {
      const prevCompFunctions: ComponentFunctions = componentsByName[componentUri.toString()].functions;
      if (componentsByNameLen === 1) {
        delete allComponentsByName[componentKey];
        allComponentNames.removeWord(componentKey);
      } else {
        delete componentsByName[componentUri.toString()];
      }

      if (prevCompFunctions) {
        for (let funcName of prevCompFunctions.keys()) {
          const userFunctions: UserFunctionByUri = allUserFunctionsByName[funcName];
          if (userFunctions) {
            const userFunctionsLen: number = Object.keys(userFunctions).length;

            if (userFunctions[componentUri.toString()]) {
              if (userFunctionsLen === 1) {
                delete allUserFunctionsByName[funcName];
                allFunctionNames.removeWord(funcName);
              } else {
                delete userFunctions[componentUri.toString()];
              }
            }
          }
        }
      }
    }
  }
}

/**
 * Clears all cached references to components and their contents
 */
export function clearAllCachedComponents(): void {
  allComponentsByUri = {};
  allComponentsByName = {};
  allComponentNames = trie([]);

  allUserFunctionsByName = {};
  allFunctionNames = trie([]);
}
