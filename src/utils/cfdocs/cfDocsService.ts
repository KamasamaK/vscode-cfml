import { CFDocsDefinitionInfo } from "./definitionInfo";
import * as path from "path";
import * as fs from "fs";
import { WorkspaceConfiguration, workspace, Uri } from "vscode";
import { GlobalFunction, GlobalFunctions, GlobalTag, GlobalTags } from "../../entities/globals";
import { Parameter } from "../../entities/parameter";
import { Signature } from "../../entities/signature";
import { DataType } from "../../entities/dataType";
import * as cachedEntity from "../../features/cachedEntities";

const request = require("request");

const cfDocsLinkPrefix = "https://raw.githubusercontent.com/foundeo/cfdocs/master/data/en/";

export class CFDocsService {
  /**
   * Gets definition information for global identifiers based on CFDocs
   * @param identifier The global identifier for which to get definition info
   * @param callback An optional callback that takes the returned CFDocsDefinitionInfo
   */
  public static async getDefinitionInfo(identifier: string, callback?: (definition: CFDocsDefinitionInfo) => boolean): Promise<CFDocsDefinitionInfo> {
    const cfmlSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml");
    let definitionInfo: Promise<CFDocsDefinitionInfo> = undefined;
    if (cfmlSettings.get<string>("cfDocs.source") === "local") {
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
    const cfmlSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml");
    const cfdocsPath: string = cfmlSettings.get("cfDocs.localPath");
    let definitionInfo: CFDocsDefinitionInfo;

    return new Promise<CFDocsDefinitionInfo>((resolve, reject) => {
      try {
        const docFilePath = path.join(cfdocsPath, CFDocsService.getJsonFileName(identifier));
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
    const cfmlSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml");
    const jsonFileName: string = CFDocsService.getJsonFileName("functions");

    return new Promise<string[]>((resolve, reject) => {
      if (cfmlSettings.get<string>("cfDocs.source") === "local") {
        const cfdocsPath: string = cfmlSettings.get("cfDocs.localPath");
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
    const cfmlSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml");
    const jsonFileName: string = CFDocsService.getJsonFileName("tags");

    return new Promise<string[]>((resolve, reject) => {
      if (cfmlSettings.get<string>("cfDocs.source") === "local") {
        const cfdocsPath: string = cfmlSettings.get("cfDocs.localPath");
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
    if (definition.type === "function") {
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
    if (definition.type === "tag") {
      cachedEntity.setGlobalTag(definition.toGlobalTag());
      // TODO: Add script syntax function also
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
