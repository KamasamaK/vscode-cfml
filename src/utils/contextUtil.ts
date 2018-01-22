import { TextDocument, Range, Position, CharacterPair } from "vscode";
import * as path from "path";
import { equalsIgnoreCase } from "./textUtil";
import { COMPONENT_EXT, isScriptComponent } from "../entities/component";
import { getTagPattern, parseTags, Tag } from "../entities/tag";
import { DocumentStateContext } from "./documentUtil";
import { CommentType, CommentContext, cfmlCommentRules } from "../features/comment";

const CFM_FILE_EXTS: string[] = [".cfm", ".cfml"];
// const notContinuingExpressionPattern: RegExp = /(?:^|[^\w$.\s])\s*$/;
const continuingExpressionPattern: RegExp = /(?:\.\s*|[\w$])$/;
const cfscriptLineCommentPattern: RegExp = /\/\/[^\r\n]*/g;
const cfscriptBlockCommentPattern: RegExp = /\/\*[\s\S]*?\*\//g;
const tagBlockCommentPattern: RegExp = /<!--[\s\S]*?-->/g;

const characterPairs: CharacterPair[] = [
  ["{", "}"],
  ["[", "]"],
  ["(", ")"],
  ["\"", "\""],
  ["'", "'"],
  ["#", "#"],
  ["<", ">"]
];

export interface StringContext {
  inString: boolean;
  activeStringDelimiter: string;
  embeddedCFML?: boolean;
}

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
 * Returns all of the ranges in which tagged cfscript is active
 * @param document The document to check
 * @param range Optional range within which to check
 */
export function getCfScriptRanges(document: TextDocument, range?: Range): Range[] {
  let ranges: Range[] = [];
  let documentText: string;
  let textOffset: number;
  if (range && document.validateRange(range)) {
    documentText = document.getText(range);
    textOffset = document.offsetAt(range.start);
  } else {
    documentText = document.getText();
    textOffset = 0;
  }

  const cfscriptTagPattern: RegExp = getTagPattern("cfscript");
  let cfscriptTagMatch: RegExpExecArray = null;
  while (cfscriptTagMatch = cfscriptTagPattern.exec(documentText)) {
    const prefixLen: number = cfscriptTagMatch[1].length + cfscriptTagMatch[2].length + 1;
    const cfscriptBodyText: string = cfscriptTagMatch[3];
    if (cfscriptBodyText) {
      const cfscriptBodyStartOffset: number = textOffset + cfscriptTagMatch.index + prefixLen;
      ranges.push(new Range(
        document.positionAt(cfscriptBodyStartOffset),
        document.positionAt(cfscriptBodyStartOffset + cfscriptBodyText.length)
      ));
    }
  }

  return ranges;
}

/**
 * Returns all of the ranges for comments
 * @param document The document to check
 * @param isScript Whether the document or given range is CFScript
 * @param docRange Range within which to check
 * @param fast Whether to choose the faster but less accurate method
 */
export function getCommentRanges(document: TextDocument, isScript: boolean = false, docRange?: Range, fast: boolean = false): Range[] {
  if (fast) {
    return getCommentRangesRegex(document, isScript, docRange);
  }

  return getCommentRangesIterated(document, isScript, docRange);
}

/**
 * Returns all of the ranges for comments based on regular expression searches
 * @param document The document to check
 * @param isScript Whether the document or given range is CFScript
 * @param docRange Range within which to check
 */
function getCommentRangesRegex(document: TextDocument, isScript: boolean = false, docRange?: Range): Range[] {
  let commentRanges: Range[] = [];
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
      const scriptBlockCommentText: string = scriptBlockCommentMatch[0];
      const scriptBlockCommentStartOffset: number = textOffset + scriptBlockCommentMatch.index;
      commentRanges.push(new Range(
        document.positionAt(scriptBlockCommentStartOffset),
        document.positionAt(scriptBlockCommentStartOffset + scriptBlockCommentText.length)
      ));
    }

    let scriptLineCommentMatch: RegExpExecArray = null;
    while (scriptLineCommentMatch = cfscriptLineCommentPattern.exec(documentText)) {
      const scriptLineCommentText = scriptLineCommentMatch[0];
      const scriptLineCommentStartOffset = textOffset + scriptLineCommentMatch.index;
      commentRanges.push(new Range(
        document.positionAt(scriptLineCommentStartOffset),
        document.positionAt(scriptLineCommentStartOffset + scriptLineCommentText.length)
      ));
    }
  } else {
    let tagBlockCommentMatch: RegExpExecArray = null;
    while (tagBlockCommentMatch = tagBlockCommentPattern.exec(documentText)) {
      const tagBlockCommentText = tagBlockCommentMatch[0];
      const tagBlockCommentStartOffset = textOffset + tagBlockCommentMatch.index;
      commentRanges.push(new Range(
        document.positionAt(tagBlockCommentStartOffset),
        document.positionAt(tagBlockCommentStartOffset + tagBlockCommentText.length)
      ));
    }

    const cfScriptRanges: Range[] = getCfScriptRanges(document, docRange);
    cfScriptRanges.forEach((range: Range) => {
      const cfscriptCommentRanges: Range[] = getCommentRangesRegex(document, true, range);
      commentRanges = commentRanges.concat(cfscriptCommentRanges);
    });
  }

  return commentRanges;
}

/**
 * Returns all of the ranges for comments based on iteration. Much slower than regex, but more accurate since it ignores string contents.
 * @param document The document to check
 * @param isScript Whether the document or given range is CFScript
 * @param docRange Range within which to check
 */
function getCommentRangesIterated(document: TextDocument, isScript: boolean = false, docRange?: Range): Range[] {
  let commentRanges: Range[] = [];
  let documentText: string;
  let textOffsetStart: number;
  let previousPosition: Position;
  if (docRange && document.validateRange(docRange)) {
    documentText = document.getText(docRange);
    textOffsetStart = document.offsetAt(docRange.start);
  } else {
    documentText = document.getText();
    textOffsetStart = 0;
  }

  const textOffsetEnd = textOffsetStart + documentText.length;

  let commentContext: CommentContext = {
    inComment: false,
    activeComment: undefined,
    commentType: undefined,
    start: undefined
  };

  let lineText = "";

  let stringContext: StringContext = {
    inString: false,
    activeStringDelimiter: undefined,
    embeddedCFML: false
  };

  let cfScriptRanges: Range[] = [];
  // let cfScriptStartOffsets: number[] = [];
  // let cfScriptStartOffsetsIsEmpty: boolean = true;
  if (!isScript) {
    cfScriptRanges = getCfScriptRanges(document, docRange);
    /*
    cfScriptStartOffsets = cfScriptRanges.map((range: Range) => {
      return document.offsetAt(range.start);
    });
    cfScriptStartOffsetsIsEmpty = (cfScriptStartOffsets.length > 0);
    */
  }

  for (let offset = textOffsetStart; offset < textOffsetEnd; offset++) {
    const position: Position = document.positionAt(offset);

    /*
    if (!cfScriptStartOffsetsIsEmpty) {
      const offsetIndex = cfScriptStartOffsets.indexOf(offset);
      if (offsetIndex !== -1) {
        offset += document.getText(cfScriptRanges[offsetIndex]).length - 1;
        previousPosition = undefined;
        continue;
      }
    }
    */

    const characterAtPosition: string = documentText.charAt(offset - textOffsetStart);

    if (previousPosition && position.line !== previousPosition.line) {
      lineText = "";
    }

    lineText += characterAtPosition;

    if (commentContext.inComment) {
      if (commentContext.commentType === CommentType.Line && position.line !== previousPosition.line) {
        commentRanges.push(new Range(commentContext.start, previousPosition));

        commentContext = {
          inComment: false,
          activeComment: undefined,
          commentType: undefined,
          start: undefined
        };
      } else if (commentContext.commentType === CommentType.Block && lineText.endsWith(commentContext.activeComment[1])) {
        commentRanges.push(new Range(commentContext.start, document.positionAt(offset + 1)));

        commentContext = {
          inComment: false,
          activeComment: undefined,
          commentType: undefined,
          start: undefined
        };
      }
    } else if (stringContext.inString) {
      if (characterAtPosition === "#") {
        stringContext.embeddedCFML = !stringContext.embeddedCFML;
      } else if (!stringContext.embeddedCFML && characterAtPosition === stringContext.activeStringDelimiter) {
        stringContext = {
          inString: false,
          activeStringDelimiter: undefined,
          embeddedCFML: false
        };
      }
    } else {
      if (isScript) {
        if (isStringDelimiter(characterAtPosition)) {
          stringContext = {
            inString: true,
            activeStringDelimiter: characterAtPosition,
            embeddedCFML: false
          };
        } else if (lineText.endsWith(cfmlCommentRules.scriptLineComment)) {
          commentContext = {
            inComment: true,
            activeComment: cfmlCommentRules.scriptLineComment,
            commentType: CommentType.Line,
            start: previousPosition
          };
        } else if (lineText.endsWith(cfmlCommentRules.scriptBlockComment[0])) {
          commentContext = {
            inComment: true,
            activeComment: cfmlCommentRules.scriptLineComment,
            commentType: CommentType.Block,
            start: previousPosition
          };
        }
      } else if (lineText.endsWith(cfmlCommentRules.tagBlockComment[0])) {
        commentContext = {
          inComment: true,
          activeComment: cfmlCommentRules.tagBlockComment,
          commentType: CommentType.Block,
          start: position.translate(0, 1 - cfmlCommentRules.tagBlockComment[0].length)
        };
      }
    }

    previousPosition = position;
  }

  if (cfScriptRanges.length > 0) {
    // Remove tag comments found within CFScripts
    commentRanges = commentRanges.filter((range: Range) => {
      return !isInRanges(cfScriptRanges, range);
    });

    cfScriptRanges.forEach((range: Range) => {
      if (!isInRanges(commentRanges, range)) {
        const cfscriptCommentRanges: Range[] = getCommentRangesIterated(document, true, range);
        commentRanges = commentRanges.concat(cfscriptCommentRanges);
      }
    });
  }

  return commentRanges;
}

/**
 * Returns all of the ranges in which there is JavaScript
 * @param document The document to check
 * @param range Optional range within which to check
 */
export function getJavaScriptRanges(documentStateContext: DocumentStateContext, range?: Range): Range[] {
  const scriptTags: Tag[] = parseTags(documentStateContext, "script", range);

  return scriptTags.map((tag: Tag) => {
    return tag.bodyRange;
  });
}

/**
 * Returns all of the ranges in which tagged cfoutput is active
 * @param document The document to check
 * @param range Optional range within which to check
 */
export function getCfOutputRanges(documentStateContext: DocumentStateContext, range?: Range): Range[] {
  const cfoutputTags: Tag[] = parseTags(documentStateContext, "cfoutput", range);

  return cfoutputTags.map((tag: Tag) => {
    return tag.bodyRange;
  });
}

/**
 * Returns whether the given position is within a CFScript block
 * @param document The document to check
 * @param position Position at which to check
 */
export function isInCfScript(document: TextDocument, position: Position): boolean {
  return isInRanges(getCfScriptRanges(document), position);
}

/**
 * Returns whether the given position is in a CFScript context
 * @param document The document to check
 * @param position Position at which to check
 */
export function isPositionScript(document: TextDocument, position: Position): boolean {
  return (isScriptComponent(document) || isInCfScript(document, position));
}

/**
 * Returns whether the given position is within a JavaScript block
 * @param document The document to check
 * @param position Position at which to check
 */
export function isInJavaScript(documentStateContext: DocumentStateContext, position: Position): boolean {
  return isInRanges(getJavaScriptRanges(documentStateContext), position);
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
 * @param positionOrRange Position or range to check
 */
export function isInRanges(ranges: Range[], positionOrRange: Position | Range): boolean {
  return ranges.some((range: Range) => {
    return range.contains(positionOrRange);
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

/**
 * Given a character, gets its respective character pair
 * @param character Either character in a character pair
 */
function getCharacterPair(character: string): CharacterPair | undefined {
  return characterPairs.find((charPair: CharacterPair) => {
    return (charPair[0] === character || charPair[1] === character);
  });
}

/**
 * Gets the opening character in a character pair
 * @param closingChar The closing character in a pair
 */
function getOpeningChar(closingChar: string): string {
  const characterPair: CharacterPair = getCharacterPair(closingChar);

  if (!characterPair) {
    return "";
  }

  return characterPair[0];
}

/**
 * Gets whether the given character is a string delimiter
 * @param char A character to check against string delimiters
 */
export function isStringDelimiter(char: string): boolean {
  switch (char) {
    case "'":
      return true;
    case '"':
      return true;
    default:
      return false;
  }
}

/**
 * Determines the position at which the given opening character occurs after the given position immediately following the opening character
 * @param documentStateContext The context information for the TextDocument to check
 * @param startOffset A numeric offset representing the position in the document from which to start
 * @param endOffset A numeric offset representing the last position in the document that should be checked
 * @param char The character to check
 * @param includeChar Whether the returned position should include the character found
 */
export function getNextCharacterPosition(documentStateContext: DocumentStateContext, startOffset: number, endOffset: number, char: string, includeChar: boolean = true): Position {
  const document: TextDocument = documentStateContext.document;
  const documentText: string = documentStateContext.sanitizedDocumentText;
  let stringContext: StringContext = {
    inString: false,
    activeStringDelimiter: undefined,
    embeddedCFML: false
  };

  let pairContext = [
    // braces
    {
      characterPair: characterPairs[0],
      unclosedPairCount: 0
    },
    // brackets
    {
      characterPair: characterPairs[1],
      unclosedPairCount: 0
    },
    // parens
    {
      characterPair: characterPairs[2],
      unclosedPairCount: 0
    }
  ];
  const openingPairs: string[] = pairContext.map((pairItem) => pairItem.characterPair[0]).filter((openingChar) => openingChar !== char);
  const closingPairs: string[] = pairContext.map((pairItem) => pairItem.characterPair[1]).filter((closingChar) => closingChar !== char);
  const incrementUnclosedPair = (openingChar: string): void => {
    pairContext.filter((pairItem) => {
      return openingChar === pairItem.characterPair[0];
    }).forEach((pairItem) => {
      pairItem.unclosedPairCount++;
    });
  };
  const decrementUnclosedPair = (closingChar: string): void => {
    pairContext.filter((pairItem) => {
      return closingChar === pairItem.characterPair[1];
    }).forEach((pairItem) => {
      pairItem.unclosedPairCount--;
    });
  };
  const hasNoUnclosedPairs = (): boolean => {
    return pairContext.every((pairItem) => {
      return pairItem.unclosedPairCount === 0;
    });
  };

  for (let offset = startOffset; offset < endOffset; offset++) {
    const characterAtPosition: string = documentText.charAt(offset);

    if (stringContext.inString) {
      if (characterAtPosition === "#") {
        stringContext.embeddedCFML = !stringContext.embeddedCFML;
      } else if (!stringContext.embeddedCFML && characterAtPosition === stringContext.activeStringDelimiter) {
        stringContext = {
          inString: false,
          activeStringDelimiter: undefined,
          embeddedCFML: false
        };
      }
    } else if (isStringDelimiter(characterAtPosition)) {
      stringContext = {
        inString: true,
        activeStringDelimiter: characterAtPosition,
        embeddedCFML: false
      };
    } else if (openingPairs.includes(characterAtPosition)) {
      incrementUnclosedPair(characterAtPosition);
    } else if (closingPairs.includes(characterAtPosition)) {
      decrementUnclosedPair(characterAtPosition);
    } else if (characterAtPosition === char && hasNoUnclosedPairs()) {
      if (includeChar) {
        return document.positionAt(offset + 1);
      } else {
        return document.positionAt(offset);
      }
    }
  }

  return document.positionAt(endOffset);
}

/**
 * Determines the position at which the given closing character occurs after the given position immediately following the opening character
 * @param documentStateContext The context information for the TextDocument to check
 * @param initialOffset A numeric offset representing the position in the document from which to start
 * @param closingChar The character that denotes the closing
 */
export function getClosingPosition(documentStateContext: DocumentStateContext, initialOffset: number, closingChar: string): Position {
  const openingChar = getOpeningChar(closingChar);
  const document: TextDocument = documentStateContext.document;
  const documentText: string = documentStateContext.sanitizedDocumentText;
  let unclosedPairs = 0;
  let stringContext: StringContext = {
    inString: false,
    activeStringDelimiter: undefined,
    embeddedCFML: false
  };

  for (let offset = initialOffset; offset < documentText.length; offset++) {
    const characterAtPosition: string = documentText.charAt(offset);

    if (stringContext.inString) {
      if (characterAtPosition === "#") {
        stringContext.embeddedCFML = !stringContext.embeddedCFML;
      } else if (!stringContext.embeddedCFML && characterAtPosition === stringContext.activeStringDelimiter) {
        stringContext = {
          inString: false,
          activeStringDelimiter: undefined,
          embeddedCFML: false
        };
      }
    } else if (isStringDelimiter(characterAtPosition)) {
      stringContext = {
        inString: true,
        activeStringDelimiter: characterAtPosition,
        embeddedCFML: false
      };
    } else if (characterAtPosition === openingChar) {
      unclosedPairs++;
    } else if (characterAtPosition === closingChar) {
      if (unclosedPairs !== 0) {
        unclosedPairs--;
      } else {
        return document.positionAt(offset + 1);
      }
    }
  }

  return document.positionAt(initialOffset);
}
