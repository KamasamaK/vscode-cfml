const cfTagAttributePattern = /<((cf[a-z_]+)\s+)([^<>]*)$/i;

export const nonClosingTags =
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

export const nonIndentingTags =
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

export const decreasingIndentingTags =
[
  "cfelse",
  "cfelseif"
];


/**
 * Returns a pattern that matches the most recent unclosed cf-tag, capturing the name and attributes
 */
export function getCfTagPattern(): RegExp {
  return cfTagAttributePattern;
}

/**
 * Returns a pattern that matches tags with the given name
 * @param tagName The name of the tag to capture
 * @param hasBody Whether this tag has a body
 */
export function getTagPattern(tagName: string, hasBody: boolean = false): RegExp {
  let pattern: string = `<(${tagName}\s+)([^>]*)`;
  if (hasBody) {
    pattern += `>([\s\S]*?)<\/${tagName}>`;
  } else {
    pattern += "\/?>";
  }
  return new RegExp(pattern, "gi");
}
