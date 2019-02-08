import { Position, Range, Selection, TextDocument, TextEditor, window } from "vscode";
import { getGlobalTag } from "../features/cachedEntities";
import { StringContext, isStringDelimiter } from "../utils/contextUtil";
import { DocumentPositionStateContext, DocumentStateContext, getDocumentPositionStateContext } from "../utils/documentUtil";
import { Attributes, parseAttributes } from "./attribute";
import { DataType } from "./dataType";
import { GlobalTag } from "./globals";
import { HTML_EMPTY_ELEMENTS } from "./html/htmlTag";

const tagAttributePattern: RegExp = /<(([a-z_]+)\s+)([^<>]*)$/i;
const cfTagAttributePattern: RegExp = /<((cf[a-z_]+)\s+)([^<>]*)$/i;
// FIXME: If an attribute value contains ) then subsequent attributes will not match this
const cfScriptTagAttributePattern: RegExp = /\b((cf[a-z_]+)\s*\(\s*)([^)]*)$/i;
const tagPrefixPattern: RegExp = /<\s*(\/)?\s*$/;

export interface Tag {
  name: string;
  attributes: Attributes;
  tagRange: Range;
  bodyRange?: Range;
  isScript: boolean;
}

export interface StartTag {
  name: string;
  attributes: Attributes;
  tagRange: Range;
}

export interface TagContext {
  inStartTag: boolean;
  inEndTag: boolean;
  name: string;
  startOffset: number;
}

const nonClosingCfmlTags: string[] = [
  "cfabort",
  "cfapplication",
  "cfargument",
  "cfassociate",
  "cfbreak",
  "cfchartdata",
  "cfcollection",
  "cfcontent",
  "cfcontinue",
  "cfcookie",
  "cfdirectory",
  "cfdump",
  "cfelse",
  "cfelseif",
  "cferror",
  "cfexecute",
  "cfexit",
  "cffile",
  "cfflush",
  "cfheader",
  "cfhttpparam",
  "cfimage",
  "cfimport",
  "cfinclude",
  "cfindex",
  "cfinput",
  "cfinvokeargument",
  "cflocation",
  "cflog",
  "cfloginuser",
  "cflogout",
  "cfmailparam",
  "cfobject",
  "cfobjectcache",
  "cfparam",
  "cfpop",
  "cfprocessingdirective",
  "cfprocparam",
  "cfprocresult",
  "cfproperty",
  "cfqueryparam",
  "cfregistry",
  "cfreportparam",
  "cfrethrow",
  "cfreturn",
  "cfschedule",
  "cfsearch",
  "cfset",
  "cfsetting",
  "cfthrow",
  "cfwddx"
];

export const nonClosingTags: string[] = nonClosingCfmlTags.concat(HTML_EMPTY_ELEMENTS);

export const nonIndentingTags: string[] = [
  // HTML
  "area",
  "base",
  "br",
  "col",
  "command",
  "embed",
  "hr",
  "img",
  "input",
  "keygen",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
  // CFML
  "cfabort",
  "cfapplication",
  "cfargument",
  "cfassociate",
  "cfbreak",
  "cfchartdata",
  "cfcollection",
  "cfcontent",
  "cfcontinue",
  "cfcookie",
  "cfdirectory",
  "cfdump",
  "cferror",
  "cfexecute",
  "cfexit",
  "cffile",
  "cfflush",
  "cfheader",
  "cfhttpparam",
  "cfimage",
  "cfimport",
  "cfinclude",
  "cfindex",
  "cfinput",
  "cfinvokeargument",
  "cflocation",
  "cflog",
  "cfloginuser",
  "cflogout",
  "cfmailparam",
  "cfobject",
  "cfobjectcache",
  "cfparam",
  "cfpop",
  "cfprocessingdirective",
  "cfprocparam",
  "cfprocresult",
  "cfproperty",
  "cfqueryparam",
  "cfregistry",
  "cfreportparam",
  "cfrethrow",
  "cfreturn",
  "cfschedule",
  "cfsearch",
  "cfset",
  "cfsetting",
  "cfthrow",
  "cfwddx"
];

export const decreasingIndentingTags: string[] = [
  "cfelse",
  "cfelseif"
];

// These tags contain an expression instead of attributes
export const expressionCfmlTags: string[] = ["cfset", "cfif", "cfelseif", "cfreturn"];

export interface VariableAttribute {
  attributeName: string;
  dataType: DataType;
}

export interface OutputVariableTags {
  [name: string]: VariableAttribute[];
}

export interface InputVariableTags {
  [name: string]: VariableAttribute[];
}

/*
const outputVariableTags: OutputVariableTags = {
  "cfchart": [
    {
      attributeName: "name",
      dataType: DataType.Binary
    }
  ],
  "cfcollection": [
    {
      attributeName: "name",
      dataType: DataType.Query
    }
  ],
  "cfdbinfo": [
    {
      attributeName: "name",
      dataType: DataType.Any
    }
  ],
  "cfdirectory": [
    {
      attributeName: "name",
      dataType: DataType.Query
    }
  ],
  "cfdocument": [
    {
      attributeName: "name",
      dataType: DataType.Binary
    }
  ],
  "cfexecute": [
    {
      attributeName: "variable",
      dataType: DataType.String
    }
  ],
  "cffeed": [
    {
      attributeName: "name",
      dataType: DataType.Struct
    },
    {
      attributeName: "query",
      dataType: DataType.Query
    }
  ],
  "cffile": [
    {
      attributeName: "result",
      dataType: DataType.Struct
    },
    {
      attributeName: "variable",
      dataType: DataType.Any
    }
  ],
  "cfftp": [
    {
      attributeName: "name",
      dataType: DataType.Query
    },
    {
      attributeName: "result",
      dataType: DataType.Struct
    }
  ],
  "cfhtmltopdf": [
    {
      attributeName: "name",
      dataType: DataType.Binary
    }
  ],
  "cfhttp": [
    {
      attributeName: "name",
      dataType: DataType.Query
    },
    {
      attributeName: "result",
      dataType: DataType.Struct
    }
  ],
  "cfimage": [
    {
      attributeName: "name",
      dataType: DataType.Any
    },
    {
      attributeName: "structName",
      dataType: DataType.Struct
    }
  ],
  "cfimap": [
    {
      attributeName: "name",
      dataType: DataType.Query
    }
  ],
  // cfinvoke dataType could be taken from function return type
  "cfinvoke": [
    {
      attributeName: "returnvariable",
      dataType: DataType.Any
    }
  ],
  "cfldap": [
    {
      attributeName: "name",
      dataType: DataType.Query
    }
  ],
  // cfloop dataTypes are conditional
  "cfloop": [
    {
      attributeName: "index",
      dataType: DataType.Any
    },
    {
      attributeName: "item",
      dataType: DataType.Any
    }
  ],
  "cfntauthenticate": [
    {
      attributeName: "result",
      dataType: DataType.Any
    },
  ],
  // cfobject excluded and handled elsewhere
  // cfparam excluded and handled elsewhere
  "cfpdf": [
    {
      attributeName: "name",
      dataType: DataType.Binary
    },
  ],
  "cfpop": [
    {
      attributeName: "name",
      dataType: DataType.Query
    },
  ],
  "cfprocparam": [
    {
      attributeName: "variable",
      dataType: DataType.Any
    },
  ],
  "cfprocresult": [
    {
      attributeName: "name",
      dataType: DataType.Query
    },
  ],
  // cfproperty excluded and handled elsewhere
  "cfquery": [
    {
      attributeName: "name",
      dataType: DataType.Query
    },
    {
      attributeName: "result",
      dataType: DataType.Struct
    }
  ],
  "cfregistry": [
    {
      attributeName: "name",
      dataType: DataType.Query
    },
    {
      attributeName: "variable",
      dataType: DataType.Any
    }
  ],
  "cfreport": [
    {
      attributeName: "name",
      dataType: DataType.Any
    },
  ],
  "cfsavecontent": [
    {
      attributeName: "variable",
      dataType: DataType.String
    },
  ],
  "cfsearch": [
    {
      attributeName: "name",
      dataType: DataType.Query
    },
  ],
  "cfsharepoint": [
    {
      attributeName: "name",
      dataType: DataType.Any
    },
  ],
  "cfspreadsheet": [
    {
      attributeName: "name",
      dataType: DataType.Any
    },
    {
      attributeName: "query",
      dataType: DataType.Query
    }
  ],
  "cfstoredproc": [
    {
      attributeName: "result",
      dataType: DataType.Struct
    },
  ],
  "cfwddx": [
    {
      attributeName: "output",
      dataType: DataType.Any
    },
  ],
  "cfxml": [
    {
      attributeName: "variable",
      dataType: DataType.XML
    },
  ],
  "cfzip": [
    {
      attributeName: "name",
      dataType: DataType.Query
    },
    {
      attributeName: "variable",
      dataType: DataType.Any
    },
  ],
};

export function getOutputVariableTags(): OutputVariableTags {
  return outputVariableTags;
}
*/

/**
 * Key is tag name. Value is array of attribute names. Both all lowercased.
 */
export interface ComponentPathAttributes {
  [name: string]: string[];
}

const componentPathAttributes: ComponentPathAttributes = {
  "cfargument": [
    "type"
  ],
  // Handling cfcomponent extends/implements elsewhere
  "cffunction": [
    "returntype"
  ],
  "cfproperty": [
    "type"
  ],
};

export function getComponentPathAttributes(): ComponentPathAttributes {
  return componentPathAttributes;
}

/**
 * Returns a pattern that matches the most recent unclosed tag, capturing the name and attributes
 */
export function getTagAttributePattern(): RegExp {
  return tagAttributePattern;
}

/**
 * Returns a pattern that matches the most recent unclosed cf-tag, capturing the name and attributes
 */
export function getCfTagAttributePattern(): RegExp {
  return cfTagAttributePattern;
}

/**
 * Returns a pattern that matches the most recent unclosed script cf-tag, capturing the name and attributes
 */
export function getCfScriptTagAttributePattern(): RegExp {
  return cfScriptTagAttributePattern;
}

/**
 * Gets a pattern that matches a tag prefix
 * Capture groups:
 * 1. Closing slash
 */
export function getTagPrefixPattern(): RegExp {
  return tagPrefixPattern;
}

/**
 * Returns a pattern that matches tags with the given name. Nested tags of the same name will not be correctly selected.
 * Capture groups:
 * 1. Name/Prefix
 * 2. Attributes
 * 3. Body
 * @param tagName The name of the tag to capture
 */
export function getTagPattern(tagName: string): RegExp {
  // Attributes capture fails if an attribute value contains >
  return new RegExp(`(<${tagName}\\b\\s*)([^>]*?)(?:>([\\s\\S]*?)<\\/${tagName}>|\\/?>)`, "gi");
}

/**
 * Returns a pattern that matches start tags with the given name.
 * Capture groups:
 * 1. Prefix
 * 2. Attributes
 * 3. Closing slash
 * @param tagName The name of the tag to capture
 */
export function getStartTagPattern(tagName: string): RegExp {
  return new RegExp(`(<${tagName}\\b\\s*)([^>]*?)(\\/)?>`, "gi");
}

/**
 * Returns a pattern that matches start tags in script with the given name.
 * Capture groups:
 * 1. Prefix
 * 2. Attributes
 * 3. Closing semicolon
 * @param tagName The name of the tag to capture
 */
export function getStartScriptTagPattern(tagName: string): RegExp {
  return new RegExp(`\\b(${tagName}\\s*\\(\\s*)([^)]*)\\)(;)?`, "gi");
}

/**
 * Returns a pattern that matches all CF tags. Does not properly deal with nested tags of the same type.
 * Capture groups:
 * 1. Prefix
 * 2. Name
 * 3. Attributes
 * 4. Body
 */
export function getCfTagPattern(): RegExp {
  return /(<(cf[a-z_]+)\s*)([^>]*?)(?:>([\s\S]*?)<\/\2>|\/?>)/gi;
}

/**
 * Returns a pattern that matches CF tags ignoring a body.
 * Capture groups:
 * 1. Prefix
 * 2. Name
 * 3. Attributes
 */
export function getCfStartTagPattern(): RegExp {
  return /(<(cf[a-z_]+)\s*)([^>]*?)>/gi;
}

/**
 * Returns a pattern that matches all CFScript tags.
 * Capture groups:
 * 1. Prefix
 * 2. Name
 * 3. Attributes
 * 4. Body
 */
export function getCfScriptTagPattern(): RegExp {
  return /\b((cf[a-z_]+)\s*\(\s*)([^)]*)\)(?:\s*{([^}]*?)})?/gi;
}

/**
 * Returns a pattern that matches all CFScript tags ignoring a body.
 * Capture groups:
 * 1. Prefix
 * 2. Name
 * 3. Attributes
 */
export function getCfScriptTagPatternIgnoreBody(): RegExp {
  return /\b((cf[a-z_]+)\s*\(\s*)([^)]*)\)/gi;
}


/**
 * Gets the names of all nonclosing CFML tags
 */
export function getNonClosingCfmlTags(): string[] {
  return nonClosingCfmlTags;
}

/**
 * Returns all of the information for the given tag name in the given document, optionally within a given range.
 * Nested tags of the same name will not be correctly selected. Does not account for tags in script.
 * @param documentStateContext The context information for the TextDocument to check
 * @param tagName The name of the tag to capture
 * @param range Range within which to check
 */
export function parseTags(documentStateContext: DocumentStateContext, tagName: string, range?: Range): Tag[] {
  let tags: Tag[] = [];
  const document: TextDocument = documentStateContext.document;
  let textOffset: number = 0;
  let documentText: string = documentStateContext.sanitizedDocumentText;
  if (range && document.validateRange(range)) {
    textOffset = document.offsetAt(range.start);
    documentText = documentText.slice(textOffset, document.offsetAt(range.end));
  }

  const thisTagPattern: RegExp = getTagPattern(tagName);
  let thisTagMatch: RegExpExecArray = null;
  while (thisTagMatch = thisTagPattern.exec(documentText)) {
    const tagStart: string = thisTagMatch[1];
    const tagAttributes: string = thisTagMatch[2];
    const tagBodyText: string = thisTagMatch[3];

    const attributeStartOffset: number = textOffset + thisTagMatch.index + tagStart.length;
    const attributeRange: Range = new Range(
      document.positionAt(attributeStartOffset),
      document.positionAt(attributeStartOffset + tagAttributes.length)
    );

    let tagBodyRange: Range;
    if (tagBodyText !== undefined) {
      const thisBodyStartOffset: number = attributeStartOffset + tagAttributes.length + 1;
      tagBodyRange = new Range(
        document.positionAt(thisBodyStartOffset),
        document.positionAt(thisBodyStartOffset + tagBodyText.length)
      );
    }

    tags.push({
      name: tagName,
      attributes: parseAttributes(document, attributeRange),
      tagRange: new Range(
        document.positionAt(thisTagMatch.index),
        document.positionAt(thisTagMatch.index + thisTagMatch[0].length)
      ),
      bodyRange: tagBodyRange,
      isScript: false
    });
  }

  return tags;
}


/**
 * Returns the start tag information for the given tag name in the given document, optionally within a given range.
 * @param documentStateContext The context information for the TextDocument to check
 * @param tagName The name of the tag to capture
 * @param isScript Whether this document or range is defined entirely in CFScript
 * @param range Range within which to check
 */
export function parseStartTags(documentStateContext: DocumentStateContext, tagName: string, isScript: boolean, range?: Range): StartTag[] {
  let startTags: StartTag[] = [];
  const document: TextDocument = documentStateContext.document;
  let textOffset: number = 0;
  let documentText: string = documentStateContext.sanitizedDocumentText;
  if (range && document.validateRange(range)) {
    textOffset = document.offsetAt(range.start);
    documentText = documentText.slice(textOffset, document.offsetAt(range.end));
  }

  const thisTagPattern: RegExp = isScript ? getStartScriptTagPattern(tagName) : getStartTagPattern(tagName);
  let thisTagMatch: RegExpExecArray = null;
  while (thisTagMatch = thisTagPattern.exec(documentText)) {
    const fullMatch: string = thisTagMatch[0];
    const tagStart: string = thisTagMatch[1];
    const tagAttributes: string = thisTagMatch[2];

    const thisTagStartOffset: number = textOffset + thisTagMatch.index;
    const startTagRange: Range = new Range(
      document.positionAt(thisTagStartOffset),
      document.positionAt(thisTagStartOffset + fullMatch.length)
    );

    const attributeStartOffset: number = thisTagStartOffset + tagStart.length;
    const attributeRange: Range = new Range(
      document.positionAt(attributeStartOffset),
      document.positionAt(attributeStartOffset + tagAttributes.length)
    );

    startTags.push({
      name: tagName,
      attributes: parseAttributes(document, attributeRange),
      tagRange: startTagRange
    });
  }

  return startTags;
}

/**
 * Returns all of the CF tags for the given documentStateContext
 * @param documentStateContext The context information for the TextDocument to check
 * @param isScript Whether the document or given range is CFScript
 * @param docRange Range within which to check
 */
export function getCfTags(documentStateContext: DocumentStateContext, isScript: boolean = false, docRange?: Range): Tag[] {
  let tags: Tag[] = [];
  let unclosedTags: StartTag[] = [];
  const document: TextDocument = documentStateContext.document;
  const documentText: string = documentStateContext.sanitizedDocumentText;
  let textOffsetStart: number = 0;
  let textOffsetEnd = documentText.length;

  if (docRange && document.validateRange(docRange)) {
    textOffsetStart = document.offsetAt(docRange.start);
    textOffsetEnd = document.offsetAt(docRange.end);
  }

  let tagContext: TagContext = {
    inStartTag: false,
    inEndTag: false,
    name: undefined,
    startOffset: undefined
  };

  let stringContext: StringContext = {
    inString: false,
    activeStringDelimiter: undefined,
    start: undefined,
    embeddedCFML: false
  };

  const nonClosingCfmlTags: string[] = getNonClosingCfmlTags();

  const tagOpeningChar: string = "<";
  const tagClosingChar: string = ">";
  const embeddedCFMLDelimiter: string = "#";

  // TODO: Account for script tags

  let characterAtPreviousPosition: string;
  for (let offset = textOffsetStart; offset < textOffsetEnd; offset++) {
    const characterAtPosition: string = documentText.charAt(offset);

    if (stringContext.inString) {
      if (characterAtPosition === embeddedCFMLDelimiter) {
        stringContext.embeddedCFML = !stringContext.embeddedCFML;
      } else if (!stringContext.embeddedCFML && characterAtPosition === stringContext.activeStringDelimiter) {
        stringContext = {
          inString: false,
          activeStringDelimiter: undefined,
          start: undefined,
          embeddedCFML: false
        };
      }
    } else if (tagContext.inStartTag) {
      if (characterAtPosition === tagClosingChar) {
        const globalTag: GlobalTag = getGlobalTag(tagContext.name);
        let attributes: Attributes;
        if (!globalTag || (globalTag.signatures.length > 0 && globalTag.signatures[0].parameters.length > 0)) {
          const attributeRange: Range = new Range(
            document.positionAt(tagContext.startOffset + tagContext.name.length + 1),
            document.positionAt(offset)
          );
          attributes = parseAttributes(document, attributeRange);
        }
        const tagRange: Range = new Range(document.positionAt(tagContext.startOffset), document.positionAt(offset + 1));
        if (nonClosingCfmlTags.includes(tagContext.name) || characterAtPreviousPosition === "/") {
          tags.push({
            name: tagContext.name,
            attributes: attributes,
            tagRange: tagRange,
            isScript: false
          });
        } else {
          unclosedTags.push({
            name: tagContext.name,
            attributes: attributes,
            tagRange: tagRange
          });
        }

        tagContext = {
          inStartTag: false,
          inEndTag: false,
          name: undefined,
          startOffset: undefined
        };
      } else if (isStringDelimiter(characterAtPosition)) {
        stringContext = {
          inString: true,
          activeStringDelimiter: characterAtPosition,
          start: document.positionAt(offset),
          embeddedCFML: false
        };
      }
    } else if (tagContext.inEndTag) {
      if (characterAtPosition === tagClosingChar) {
        const unclosedTag: StartTag = unclosedTags.pop();
        const bodyRange = new Range(unclosedTag.tagRange.end.translate(0, 1), document.positionAt(tagContext.startOffset));

        tags.push({
          name: unclosedTag.name,
          attributes: unclosedTag.attributes,
          tagRange: new Range(unclosedTag.tagRange.start, document.positionAt(offset + 1)),
          bodyRange: bodyRange,
          isScript: false
        });

        tagContext = {
          inStartTag: false,
          inEndTag: false,
          name: undefined,
          startOffset: undefined
        };
      }
    } else if (isScript) {
      if (isStringDelimiter(characterAtPosition)) {
        const currentPosition: Position = document.positionAt(offset);
        stringContext = {
          inString: true,
          activeStringDelimiter: characterAtPosition,
          start: currentPosition,
          embeddedCFML: false
        };
      }
    } else if (characterAtPreviousPosition === "c" && characterAtPosition === "f") {
      const currentPosition: Position = document.positionAt(offset);
      const prefixStartPosition: Position = document.positionAt(offset - 2);
      const prefixEndPosition: Position = document.positionAt(offset - 1);
      let prefixText: string = document.getText(new Range(prefixStartPosition, prefixEndPosition));
      if (prefixText === tagOpeningChar) {
        const tagName = document.getText(document.getWordRangeAtPosition(currentPosition));
        tagContext = {
          inStartTag: true,
          inEndTag: false,
          name: tagName,
          startOffset: offset - 2
        };
      } else {
        const beforePrefixPosition: Position = document.positionAt(offset - 3);
        prefixText = document.getText(new Range(beforePrefixPosition, prefixEndPosition));
        if (prefixText === "</") {
          const tagName = document.getText(document.getWordRangeAtPosition(currentPosition));
          const lastUnclosedTag: StartTag = unclosedTags.slice(-1)[0];
          if (lastUnclosedTag && lastUnclosedTag.name === tagName) {
            tagContext = {
              inStartTag: false,
              inEndTag: true,
              name: tagName,
              startOffset: offset - 3
            };
          }
        }
      }
    }

    characterAtPreviousPosition = characterAtPosition;
  }

  /*
  if (!isScript) {
    let cfScriptRanges: Range[] = getCfScriptRanges(document, docRange);
    cfScriptRanges.forEach((range: Range) => {
      const cfscriptTags: Tag[] = getCfTags(documentStateContext, true, range);
      tags = tags.concat(cfscriptTags);
    });
  }
  */

  return tags;
}

/**
 * Relocates cursor to the start of the tag matching the current selection
 */
export async function goToMatchingTag(): Promise<void> {
  if (!window.activeTextEditor) {
    return;
  }

  const editor: TextEditor = window.activeTextEditor;
  const position: Position = editor.selection.active;

  const documentPositionStateContext: DocumentPositionStateContext = getDocumentPositionStateContext(editor.document, position);

  const currentWord: string = documentPositionStateContext.currentWord;
  let globalTag: GlobalTag = getGlobalTag(currentWord);
  if (!globalTag) {
    const cfTagAttributePattern: RegExp = documentPositionStateContext.positionIsScript ? getCfScriptTagAttributePattern() : getCfTagAttributePattern();
    const cfTagAttributeMatch: RegExpExecArray = cfTagAttributePattern.exec(documentPositionStateContext.docPrefix);
    if (cfTagAttributeMatch) {
      const tagName: string = cfTagAttributeMatch[2];
      globalTag = getGlobalTag(tagName);
    }
  }

  if (globalTag) {
    const nonClosingCfmlTags: string[] = getNonClosingCfmlTags();
    if (!nonClosingCfmlTags.includes(globalTag.name)) {
      const tags: Tag[] = getCfTags(documentPositionStateContext, documentPositionStateContext.docIsScript);
      const foundTag: Tag = tags.find((tag: Tag) => {
        return (tag.bodyRange && !tag.bodyRange.contains(position) && tag.tagRange.contains(position));
      });

      if (foundTag) {
        let newPosition: Position;
        if (position.isBeforeOrEqual(foundTag.bodyRange.start)) {
          newPosition = foundTag.bodyRange.end.translate(0, 2);
        } else {
          newPosition = foundTag.tagRange.start.translate(0, 1);
        }

        editor.selection = new Selection(newPosition, newPosition);
        editor.revealRange(editor.selection);
        return;
      }
    }
  }

  window.showInformationMessage("No matching tag was found");
}