import * as fs from "fs";
import * as path from "path";
import { COMPONENT_EXT } from "../entities/component";
import { equalsIgnoreCase } from "./textUtil";
import { Uri, workspace, WorkspaceFolder } from "vscode";

export interface CFMLMapping {
  logicalPath: string;
  directoryPath: string;
  isPhysicalDirectoryPath?: boolean;
}

export function getDirectories(srcPath: string): string[] {
  const files: string[] = fs.readdirSync(srcPath);

  return filterDirectories(files, srcPath);
}

/**
 * Takes an array of files and filters them to only the directories
 * @param files A list of files to filter
 * @param srcPath The path of the directory in which the files are contained
 */
export function filterDirectories(files: string[], srcPath: string): string[] {
  return files.filter((file: string) => {
    return fs.statSync(path.join(srcPath, file)).isDirectory();
  });
}

export function getComponents(srcPath: string): string[] {
  const files: string[] = fs.readdirSync(srcPath);

  return filterComponents(files);
}

/**
 * Takes an array of files and filters them to only the components
 * @param files A list of files to filter
 */
export function filterComponents(files: string[]): string[] {
  return files.filter((file: string) => {
    return equalsIgnoreCase(path.extname(file), COMPONENT_EXT);
  });
}

/**
 * Resolves a dot path to a list of file paths
 * @param dotPath A string for a component in dot-path notation
 * @param baseUri The URI from which the component path will be resolved
 */
export function resolveDottedPaths(dotPath: string, baseUri: Uri): string[] {
  let paths: string[] = [];

  const normalizedPath: string = dotPath.replace(/\./g, path.sep);

  // TODO: Check imports

  // relative to local directory
  const localPath: string = resolveRelativePath(baseUri, normalizedPath);
  if (fs.existsSync(localPath)) {
    paths.push(localPath);

    if (normalizedPath.length > 0) {
      return paths;
    }
  }

  // relative to web root
  const rootPath: string = resolveRootPath(baseUri, normalizedPath);
  if (rootPath && fs.existsSync(rootPath)) {
    paths.push(rootPath);

    if (normalizedPath.length > 0) {
      return paths;
    }
  }

  // custom mappings
  const customMappingPaths: string[] = resolveCustomMappingPaths(baseUri, normalizedPath);
  for (const mappedPath of customMappingPaths) {
    if (fs.existsSync(mappedPath)) {
      paths.push(mappedPath);

      if (normalizedPath.length > 0) {
        return paths;
      }
    }
  }

  return paths;
}

/**
 * Resolves a full path relative to the given URI
 * @param baseUri The URI from which the relative path will be resolved
 * @param appendingPath A path appended to the given URI
 */
export function resolveRelativePath(baseUri: Uri, appendingPath: string): string {
  return path.join(path.dirname(baseUri.fsPath), appendingPath);
}

/**
 * Resolves a full path relative to the root of the given URI, or undefined if not in workspace
 * @param baseUri The URI from which the root path will be resolved
 * @param appendingPath A path appended to the resolved root path
 */
export function resolveRootPath(baseUri: Uri, appendingPath: string): string | undefined {
  const root: WorkspaceFolder = workspace.getWorkspaceFolder(baseUri);

  // When baseUri is not in workspace
  if (!root) {
    return undefined;
  }

  return path.join(root.uri.fsPath, appendingPath);
}

/**
 * Resolves a full path based on mappings
 * @param baseUri The URI from which the root path will be resolved
 * @param appendingPath A path appended to the resolved path
 */
export function resolveCustomMappingPaths(baseUri: Uri, appendingPath: string): string[] {
  const customMappingPaths: string[] = [];

  const cfmlMappings: CFMLMapping[] = workspace.getConfiguration("cfml", baseUri).get<CFMLMapping[]>("mappings", []);
  const normalizedPath: string = appendingPath.replace(/\\/g, "/");
  for (const cfmlMapping of cfmlMappings) {
    const slicedLogicalPath: string = cfmlMapping.logicalPath.slice(1);
    const logicalPathStartPattern = new RegExp(`^${slicedLogicalPath}(?:\/|$)`);
    if (logicalPathStartPattern.test(normalizedPath)) {
      const directoryPath: string = cfmlMapping.isPhysicalDirectoryPath === undefined || cfmlMapping.isPhysicalDirectoryPath ? cfmlMapping.directoryPath : resolveRootPath(baseUri, cfmlMapping.directoryPath);
      const mappedPath: string = path.join(directoryPath, appendingPath.slice(slicedLogicalPath.length));
      customMappingPaths.push(mappedPath);
    }
  }

  return customMappingPaths;
}
