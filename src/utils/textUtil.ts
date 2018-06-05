import { MarkdownString, Range, TextDocument, Position } from "vscode";
import { getCommentRanges, isCfcFile } from "./contextUtil";
import { getComponent, hasComponent } from "../features/cachedEntities";

export enum Quote {
  Single = "single",
  Double = "double"
}

/**
 * Returns the quote of the given type
 */
export function getQuote(quote: Quote): string {
  return quote === Quote.Single ? "'" : '"';
}

/**
 * Returns whether the string are equal ignoring case
 * @param string1 A string to compare
 * @param string2 A string to compare
 */
export function equalsIgnoreCase(string1: string, string2: string): boolean {
    return string1.toLowerCase() === string2.toLowerCase();
}

/**
 * Transforms text to MarkdownString
 * @param text A candidate string
 */
export function textToMarkdownString(text: string): MarkdownString {
  return new MarkdownString(text.replace(/\n(?!\n)/g, "  \n"));
}

/**
 * Escapes special markdown characters
 * @param text A candidate string
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!]/g, "\\$&");
}

/**
 * Returns a text document's text with all non-whitespace characters within a given range replaced with spaces
 * @param document The text document in which to replace
 * @param range The range within which to replace text
 */
export function replaceRangeWithSpaces(document: TextDocument, ranges: Range[]): string {
  let documentText: string = document.getText();

  ranges.forEach((range: Range) => {
    const rangeStartOffset: number = document.offsetAt(range.start);
    const rangeEndOffset: number = document.offsetAt(range.end);
    documentText = documentText.substr(0, rangeStartOffset)
      + documentText.substring(rangeStartOffset, rangeEndOffset).replace(/\S/g, " ")
      + documentText.substr(rangeEndOffset, documentText.length - rangeEndOffset);
  });

  return documentText;
}

/**
 * Returns a text document's text replacing all comment text with whitespace.
 * @param document The text document from which to get text
 * @param commentRanges Optional ranges in which there are CFML comments
 */
export function getSanitizedDocumentText(document: TextDocument, commentRanges?: Range[]): string {
  let documentCommentRanges: Range[];
  if (commentRanges) {
    documentCommentRanges = commentRanges;
  } else {
    const docIsScript: boolean = (isCfcFile(document) && hasComponent(document.uri) && getComponent(document.uri).isScript);
    documentCommentRanges = getCommentRanges(document, docIsScript);
  }

  return replaceRangeWithSpaces(document, documentCommentRanges);
}

/**
 * Returns a text document's text before given position. Optionally replaces all comment text with whitespace.
 * @param document The text document in which to replace
 * @param position The position that marks the end of the document's text to return
 * @param replaceComments Whether the text should have comments replaced
 */
export function getPrefixText(document: TextDocument, position: Position, replaceComments: boolean = false): string {
  let documentText: string = document.getText();
  if (replaceComments) {
    documentText = getSanitizedDocumentText(document);
  }

  return documentText.slice(0, document.offsetAt(position));
}
