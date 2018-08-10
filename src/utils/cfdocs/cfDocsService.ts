import * as fs from "fs";
import * as path from "path";
import * as request from "request";
import { commands, Position, Range, TextDocument, TextLine, Uri, window, workspace, WorkspaceConfiguration } from "vscode";
import { getFunctionSuffixPattern } from "../../entities/function";
import { GlobalEntity } from "../../entities/globals";
import { getTagPrefixPattern } from "../../entities/tag";
import * as cachedEntity from "../../features/cachedEntities";
import { DocumentPositionStateContext, getDocumentPositionStateContext } from "../documentUtil";
import { CFMLEngine, CFMLEngineName } from "./cfmlEngine";
import { CFDocsDefinitionInfo, EngineCompatibilityDetail } from "./definitionInfo";

const cfDocsRepoLinkPrefix: string = "https://raw.githubusercontent.com/foundeo/cfdocs/master/data/en/";
const cfDocsLinkPrefix: string = "https://cfdocs.org/";

// TODO: Replace content retrieval with API calls through @octokit/rest: https://octokit.github.io/rest.js/#api-Repos-getContent

export class CFDocsService {
  /**
   * Gets definition information for global identifiers based on CFDocs
   * @param identifier The global identifier for which to get definition info
   * @param callback An optional callback that takes the returned CFDocsDefinitionInfo
   */
  public static async getDefinitionInfo(identifier: string, callback?: (definition: CFDocsDefinitionInfo) => boolean): Promise<CFDocsDefinitionInfo> {
    const cfmlCfDocsSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml.cfDocs");
    let definitionInfo: Promise<CFDocsDefinitionInfo> = undefined;
    if (cfmlCfDocsSettings.get<string>("source") === "local") {
      definitionInfo = CFDocsService.getLocalDefinitionInfo(identifier, callback);
    } else {
      definitionInfo = CFDocsService.getRemoteDefinitionInfo(identifier, callback);
    }

    return definitionInfo;
  }

  /**
   * Gets definition information for global identifiers based on a local CFDocs directory
   * @param identifier The global identifier for which to get definition info
   * @param callback An optional callback that takes the returned CFDocsDefinitionInfo
   */
  private static async getLocalDefinitionInfo(identifier: string, callback?: (definition: CFDocsDefinitionInfo) => boolean): Promise<CFDocsDefinitionInfo> {
    const cfmlCfDocsSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml.cfDocs");
    const cfdocsPath: string = cfmlCfDocsSettings.get("localPath");
    let definitionInfo: CFDocsDefinitionInfo;

    return new Promise<CFDocsDefinitionInfo>((resolve, reject) => {
      try {
        const docFilePath: string = path.join(cfdocsPath, CFDocsService.getJsonFileName(identifier));
        fs.readFile(docFilePath, "utf8", (err, data) => {
          if (err) {
            reject(err);
          }
          definitionInfo = CFDocsService.constructDefinitionFromJsonDoc(data);
          if (callback) {
            callback(definitionInfo);
          }
          resolve(definitionInfo);
        });
      } catch (e) {
        console.error(`Error with the JSON doc for ${identifier}:`, (<Error>e).message);
        reject(e);
      }
    });
  }

  /**
   * Gets definition information for global identifiers based on a remote CFDocs repository
   * @param identifier The global identifier for which to get definition info
   * @param callback An optional callback that takes the returned CFDocsDefinitionInfo
   */
  private static async getRemoteDefinitionInfo(identifier: string, callback?: (definition: CFDocsDefinitionInfo) => boolean): Promise<CFDocsDefinitionInfo> {
    const cfDocsLink: string = cfDocsRepoLinkPrefix + CFDocsService.getJsonFileName(identifier);
    let definitionInfo: CFDocsDefinitionInfo;

    return new Promise<CFDocsDefinitionInfo>((resolve, reject) => {
      request(cfDocsLink, (error, response, body) => {
        if (error) {
          console.error(`Error with the request for ${identifier}:`, error);
          reject(error);
        } else {
          try {
            definitionInfo = CFDocsService.constructDefinitionFromJsonDoc(body);
            if (callback) {
              callback(definitionInfo);
            }
            resolve(definitionInfo);
          } catch (ex) {
            console.error(`Error with the JSON doc for ${identifier}:`, (<Error>ex).message);
            reject(ex);
          }
        }
      });
    });
  }

  /**
   * Constructs a CFDocsDefinitionInfo object from the respective JSON string
   * @param jsonTextDoc A JSON string conforming to the CFDocs definition structure
   */
  private static constructDefinitionFromJsonDoc(jsonTextDoc: string): CFDocsDefinitionInfo {
    const jsonDoc = JSON.parse(jsonTextDoc);

    return new CFDocsDefinitionInfo(
      jsonDoc.name, jsonDoc.type, jsonDoc.syntax, jsonDoc.member, jsonDoc.script, jsonDoc.returns,
      jsonDoc.related, jsonDoc.description, jsonDoc.discouraged, jsonDoc.params, jsonDoc.engines, jsonDoc.links, jsonDoc.examples
    );
  }

  /**
   * Generates the respective JSON file name from the global identifier
   * @param identifier The global identifier for which to the file name will be generated
   */
  private static getJsonFileName(identifier: string): string {
    return identifier.toLowerCase() + ".json";
  }

  /**
   * Returns a list of all global CFML functions documented on CFDocs
   */
  public static async getAllFunctionNames(): Promise<string[]> {
    const cfmlCfDocsSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml.cfDocs");
    const jsonFileName: string = CFDocsService.getJsonFileName("functions");

    return new Promise<string[]>((resolve, reject) => {
      if (cfmlCfDocsSettings.get<string>("source") === "local") {
        const cfdocsPath: string = cfmlCfDocsSettings.get("localPath");
        let docFilePath: string = path.join(cfdocsPath, jsonFileName);
        fs.readFile(docFilePath, "utf8", (err, data) => {
          if (err) {
            reject(err);
          }
          resolve(JSON.parse(data).related);
        });
      } else {
        const cfDocsLink: string = cfDocsRepoLinkPrefix + jsonFileName;

        request(cfDocsLink, (error, response, body) => {
          if (error) {
            console.error(`Error with the request for ${jsonFileName}:`, error);
            reject(error);
          } else {
            try {
              resolve(JSON.parse(body).related);
            } catch (ex) {
              console.error(`Error with the JSON doc for ${jsonFileName}:`, (<Error>ex).message);
              reject(ex);
            }
          }
        });
      }
    });
  }

  /**
   * Returns a list of all global CFML tags documented on CFDocs
   */
  public static async getAllTagNames(): Promise<string[]> {
    const cfmlCfDocsSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml.cfDocs");
    const jsonFileName: string = CFDocsService.getJsonFileName("tags");

    return new Promise<string[]>((resolve, reject) => {
      if (cfmlCfDocsSettings.get<string>("source") === "local") {
        const cfdocsPath: string = cfmlCfDocsSettings.get("localPath");
        let docFilePath: string = path.join(cfdocsPath, jsonFileName);
        fs.readFile(docFilePath, "utf8", (err, data) => {
          if (err) {
            reject(err);
          }
          resolve(JSON.parse(data).related);
        });
      } else {
        const cfDocsLink: string = cfDocsRepoLinkPrefix + jsonFileName;

        request(cfDocsLink, (error, response, body) => {
          if (error) {
            console.error(`Error with the request for ${jsonFileName}:`, error);
            reject(error);
          } else {
            try {
              resolve(JSON.parse(body).related);
            } catch (ex) {
              console.error(`Error with the JSON doc for ${jsonFileName}:`, (<Error>ex).message);
              reject(ex);
            }
          }
        });
      }
    });
  }

  /**
   * Sets the given definition as a global function in the cached entities
   * @param definition The definition object to cache
   */
  public static setGlobalFunction(definition: CFDocsDefinitionInfo): boolean {
    const cfmlEngineSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml.engine");
    const userEngineName: CFMLEngineName = CFMLEngineName.valueOf(cfmlEngineSettings.get<string>("name"));
    const userEngine: CFMLEngine = new CFMLEngine(userEngineName, cfmlEngineSettings.get<string>("version"));
    if (definition.type === "function" && definition.isCompatible(userEngine)) {
      cachedEntity.setGlobalFunction(definition.toGlobalFunction());
      // TODO: Add member function also
      cachedEntity.setGlobalEntityDefinition(definition);
      return true;
    }
    return false;
  }

  /**
   * Sets the given definition as a global tag in the cached entities
   * @param definition The definition object to cache
   */
  public static setGlobalTag(definition: CFDocsDefinitionInfo): boolean {
    const cfmlEngineSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml.engine");
    const userEngineName: CFMLEngineName = CFMLEngineName.valueOf(cfmlEngineSettings.get<string>("name"));
    const userEngine: CFMLEngine = new CFMLEngine(userEngineName, cfmlEngineSettings.get<string>("version"));
    if (definition.type === "tag" && definition.isCompatible(userEngine)) {
      cachedEntity.setGlobalTag(definition.toGlobalTag());
      cachedEntity.setGlobalEntityDefinition(definition);
      return true;
    }
    return false;
  }

  /**
   * Caches all documented tags and functions from CFDocs
   */
  public static async cacheAll(): Promise<boolean> {
    let allFunctionNames: string[] = await CFDocsService.getAllFunctionNames();
    allFunctionNames.forEach((functionName: string) => {
      CFDocsService.getDefinitionInfo(functionName, CFDocsService.setGlobalFunction);
    });

    let allTagNames: string[] = await CFDocsService.getAllTagNames();
    allTagNames.forEach((tagName: string) => {
      CFDocsService.getDefinitionInfo(tagName, CFDocsService.setGlobalTag);
    });

    return true;
  }
}

export async function openCfDocsForCurrentWord(): Promise<void> {
  if (!window.activeTextEditor) {
    return;
  }

  const document: TextDocument = window.activeTextEditor.document;
  const position: Position = window.activeTextEditor.selection.start;
  const documentPositionStateContext: DocumentPositionStateContext = getDocumentPositionStateContext(document, position);

  if (documentPositionStateContext.positionInComment) {
    return;
  }

  const docPrefix: string = documentPositionStateContext.docPrefix;
  const textLine: TextLine = document.lineAt(position);
  const wordRange: Range = documentPositionStateContext.wordRange;
  const lineSuffix: string = documentPositionStateContext.sanitizedDocumentText.slice(document.offsetAt(wordRange.end), document.offsetAt(textLine.range.end));
  const userEngine: CFMLEngine = documentPositionStateContext.userEngine;

  const currentWord: string = documentPositionStateContext.currentWord;

  let globalEntity: GlobalEntity;
  const tagPrefixPattern: RegExp = getTagPrefixPattern();
  const functionSuffixPattern: RegExp = getFunctionSuffixPattern();

  if ((tagPrefixPattern.test(docPrefix) || (userEngine.supportsScriptTags() && functionSuffixPattern.test(lineSuffix))) && cachedEntity.isGlobalTag(currentWord)) {
    globalEntity = cachedEntity.getGlobalTag(currentWord);
  } else if (!documentPositionStateContext.isContinuingExpression && functionSuffixPattern.test(lineSuffix) && cachedEntity.isGlobalFunction(currentWord)) {
    globalEntity = cachedEntity.getGlobalFunction(currentWord);
  }

  if (globalEntity) {
    commands.executeCommand("vscode.open", Uri.parse(cfDocsLinkPrefix + globalEntity.name));
  } else {
    window.showInformationMessage("No matching CFDocs entity was found");
  }
}

export async function openEngineDocsForCurrentWord(): Promise<void> {
  if (!window.activeTextEditor) {
    return;
  }

  const document: TextDocument = window.activeTextEditor.document;
  const position: Position = window.activeTextEditor.selection.start;
  const documentPositionStateContext: DocumentPositionStateContext = getDocumentPositionStateContext(document, position);

  if (documentPositionStateContext.positionInComment) {
    return;
  }

  const userEngine: CFMLEngine = documentPositionStateContext.userEngine;

  if (userEngine.getName() === CFMLEngineName.Unknown) {
    window.showInformationMessage("CFML engine is not set");
    return;
  }

  const docPrefix: string = documentPositionStateContext.docPrefix;
  const textLine: TextLine = document.lineAt(position);
  const wordRange: Range = documentPositionStateContext.wordRange;
  const lineSuffix: string = documentPositionStateContext.sanitizedDocumentText.slice(document.offsetAt(wordRange.end), document.offsetAt(textLine.range.end));

  const currentWord: string = documentPositionStateContext.currentWord;

  let globalEntity: CFDocsDefinitionInfo;
  const tagPrefixPattern: RegExp = getTagPrefixPattern();
  const functionSuffixPattern: RegExp = getFunctionSuffixPattern();

  if ((tagPrefixPattern.test(docPrefix) || (userEngine.supportsScriptTags() && functionSuffixPattern.test(lineSuffix))) && cachedEntity.isGlobalTag(currentWord))
  {
    globalEntity = cachedEntity.getGlobalEntityDefinition(currentWord);
  } else if (!documentPositionStateContext.isContinuingExpression && functionSuffixPattern.test(lineSuffix) && cachedEntity.isGlobalFunction(currentWord)) {
    globalEntity = cachedEntity.getGlobalEntityDefinition(currentWord);
  }

  if (globalEntity && globalEntity.engines && globalEntity.engines.hasOwnProperty(userEngine.getName())) {
    const engineInfo: EngineCompatibilityDetail = globalEntity.engines[userEngine.getName()];
    if (engineInfo.docs) {
      commands.executeCommand("vscode.open", Uri.parse(engineInfo.docs));
    } else {
      window.showInformationMessage("No engine docs for this entity was found");
    }

    return;
  }

  window.showInformationMessage("No matching compatible entity was found");

}