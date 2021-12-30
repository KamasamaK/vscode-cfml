import * as path from "path";
import { ConfigurationTarget, extensions, ProgressLocation, TextDocument, Uri, window, workspace, WorkspaceConfiguration } from "vscode";
import { Component, ComponentsByName, ComponentsByUri, COMPONENT_EXT, COMPONENT_FILE_GLOB, parseComponent } from "../entities/component";
import { GlobalFunction, GlobalFunctions, GlobalTag, GlobalTags } from "../entities/globals";
import { Scope } from "../entities/scope";
import { ComponentFunctions, UserFunction, UserFunctionByUri, UserFunctionsByName } from "../entities/userFunction";
import { parseVariableAssignments, Variable, VariablesByUri } from "../entities/variable";
import { CFDocsDefinitionInfo } from "../utils/cfdocs/definitionInfo";
import { MyMap, SearchMode } from "../utils/collections";
import { APPLICATION_CFM_GLOB } from "../utils/contextUtil";
import { DocumentStateContext, getDocumentStateContext } from "../utils/documentUtil";
import { resolveCustomMappingPaths, resolveRelativePath, resolveRootPath } from "../utils/fileUtil";
import trie from "trie-prefix-tree";

let allGlobalEntityDefinitions = new MyMap<string, CFDocsDefinitionInfo>();

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
  return allGlobalFunctions.hasOwnProperty(name.toLowerCase());
}

/**
 * Checks whether the given identifier is a cached global tag
 * @param name The identifier to check
 */
export function isGlobalTag(name: string): boolean {
  return allGlobalTags.hasOwnProperty(name.toLowerCase());
}

/**
 * Checks whether the given identifier is a cached global entity
 * @param name The identifier to check
 */
export function isGlobalEntity(name: string): boolean {
  return allGlobalTags.hasOwnProperty(name.toLowerCase()) || allGlobalFunctions.hasOwnProperty(name.toLowerCase());
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
 * Clears all of the cached global functions
 */
export function clearAllGlobalFunctions(): void {
  allGlobalFunctions = {};
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
 * Clears all of the cached global tags
 */
export function clearAllGlobalTags(): void {
  allGlobalTags = {};
}

/**
 * Sets the given global definition object into cache
 * @param definition The global definition object to cache
 */
export function setGlobalEntityDefinition(definition: CFDocsDefinitionInfo): void {
  allGlobalEntityDefinitions.set(definition.name.toLowerCase(), definition);
}

/**
 * Retrieves the cached global tag identified by the given tag name
 * @param name The name of the global definition to be retrieved
 */
export function getGlobalEntityDefinition(name: string): CFDocsDefinitionInfo {
  return allGlobalEntityDefinitions.get(name.toLowerCase());
}

/**
 * Returns all of the cached global entity definitions
 */
export function getAllGlobalEntityDefinitions(): MyMap<string, CFDocsDefinitionInfo> {
  return allGlobalEntityDefinitions;
}

/**
 * Clears all of the cached global entity definitions
 */
export function clearAllGlobalEntityDefinitions(): void {
  allGlobalEntityDefinitions = new MyMap<string, CFDocsDefinitionInfo>();
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

  try {
    allComponentNames.addWord(componentKey);
  } catch (ex) {
    console.error(ex);
    console.error(`Unable to add ${componentKey} to trie`);
  }
}

/**
 * Retrieves the cached component identified by the given URI
 * @param uri The URI of the component to be retrieved
 */
export function getComponent(uri: Uri): Component {
  if (!hasComponent(uri)) {
    /* TODO: If not already cached, attempt to read, parse and cache. Tricky since read is async */
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

  try {
    allFunctionNames.addWord(functionKey);
  } catch (ex) {
    console.error(ex);
    console.error(`Unable to add ${functionKey} to trie`);
  }
}

/**
 * Retrieves all cached user functions matched by the given query
 * @param query Some query text used to search for cached user functions
 * @param searchMode How the query will be searched for
 */
export function searchAllFunctionNames(query: string, searchMode: SearchMode = SearchMode.StartsWith): UserFunction[] {
  let functions: UserFunction[] = [];
  const lowerQuery = query.toLowerCase();

  if (searchMode === SearchMode.StartsWith) {
    allFunctionNames.getPrefix(lowerQuery).forEach((funcKey: string) => {
      functions = functions.concat(Object.values(allUserFunctionsByName[funcKey]));
    });
  } else if (searchMode === SearchMode.Contains) {
    for (const name in allUserFunctionsByName) {
      if (name.includes(lowerQuery)) {
        functions = functions.concat(Object.values(allUserFunctionsByName[name]));
      }
    }
  } else if (searchMode === SearchMode.EqualTo) {
    if (allUserFunctionsByName.hasOwnProperty(lowerQuery)) {
      functions = Object.values(allUserFunctionsByName[lowerQuery]);
    }
  }

  return functions;
}

/**
 * Resolves a component in dot-path notation to a URI
 * @param dotPath A string for a component in dot-path notation
 * @param baseUri The URI from which the component path will be resolved
 */
export function componentPathToUri(dotPath: string, baseUri: Uri): Uri | undefined {
  if (!dotPath) {
    return undefined;
  }

  const normalizedPath: string = dotPath.replace(/\./g, path.sep) + COMPONENT_EXT;

  // relative to local directory
  const localPath: string = resolveRelativePath(baseUri, normalizedPath);
  const localFile: Uri = Uri.file(localPath);
  if (allComponentsByUri[localFile.toString()]) {
    return localFile;
  }

  // relative to web root
  const rootPath: string = resolveRootPath(baseUri, normalizedPath);
  if (rootPath) {
    const rootFile: Uri = Uri.file(rootPath);
    if (allComponentsByUri[rootFile.toString()]) {
      return rootFile;
    }
  }

  // custom mappings
  const customMappingPaths: string[] = resolveCustomMappingPaths(baseUri, normalizedPath);
  for (const mappedPath of customMappingPaths) {
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
  const fileName: string = path.basename(componentUri.fsPath);
  if (fileName === "Application.cfc") {
    const thisApplicationVariables: Variable[] = parseVariableAssignments(documentStateContext, documentStateContext.docIsScript);

    const thisApplicationFilteredVariables: Variable[] = thisApplicationVariables.filter((variable: Variable) => {
      return [Scope.Application, Scope.Session, Scope.Request].includes(variable.scope);
    });
    setApplicationVariables(componentUri, thisApplicationFilteredVariables);
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

  return workspace.findFiles(COMPONENT_FILE_GLOB).then(
    async (componentUris: Uri[]) => {
      // TODO: Remove cflint setting update for workspace state when CFLint checks it. Remove workspace state when CFLint can get list of open editors.
      const cflintExt = extensions.getExtension("KamasamaK.vscode-cflint");
      if (cflintExt) {
        const cflintSettings: WorkspaceConfiguration = workspace.getConfiguration("cflint", null);
        const runModes: {} = cflintSettings.get<{}>("runModes");
        if (runModes && runModes.hasOwnProperty("onOpen") && runModes["onOpen"]) {
          const cflintEnabledValues = cflintSettings.inspect<boolean>("enabled");
          const cflintEnabledPrevWSValue: boolean = cflintEnabledValues.workspaceValue;
          cflintSettings.update("enabled", false, ConfigurationTarget.Workspace).then(async () => {
            await cacheGivenComponents(componentUris);
            await cacheAllApplicationCfms();
            cflintSettings.update("enabled", cflintEnabledPrevWSValue, ConfigurationTarget.Workspace);
          });
        } else {
          cacheGivenComponents(componentUris);
          cacheAllApplicationCfms();
        }
      } else {
        cacheGivenComponents(componentUris);
        cacheAllApplicationCfms();
      }
    },
    (reason) => {
      console.error(reason);
    }
  );
}

/**
 * Reads and parses given cfc files and caches their definitions
 * @param componentUris List of URIs to read, parse, and cache
 */
async function cacheGivenComponents(componentUris: Uri[]): Promise<void> {
  await window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: "Caching components",
      cancellable: true
    },
    async (progress, token) => {
      const componentCount = componentUris.length;
      let i = 0;

      for (const componentUri of componentUris) {
        if (token.isCancellationRequested) { break; }

        try {
          const document: TextDocument = await workspace.openTextDocument(componentUri);
          cacheComponentFromDocument(document, true);
        } catch (ex) {
          console.error(`Cannot parse document at ${componentUri}`);
        } finally {
          i++;
          progress.report({
            message: `${i} / ${componentCount}`,
            increment: (100 / componentCount)
          });
        }
      }
    }
  );
}

/**
 * Parses given document and caches its definitions
 * @param document The text document to parse and cache
 * @param fast Whether to use the faster, but less accurate parsing
 */
export function cacheComponentFromDocument(document: TextDocument, fast: boolean = false): boolean {
  const documentStateContext: DocumentStateContext = getDocumentStateContext(document, fast);
  const parsedComponent: Component | undefined = parseComponent(documentStateContext);
  if (!parsedComponent) {
    return false;
  }

  cacheComponent(parsedComponent, documentStateContext);

  return true;
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
        for (const funcName of prevCompFunctions.keys()) {
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
 * Reads and parses all Application.cfm files in the current workspace and caches their definitions
 */
export async function cacheAllApplicationCfms(): Promise<void> {
  return workspace.findFiles(APPLICATION_CFM_GLOB).then(
    cacheGivenApplicationCfms,
    (reason) => {
      console.error(reason);
    }
  );
}

/**
 * Reads and parses given Application.cfm files and caches their definitions
 * @param applicationUris List of URIs to parse and cache
 */
async function cacheGivenApplicationCfms(applicationUris: Uri[]): Promise<void> {
  applicationUris.forEach(async (applicationUri: Uri) => {
    try {
      const document: TextDocument = await workspace.openTextDocument(applicationUri);
      const documentStateContext: DocumentStateContext = getDocumentStateContext(document);
      const thisApplicationVariables: Variable[] = parseVariableAssignments(documentStateContext, documentStateContext.docIsScript);
      const thisApplicationFilteredVariables: Variable[] = thisApplicationVariables.filter((variable: Variable) => {
        return [Scope.Application, Scope.Session, Scope.Request].includes(variable.scope);
      });
      setApplicationVariables(applicationUri, thisApplicationFilteredVariables);
    } catch (ex) {
      console.error(`Cannot parse document at ${applicationUri}`);
    }
  });
}

/**
 * Retrieves the cached application variables identified by the given URI
 * @param uri The URI of the application file
 */
export function getApplicationVariables(uri: Uri): Variable[] {
  return allApplicationVariables.get(uri.toString());
}

/**
 * Sets the cached application variables for the given URI
 * @param uri The URI of the application file
 * @param applicationVariables The application variables to set
 */
export function setApplicationVariables(uri: Uri, applicationVariables: Variable[]): void {
  allApplicationVariables.set(uri.toString(), applicationVariables);
}

/**
 * Removes the cached application variables identified by the given URI
 * @param uri The URI of the application file to remove
 */
export function removeApplicationVariables(uri: Uri): boolean {
  return allApplicationVariables.delete(uri.toString());
}

/**
 * Retrieves the cached server variables identified by the given URI
 * @param uri The URI of the component to be check
 */
export function getServerVariables(uri: Uri): Variable[] {
  return allServerVariables.get(uri.toString());
}
