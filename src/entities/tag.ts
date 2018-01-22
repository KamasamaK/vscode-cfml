import { DataType } from "./dataType";
import { TextDocument, Range } from "vscode";
import { Attributes, parseAttributes } from "./attribute";
import { DocumentStateContext } from "../utils/documentUtil";

const cfTagAttributePattern: RegExp = /<((cf[a-z_]+)\s+)([^<>]*)$/i;
const cfScriptTagAttributePattern: RegExp = /\b((cf[a-z_]+)\s*\(\s*)([^)]*)$/i;
const tagPrefixPattern: RegExp = /<\s*\/?\s*$/;

export interface Tag {
  name: string;
  attributes: Attributes;
  tagRange: Range;
  bodyText?: string;
  bodyRange?: Range;
}

export interface OpenTag {
  name: string;
  attributes: Attributes;
}

export const nonClosingTags: string[] =
[
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

export const nonIndentingTags: string[] =
[
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

export const decreasingIndentingTags: string[] =
[
  "cfelse",
  "cfelseif"
];

export interface TagOutputAttribute {
  attributeName: string;
  dataType: DataType;
}

export interface OutputVariableTags {
  [name: string]: TagOutputAttribute[];
}

/*
export const outputVariableTags: OutputVariableTags =
{
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
  // cfloop types are conditional
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
};
*/

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
 */
export function getTagPrefixPattern(): RegExp {
  return tagPrefixPattern;
}

/**
 * Returns a pattern that matches tags with the given name. Nested tags of the same name will not be correctly selected.
 * Capture groups
 * 1: Name/Prefix
 * 2: Attributes
 * 3: Body
 * @param tagName The name of the tag to capture
 */
export function getTagPattern(tagName: string): RegExp {
  return new RegExp(`(<${tagName}\\s*)([^>]*?)(?:>([\\s\\S]*?)<\\/${tagName}>|\\/?>)`, "gi");
}

/**
 * Returns a pattern that matches tags with the given name.
 * Capture groups
 * 1: Name/Prefix
 * 2: Attributes
 * @param tagName The name of the tag to capture
 */
export function getOpenTagPattern(tagName: string): RegExp {
  return new RegExp(`(<${tagName}\\s*)([^>]*?)>`, "gi");
}

/**
 * Returns a pattern that matches all CF tags.
 * Capture groups
 * 1: Prefix
 * 2: Name
 * 3: Attributes
 * 4: Body
 */
export function getCfTagPattern(): RegExp {
  return /(<(cf[a-z_]+)\s*)([^>]*?)(?:>([\s\S]*?)<\/\2>|\/?>)/gi;
}

/**
 * Returns a pattern that matches CF tags ignoring a body.
 * Capture groups
 * 1: Prefix
 * 2: Name
 * 3: Attributes
 */
export function getCfOpenTagPattern(): RegExp {
  return /(<(cf[a-z_]+)\s*)([^>]*?)>/gi;
}

/**
 * Returns a pattern that matches all CFScript tags.
 * Capture groups
 * 1: Prefix
 * 2: Name
 * 3: Attributes
 * 4: Body
 */
export function getCfScriptTagPattern(): RegExp {
  return /\b((cf[a-z_]+)\s*\(\s*)([^)]*)\)(?:\s*{([^}]*?)})?/gi;
}

/**
 * Returns a pattern that matches all CFScript tags ignoring a body.
 * Capture groups
 * 1: Prefix
 * 2: Name
 * 3: Attributes
 */
export function getCfScriptTagPatternIgnoreBody(): RegExp {
  return /\b((cf[a-z_]+)\s*\(\s*)([^)]*)\)/gi;
}

/**
 * Returns all of the information for the given tag name in the given document, optionally within a given range
 * @param documentStateContext The document to check
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
    if (tagBodyText) {
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
      bodyText: tagBodyText,
      bodyRange: tagBodyRange
    });
  }

  return tags;
}


/**
 * Returns the opening tag information for the given tag name in the given document, optionally within a given range
 * @param documentStateContext The document to check
 * @param tagName The name of the tag to capture
 * @param range Range within which to check
 */
export function parseOpenTags(documentStateContext: DocumentStateContext, tagName: string, range?: Range): OpenTag[] {
  let openTags: OpenTag[] = [];
  const document: TextDocument = documentStateContext.document;
  let textOffset: number = 0;
  let documentText: string = documentStateContext.sanitizedDocumentText;
  if (range && document.validateRange(range)) {
    textOffset = document.offsetAt(range.start);
    documentText = documentText.slice(textOffset, document.offsetAt(range.end));
  }

  const thisTagPattern: RegExp = getOpenTagPattern(tagName);
  let thisTagMatch: RegExpExecArray = null;
  while (thisTagMatch = thisTagPattern.exec(documentText)) {
    const tagStart: string = thisTagMatch[1];
    const tagAttributes: string = thisTagMatch[2];

    const attributeStartOffset: number = textOffset + thisTagMatch.index + tagStart.length;
    const attributeRange: Range = new Range(
      document.positionAt(attributeStartOffset),
      document.positionAt(attributeStartOffset + tagAttributes.length)
    );

    openTags.push({
      name: tagName,
      attributes: parseAttributes(document, attributeRange)
    });
  }

  return openTags;
}