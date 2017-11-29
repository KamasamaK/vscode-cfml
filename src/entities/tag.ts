import { DataType } from "./dataType";

const cfTagAttributePattern: RegExp = /<((cf[a-z_]+)\s+)([^<>]*)$/i;
const cfScriptTagAttributePattern: RegExp = /\b((cf[a-z_]+)\s*\(\s*)([^)]*)$/i;
const tagPrefixPattern: RegExp = /<\s*\/?\s*$/;

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
  "cfdocument": [
    {
      attributeName: "name",
      dataType: DataType.Binary
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
  // cfobject excluded and handled elsewhere
  "cfpdf": [
    {
      attributeName: "name",
      dataType: DataType.Binary
    },
  ],
  "cfprocparam": [
    {
      attributeName: "variable",
      dataType: DataType.Any
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


/**
 * Returns a pattern that matches the most recent unclosed cf-tag, capturing the name and attributes
 */
export function getCfTagPattern(): RegExp {
  return cfTagAttributePattern;
}

/**
 * Returns a pattern that matches the most recent unclosed script cf-tag, capturing the name and attributes
 */
export function getCfScriptTagPattern(): RegExp {
  return cfScriptTagAttributePattern;
}

/**
 * Gets a pattern that matches a tag prefix
 */
export function getTagPrefixPattern(): RegExp {
  return tagPrefixPattern;
}

/**
 * Returns a pattern that matches tags with the given name
 * @param tagName The name of the tag to capture
 * @param hasBody Whether this tag has a body
 */
export function getTagPattern(tagName: string): RegExp {
  return new RegExp(`(<${tagName}\\s*)([^>]*?)(?:>([\\s\\S]*?)<\\/${tagName}>|\\/?>)`, "gi");
}
