import * as fs from "fs";
import * as path from "path";
import { WorkspaceConfiguration, workspace } from "vscode";
import * as cachedEntity from "../../features/cachedEntities";
import { CFMLEngine, CFMLEngineName } from "./cfmlEngine";
import { CFDocsDefinitionInfo } from "./definitionInfo";
import * as request from "request";

const cfDocsLinkPrefix = "https://raw.githubusercontent.com/foundeo/cfdocs/master/data/en/";

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
    const cfDocsLink: string = cfDocsLinkPrefix + CFDocsService.getJsonFileName(identifier);
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
        const cfDocsLink: string = cfDocsLinkPrefix + jsonFileName;

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
        const cfDocsLink: string = cfDocsLinkPrefix + jsonFileName;

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
