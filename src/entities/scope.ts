export enum Scope {
  Application="application",
  Arguments="arguments",
  Attributes="attributes",
  Caller="caller",
  Cffile="cffile",
  CGI="cgi",
  Client="client",
  Cookie="cookie",
  Flash="flash",
  Form="form",
  Local="local",
  Request="request",
  Server="server",
  Session="session",
  Static="static", // Lucee-only
  This="this",
  ThisTag="thistag",
  Thread="thread",
  ThreadLocal="threadlocal", // Not a real prefix
  URL="url",
  Unknown="unknown", // Not a real scope. Use as default.
  Variables="variables"
}

export namespace Scope {
  /**
   * Resolves a string value of scope to an enumeration member
   * @param scope The scope string to resolve
   */
  export function valueOf(scope: string): Scope {
    switch (scope.toLowerCase()) {
      case "application":
        return Scope.Application;
      case "arguments":
        return Scope.Arguments;
      case "attributes":
        return Scope.Attributes;
      case "caller":
        return Scope.Caller;
      case "cffile":
        return Scope.Cffile;
      case "cgi":
        return Scope.CGI;
      case "client":
        return Scope.Client;
      case "cookie":
        return Scope.Cookie;
      case "flash":
        return Scope.Flash;
      case "form":
        return Scope.Form;
      case "local":
        return Scope.Local;
      case "request":
        return Scope.Request;
      case "server":
        return Scope.Server;
      case "session":
        return Scope.Session;
      case "static":
        return Scope.Static;
      case "this":
        return Scope.This;
      case "thistag":
        return Scope.ThisTag;
      case "thread":
        return Scope.Thread;
      case "url":
        return Scope.URL;
      case "variables":
        return Scope.Variables;
      default:
        return Scope.Unknown;
    }
  }
}

export const allScopes: Scope[] = [
  Scope.Application,
  Scope.Arguments,
  Scope.Attributes,
  Scope.Caller,
  Scope.Cffile,
  Scope.CGI,
  Scope.Client,
  Scope.Cookie,
  Scope.Flash,
  Scope.Form,
  Scope.Local,
  Scope.Request,
  Scope.Server,
  Scope.Session,
  Scope.Static,
  Scope.This,
  Scope.ThisTag,
  Scope.Thread,
  Scope.URL,
  Scope.Variables
];

export const unscopedPrecedence: Scope[] = [
  Scope.Local,
  Scope.Arguments,
  Scope.ThreadLocal,
  // Query (not a true scope; variables in query loops)
  Scope.Thread,
  Scope.Variables,
  Scope.CGI,
  Scope.Cffile,
  Scope.URL,
  Scope.Form,
  Scope.Cookie,
  Scope.Client
];

interface ScopeDetails {
  detail: string;
  description: string;
  prefixRequired: boolean;
}

interface Scopes {
  [scope: string]: ScopeDetails;
}

export const scopes: Scopes = {
  "application": {
    detail: "(scope) application",
    description: "Contains variables that are associated with one, named application on a server. The cfapplication tag name attribute or the Application.cfc This.name variable setting specifies the application name.",
    prefixRequired: true
  },
  "arguments": {
    detail: "(scope) arguments",
    description: "Variables passed in a call to a user-defined function or ColdFusion component method.",
    prefixRequired: false
  },
  "attributes": {
    detail: "(scope) attributes",
    description: "Used only in custom tag pages and threads. Contains the values passed by the calling page or cfthread tag in the tag's attributes.",
    prefixRequired: true
  },
  "caller": {
    detail: "(scope) caller",
    description: "Used only in custom tag pages. The custom tag's Caller scope is a reference to the calling page's Variables scope. Any variables that you create or change in the custom tag page using the Caller scope are visible in the calling page's Variables scope.",
    prefixRequired: false
  },
  "cffile": {
    detail: "(scope) cffile",
    description: "Used to access the properties of a cffile object after an invocation of cffile.",
    prefixRequired: true
  },
  "cgi": {
    detail: "(scope) cgi",
    description: "Contains environment variables identifying the context in which a page was requested. The variables available depend on the browser and server software.",
    prefixRequired: true
  },
  "client": {
    detail: "(scope) client",
    description: "Contains variables that are associated with one client. Client variables let you maintain state as a user moves from page to page in an application, and are available across browser sessions. By default, Client variables are stored in the system registry, but you can store them in a cookie or a database. Client variables cannot be complex data types and can include periods in their names.",
    prefixRequired: false
  },
  "cookie": {
    detail: "(scope) cookie",
    description: "Contains variables maintained in a user's browser as cookies. Cookies are typically stored in a file on the browser, so they are available across browser sessions and applications. You can create memory-only Cookie variables, which are not available after the user closes the browser. Cookie scope variable names can include periods.",
    prefixRequired: false
  },
  "flash": {
    detail: "(scope) flash",
    description: "Variables sent by a SWF movie to ColdFusion and returned by ColdFusion to the movie. For more information, see Using the Flash Remoting Service.",
    prefixRequired: true
  },
  "form": {
    detail: "(scope) form",
    description: "Contains variables passed from a Form page to its action page as the result of submitting the form. (If you use the HTML form tag, you must use post method.)",
    prefixRequired: false
  },
  "local": {
    detail: "(scope) local",
    description: "Contains variables that are declared inside a user-defined function or ColdFusion component method and exist only while a function executes.",
    prefixRequired: false
  },
  "request": {
    detail: "(scope) request",
    description: "Used to hold data that must be available for the duration of one HTTP request. The Request scope is available to all pages, including custom tags and nested custom tags, that are processed in response to the request. This scope is useful for nested (child/parent) tags. This scope can often be used in place of the Application scope, to avoid the need for locking variables.",
    prefixRequired: true
  },
  "server": {
    detail: "(scope) server",
    description: "Contains variables that are associated with the current ColdFusion server. This scope lets you define variables that are available to all your ColdFusion pages, across multiple applications.",
    prefixRequired: true
  },
  "session": {
    detail: "(scope) session",
    description: "Contains variables that are associated with one client and persist only as long as the client maintains a session. They are stored in the server's memory and can be set to time out after a period of inactivity.",
    prefixRequired: true
  },
  // Lucee-only
  "static": {
    detail: "(scope) static",
    description: "(Lucee-only) For use with functions and variables within a ColdFusion component that do not belong to an instantiated object.",
    prefixRequired: true
  },
  "this": {
    detail: "(scope) this",
    description: "Exists only in ColdFusion components or cffunction tags that are part of a containing object such as a ColdFusion Struct. Exists for the duration of the component instance or containing object. Data in the This scope is accessible from outside the component or container by using the instance or object name as a prefix.",
    prefixRequired: true
  },
  "thisTag": {
    detail: "(scope) thisTag",
    description: "Used only in custom tag pages. The ThisTag scope is active for the current invocation of the tag. If a custom tag contains a nested tag, any ThisTag scope values you set before calling the nested tag are preserved when the nested tag returns to the calling tag. The ThisTag scope includes three built-in variables that identify the tag's execution mode, contain the tag's generated contents, and indicate whether the tag has an end tag.A nested custom tag can use the cfassociate tag to return values to the calling tag's ThisTag scope.",
    prefixRequired: true
  },
  "thread": {
    detail: "(scope) thread",
    description: "Variables that are created and changed inside a ColdFusion thread, but can be read by all code on the page that creates the thread. Each thread has a Thread scope that is a subscope of a cfthread scope.",
    prefixRequired: false
  },
  "url": {
    detail: "(scope) url",
    description: "Contains parameters passed to the current page in the URL that is used to call it. The parameters are appended to the URL in the format ?variablename1=value&variablename2=value...",
    prefixRequired: false
  },
  "variables": {
    detail: "(scope) variables",
    description: "The default scope for variables of any type that are created with the cfset and cfparam tags. A Variables scope variable is available only on the page on which it is created and any included pages (see also the Caller scope). Variables scope variables created in a CFC are available only to the component and its functions, and not to the page that instantiates the component or calls its functions.",
    prefixRequired: false
  },
};

/**
 * Returns a regular expression that optionally captures a valid scope
 * @param scopes An array of scopes to include
 * @param optionalScope Whether the scope is optional
 */
export function getValidScopesPrefixPattern(scopes: Scope[], optionalScope: boolean = true) {
  const validScopes: string = scopes.join("|");
  let pattern: string = `(?:^|[^.\\s])\\s*(?:\\b(${validScopes})\\s*\\.\\s*)`;
  if (optionalScope) {
    pattern += "?";
  }

  return new RegExp(pattern + "$", "i");
}

/**
 * Returns a regular expression that matches a scoped variable
 */
export function getVariableScopePrefixPattern() {
   return getValidScopesPrefixPattern(allScopes, true);
}
