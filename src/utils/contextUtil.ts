import { TextDocument, Range, Position } from "vscode";
import * as path from "path";
import { equalsIgnoreCase } from "./textUtil";
import { COMPONENT_EXT } from "../entities/component";

const CFM_FILE_EXTS: string[] = [".cfm", ".cfml"];
const cfscriptTagPattern: RegExp = /<cfscript>([\s\S]*?)<\/cfscript>/gi;
// const notContinuingExpressionPattern: RegExp = /(?:^|[^\w$.\s])\s*$/;
const continuingExpressionPattern: RegExp = /(?:\.\s*|[\w$])$/;
const cfscriptLineCommentPattern: RegExp = /\/\/[^\r\n]*/g;
const cfscriptBlockCommentPattern: RegExp = /\/\*[\s\S]*?\*\//g;
const tagBlockCommentPattern: RegExp = /<!--[\s\S]*?-->/g;

/**
 * Checks whether the given document is a CFM file
 * @param document The document to check
 */
export function isCfmFile(document: TextDocument): boolean {
  const extensionName: string = path.extname(document.fileName);
  for (let currExt of CFM_FILE_EXTS) {
    if (equalsIgnoreCase(extensionName, currExt)) {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether the given document is a CFC file
 * @param document The document to check
 */
export function isCfcFile(document: TextDocument): boolean {
  const extensionName = path.extname(document.fileName);
  return equalsIgnoreCase(extensionName, COMPONENT_EXT);
}

/**
 * Checks whether text contains <cf or </cf tags
 * @param text The text to check
 */
export function containsCfTag(text: string): boolean {
  return /\<\/?cf\S{1}/i.test(text);
}

/**
 * Checks whether text contains <cfscript or </cfscript tags
 * @param text The text to check
 */
export function containsCfScriptTag(text: string): boolean {
  return /<\/?cfscript/i.test(text);
}

/**
 * Checks if the last instance of <cf or </cf is <cfscript
 * @param text The text to check
 */
export function isLastTagCFScript(text: string): boolean {
  let textMatches: RegExpMatchArray = text.match(/\<\/?cf(?!.*\<\/?cf)\S{1,6}/gi);
  if (textMatches && textMatches.length > 0) {
    return textMatches.reverse()[0] === "<cfscript";
  }
  return false;
}

/**
 * Returns all of the ranges in which tagged cfscript is active
 * @param document The document to check
 * @param range Range within which to check
 */
export function getCfScriptRanges(document: TextDocument, range?: Range): Range[] {
  let ranges: Range[] = [];
  const prefixLen = 10;
  let documentText: string;
  let textOffset: number;
  if (range && document.validateRange(range)) {
    documentText = document.getText(range);
    textOffset = document.offsetAt(range.start);
  } else {
    documentText = document.getText();
    textOffset = 0;
  }

  let scriptBodyMatch: RegExpExecArray = null;
  while (scriptBodyMatch = cfscriptTagPattern.exec(documentText)) {
    const scriptBodyText = scriptBodyMatch[1];
    const scriptBodyStartOffset = textOffset + scriptBodyMatch.index + prefixLen;
    ranges.push(new Range(
      document.positionAt(scriptBodyStartOffset),
      document.positionAt(scriptBodyStartOffset + scriptBodyText.length)
    ));
  }
  return ranges;
}

/**
 * Returns all of the ranges for comments
 * @param document The document to check
 * @param isScript Whether the document or given range is CFScript
 * @param docRange Range within which to check
 */
export function getCommentRanges(document: TextDocument, isScript: boolean = false, docRange?: Range): Range[] {
  let ranges: Range[] = [];
  let documentText: string;
  let textOffset: number;
  if (docRange && document.validateRange(docRange)) {
    documentText = document.getText(docRange);
    textOffset = document.offsetAt(docRange.start);
  } else {
    documentText = document.getText();
    textOffset = 0;
  }

  if (isScript) {
    let scriptBlockCommentMatch: RegExpExecArray = null;
    while (scriptBlockCommentMatch = cfscriptBlockCommentPattern.exec(documentText)) {
      const scriptBlockCommentText = scriptBlockCommentMatch[0];
      const scriptBlockCommentStartOffset = textOffset + scriptBlockCommentMatch.index;
      ranges.push(new Range(
        document.positionAt(scriptBlockCommentStartOffset),
        document.positionAt(scriptBlockCommentStartOffset + scriptBlockCommentText.length)
      ));
    }

    let scriptLineCommentMatch: RegExpExecArray = null;
    while (scriptLineCommentMatch = cfscriptLineCommentPattern.exec(documentText)) {
      const scriptLineCommentText = scriptLineCommentMatch[0];
      const scriptLineCommentStartOffset = textOffset + scriptLineCommentMatch.index;
      ranges.push(new Range(
        document.positionAt(scriptLineCommentStartOffset),
        document.positionAt(scriptLineCommentStartOffset + scriptLineCommentText.length)
      ));
    }
  } else {
    let tagBlockCommentMatch: RegExpExecArray = null;
    while (tagBlockCommentMatch = tagBlockCommentPattern.exec(documentText)) {
      const tagBlockCommentText = tagBlockCommentMatch[0];
      const tagBlockCommentStartOffset = textOffset + tagBlockCommentMatch.index;
      ranges.push(new Range(
        document.positionAt(tagBlockCommentStartOffset),
        document.positionAt(tagBlockCommentStartOffset + tagBlockCommentText.length)
      ));
    }

    const cfScriptRanges: Range[] = getCfScriptRanges(document, docRange);
    cfScriptRanges.forEach((range: Range) => {
      const cfscriptCommentRanges: Range[] = getCommentRanges(document, true, range);
      ranges = ranges.concat(cfscriptCommentRanges);
    });
  }

  return ranges;
}

// TODO: getStringRanges

// TODO: getJavaScriptRanges

// TODO: getCfOutputRanges

/**
 * Returns whether the given position is within a CFScript block
 * @param document The document to check
 * @param position Position at which to check
 */
export function isInCfScript(document: TextDocument, position: Position): boolean {
  return isInRanges(getCfScriptRanges(document), position);
}

/**
 * Returns whether the given position is within a comment
 * @param document The document to check
 * @param position Position at which to check
 * @param isScript Whether the document is CFScript
 */
export function isInComment(document: TextDocument, position: Position, isScript: boolean = false): boolean {
  return isInRanges(getCommentRanges(document, isScript), position);
}

/**
 * Returns whether the given position is within a set of ranges
 * @param ranges The set of ranges within which to check
 * @param position Position at which to check
 */
export function isInRanges(ranges: Range[], position: Position): boolean {
  return ranges.some((range: Range) => {
    return range.contains(position);
  });
}

/**
 * Returns an array of ranges inverted from given ranges
 * @param document The document to check
 * @param ranges Ranges to invert
 */
export function invertRanges(document: TextDocument, ranges: Range[]): Range[] {
  let invertedRanges: Range[] = [];

  const documentEndPosition: Position = document.positionAt(document.getText().length);
  let previousEndPosition: Position = new Position(0, 0);
  ranges.forEach((range: Range) => {
    if (previousEndPosition.isEqual(range.start)) {
      previousEndPosition = range.end;
      return;
    }

    invertedRanges.push(new Range(
      previousEndPosition,
      range.start
    ));
  });
  if (!previousEndPosition.isEqual(documentEndPosition)) {
    invertedRanges.push(new Range(
      previousEndPosition,
      documentEndPosition
    ));
  }

  return invertedRanges;
}

/**
 * Returns if the given prefix is part of a continuing expression
 * @param prefix Prefix to the current position
 */
export function isContinuingExpressionPattern(prefix: string): boolean {
  return continuingExpressionPattern.test(prefix);
}
