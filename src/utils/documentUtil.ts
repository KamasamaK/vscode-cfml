import { Position, Range, TextDocument, WorkspaceConfiguration, workspace } from "vscode";
import { Component, isScriptComponent } from "../entities/component";
import { getComponent } from "../features/cachedEntities";
import { CFMLEngine, CFMLEngineName } from "./cfdocs/cfmlEngine";
import { getCfScriptRanges, getCommentRanges, isCfcFile, isCfmFile, isContinuingExpression, isInRanges } from "./contextUtil";
import { getSanitizedDocumentText } from "./textUtil";

export interface DocumentStateContext {
  document: TextDocument;
  isCfmFile: boolean;
  isCfcFile: boolean;
  docIsScript: boolean;
  commentRanges: Range[];
  sanitizedDocumentText: string;
  component?: Component;
  userEngine: CFMLEngine;
}

export interface DocumentPositionStateContext extends DocumentStateContext {
  position: Position;
  positionIsScript: boolean;
  positionInComment: boolean;
  docPrefix: string;
  currentWord: string;
  isContinuingExpression: boolean;
}

/**
 * Provides context information for the given document
 * @param document The document for which to provide context
 * @param fast Whether to use the faster, but less accurate parsing
 */
export function getDocumentStateContext(document: TextDocument, fast: boolean = false): DocumentStateContext {
  const cfmlEngineSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml.engine");
  const userEngineName: CFMLEngineName = CFMLEngineName.valueOf(cfmlEngineSettings.get<string>("name"));
  const userEngine: CFMLEngine = new CFMLEngine(userEngineName, cfmlEngineSettings.get<string>("version"));

  const docIsCfmFile: boolean = isCfmFile(document);
  const docIsCfcFile: boolean = isCfcFile(document);
  const thisComponent: Component = getComponent(document.uri);
  const docIsScript: boolean = (docIsCfcFile && isScriptComponent(document));
  const commentRanges: Range[] = getCommentRanges(document, docIsScript, undefined, fast);

  const sanitizedDocumentText: string = getSanitizedDocumentText(document, commentRanges);

  return {
    document,
    isCfmFile: docIsCfmFile,
    isCfcFile: docIsCfcFile,
    docIsScript,
    commentRanges,
    sanitizedDocumentText,
    component: thisComponent,
    userEngine
  };
}

/**
 * Provides context information for the given document and position
 * @param document The document for which to provide context
 * @param position The position within the document for which to provide context
 * @param fast Whether to use the faster, but less accurate parsing
 */
export function getDocumentPositionStateContext(document: TextDocument, position: Position, fast: boolean = false): DocumentPositionStateContext {
  const documentStateContext: DocumentStateContext = getDocumentStateContext(document, fast);

  const docIsScript: boolean = documentStateContext.docIsScript;
  const positionInComment: boolean = isInRanges(documentStateContext.commentRanges, position);
  const cfscriptRanges: Range[] = getCfScriptRanges(document);
  const positionIsScript: boolean = docIsScript || isInRanges(cfscriptRanges, position);

  let wordRange: Range = document.getWordRangeAtPosition(position);
  const currentWord: string = wordRange ? document.getText(wordRange) : "";
  if (!wordRange) {
    wordRange = new Range(position, position);
  }
  const docPrefix: string = documentStateContext.sanitizedDocumentText.slice(0, document.offsetAt(wordRange.start));

  const documentPositionStateContext: DocumentPositionStateContext = Object.assign(documentStateContext,
    {
      position,
      positionIsScript,
      positionInComment,
      docPrefix,
      currentWord,
      isContinuingExpression: isContinuingExpression(docPrefix)
    }
  );

  return documentPositionStateContext;
}
