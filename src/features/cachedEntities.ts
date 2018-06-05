import * as path from "path";
import { ConfigurationTarget, TextDocument, Uri, WorkspaceConfiguration, extensions, workspace } from "vscode";
import { COMPONENT_EXT, COMPONENT_FILE_GLOB, Component, ComponentsByName, ComponentsByUri, parseComponent } from "../entities/component";
import { GlobalFunction, GlobalFunctions, GlobalTag, GlobalTags } from "../entities/globals";
import { Scope } from "../entities/scope";
import { ComponentFunctions, UserFunction, UserFunctionByUri, UserFunctionsByName } from "../entities/userFunction";
import { Variable, VariablesByUri, parseVariableAssignments } from "../entities/variable";
import { DocumentStateContext, getDocumentStateContext } from "../utils/documentUtil";
import { resolveCustomMappingPaths, resolveRelativePath, resolveRootPath } from "../utils/fileUtil";

const trie = require("trie-prefix-tree");


let allGlobalFunctions: GlobalFunctions = {};
let allGlobalTags: GlobalTags = {};
// let allMemberFunctions: MemberFunctionsByType = new MyMap<DataType, Set<MemberFunction>>();

let allComponentsByUri: ComponentsByUri = {};
let allComponentsByName: ComponentsByName = {};

// let allUserFunctionsByUri: UserFunctionsByUri = {};
let allUserFunctionsByName: UserFunctionsByName = {};

let allComponentNames = trie([]);
let allFunctionNames = trie([]);

let allServerVariables: VariablesByUri = new VariablesByUri();
let allApplicationVariables: VariablesByUri = new VariablesByUri();

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
function setComponent(comp: Component): void {
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
  if (!hasComponent(uri)) {
    /* TODO: If not already cached, attempt to parse and cache
    cacheGivenComponents([uri]);
    */
  }

  return allComponentsByUri[uri.toString()];
}

/**
 * Checks if the cached component with the given URI exists
 * @param uri The URI of the component to be checked
 */
export function hasComponent(uri: Uri): boolean {
  return allComponentsByUri.hasOwnProperty(uri.toString());
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
function setUserFunction(userFunction: UserFunction): void {
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
export function componentPathToUri(dotPath: string, baseUri: Uri): Uri | undefined {
  const normalizedPath: string = dotPath.replace(/\./g, path.sep) + COMPONENT_EXT;

  // relative to local directory
  const localPath: string = resolveRelativePath(baseUri, normalizedPath);
  const localFile: Uri = Uri.file(localPath);
  if (allComponentsByUri[localFile.toString()]) {
    return localFile;
  }

  // relative to web root
  const rootPath: string = resolveRootPath(baseUri, normalizedPath);
  const rootFile: Uri = Uri.file(rootPath);
  if (allComponentsByUri[rootFile.toString()]) {
    return rootFile;
  }

  // custom mappings
  const customMappingPaths: string[] = resolveCustomMappingPaths(baseUri, normalizedPath);
  for (let mappedPath of customMappingPaths) {
    const mappedFile: Uri = Uri.file(mappedPath);
    if (allComponentsByUri[mappedFile.toString()]) {
      return mappedFile;
    }
  }

  return undefined;
}

/**
 * Caches given component and its contents
 * @param component The component to cache
 * @param documentStateContext Contextual information for a given document's state
 */
export function cacheComponent(component: Component, documentStateContext: DocumentStateContext): void {
  clearCachedComponent(component.uri);
  setComponent(component);
  component.functions.forEach((funcObj: UserFunction) => {
    setUserFunction(funcObj);
  });

  const componentUri: Uri = component.uri;
  const fileName = path.basename(componentUri.fsPath);
  if (fileName === "Application.cfc") {
    const thisApplicationVariables: Variable[] = parseVariableAssignments(documentStateContext, documentStateContext.docIsScript);

    const thisApplicationFilteredVariables: Variable[] = thisApplicationVariables.filter((variable: Variable) => {
      return [Scope.Application, Scope.Session, Scope.Request].includes(variable.scope);
    });
    allApplicationVariables.set(componentUri.toString(), thisApplicationFilteredVariables);
  } else if (fileName === "Server.cfc") {
    const thisServerVariables: Variable[] = parseVariableAssignments(documentStateContext, documentStateContext.docIsScript).filter((variable: Variable) => {
      return variable.scope === Scope.Server;
    });
    allServerVariables.set(componentUri.toString(), thisServerVariables);
  }
}

/**
 * Reads and parses all cfc files in the current workspace and caches their definitions
 */
export async function cacheAllComponents(): Promise<void> {
  clearAllCachedComponents();

  workspace.findFiles(COMPONENT_FILE_GLOB).then((componentUris: Uri[]) => {
    // TODO: Revisit when https://github.com/Microsoft/vscode/issues/15178 is addressed
    const cflintExt = extensions.getExtension("KamasamaK.vscode-cflint");
    if (cflintExt) {
      const cflintSettings: WorkspaceConfiguration = workspace.getConfiguration("cflint");
      const cflintEnabledValues = cflintSettings.inspect<boolean>("enabled");
      const cflintEnabledPrevWSValue: boolean = cflintEnabledValues.workspaceValue;
      // const cflintRunModesValues = cflintSettings.inspect<{}>("runModes");
      // const cflintRunModesPrevWSValue = cflintRunModesValues.workspaceValue;
      cflintSettings.update("enabled", false, ConfigurationTarget.Workspace).then(async () => {
        await cacheGivenComponents(componentUris);
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
 * @param componentUris List of URIs to parse and cache
 */
async function cacheGivenComponents(componentUris: Uri[]): Promise<void> {
  componentUris.forEach((componentUri: Uri) => {
    // TODO: Consider displaying progress
    workspace.openTextDocument(componentUri).then((document: TextDocument) => {
      const documentStateContext: DocumentStateContext = getDocumentStateContext(document, true);
      const parsedComponent: Component = parseComponent(documentStateContext);
      if (parsedComponent) {
        cacheComponent(parsedComponent, documentStateContext);
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
function clearAllCachedComponents(): void {
  allComponentsByUri = {};
  allComponentsByName = {};
  allComponentNames = trie([]);

  allUserFunctionsByName = {};
  allFunctionNames = trie([]);
}

/**
 * Retrieves the cached application variables identified by the given URI
 * @param uri The URI of the component to be check
 */
export function getApplicationVariables(uri: Uri): Variable[] {
  return allApplicationVariables.get(uri.toString());
}

/**
 * Retrieves the cached server variables identified by the given URI
 * @param uri The URI of the component to be check
 */
export function getServerVariables(uri: Uri): Variable[] {
  return allServerVariables.get(uri.toString());
}
