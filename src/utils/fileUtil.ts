import * as fs from "fs";
import * as path from "path";
import { COMPONENT_EXT } from "../entities/component";
import { equalsIgnoreCase } from "./textUtil";
import { Uri, workspace, WorkspaceFolder } from "vscode";

export function getDirectories(srcPath: string): string[] {
  const files: string[] = fs.readdirSync(srcPath);

  return filterDirectories(files, srcPath);
}

export function filterDirectories(files: string[], srcPath: string): string[] {
  return files.filter((file: string) => {
    return fs.statSync(path.join(srcPath, file)).isDirectory();
  });
}

export function getComponents(srcPath: string): string[] {
  const files: string[] = fs.readdirSync(srcPath);

  return filterComponents(files);
}

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
  const baseDir: string = path.dirname(baseUri.fsPath);
  const localPath: string = path.join(baseDir, normalizedPath);
  if (fs.existsSync(localPath)) {
    paths.push(localPath);

    if (normalizedPath.length > 0) {
      return paths;
    }
  }

  // relative to web root
  const root: WorkspaceFolder = workspace.getWorkspaceFolder(baseUri);
  const rootPath: string = path.join(root.uri.fsPath, normalizedPath);
  if (fs.existsSync(rootPath)) {
    paths.push(rootPath);

    if (normalizedPath.length > 0) {
      return paths;
    }
  }

  // TODO: custom mappings

  return paths;
}