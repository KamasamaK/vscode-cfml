import { DataType } from "./dataType";
import { Scope } from "./scope";
import { Location, TextDocument, Range, Uri, Position, WorkspaceConfiguration, workspace } from "vscode";
import { getCfScriptRanges, isCfcFile } from "../utils/contextUtil";
import { Component } from "./component";
import { UserFunction, UserFunctionSignature, Argument } from "./userFunction";
import { getComponent } from "../features/cachedEntities";
import { equalsIgnoreCase } from "../utils/textUtil";
import { MyMap, MySet } from "../utils/collections";
import { parseAttributes, Attributes } from "./attribute";
import { getTagPattern, OutputVariableTags, TagOutputAttribute, parseTags, Tag, getCfOpenTagPattern, getCfScriptTagPatternIgnoreBody, parseOpenTags, OpenTag } from "./tag";
import { Properties, Property } from "./property";
import { parseQueryText, Query, QueryColumns } from "./query";
import { CFMLEngineName, CFMLEngine } from "../utils/cfdocs/cfmlEngine";
import { DocumentStateContext } from "../utils/documentUtil";

// Erroneously matches implicit struct key assignments using = since '{' can also open a code block. Also matches within string or comment.
const cfscriptVariableAssignmentPattern = /((?:^|[;{}]|\bfor\s*\()\s*(\bvar\s+)?(?:(application|arguments|attributes|caller|cffile|cgi|client|cookie|flash|form|local|request|server|session|static|this|thistag|thread|url|variables)\s*(?:\.\s*|\[\s*(['"])))?)([a-zA-Z_$][$\w]*)\4\s*\]?(?:\s*(?:\.\s*|\[\s*(['"])?)[$\w]+\6(?:\s*\])?)*\s*=\s*([^=][^;]*)/gi;
const forInVariableAssignmentPattern = /((?:\bfor\s*\()\s*(\bvar\s+)?(?:(application|arguments|attributes|caller|cffile|cgi|client|cookie|flash|form|local|request|server|session|static|this|thistag|thread|url|variables)\s*(?:\.\s*|\[\s*(['"])))?)([a-zA-Z_$][$\w]*)\4\s*\]?(?:\s*(?:\.\s*|\[\s*(['"])?)[$\w]+\6(?:\s*\])?)*(?:\s+in\s+)/gi;
const tagVariableAssignmentPattern = /(<cfset\s+(var\s+)?(?:(application|arguments|attributes|caller|cffile|cgi|client|cookie|flash|form|local|request|server|session|static|this|thistag|thread|url|variables)\s*(?:\.\s*|\[\s*(['"])))?)([a-zA-Z_$][$\w]*)\4\s*\]?(?:\s*(?:\.\s*|\[\s*(['"])?)[$\w]+\6(?:\s*\])?)*\s*=\s*([^=][^>]*)/gi;
const tagParamPattern =  getTagPattern("cfparam");
const scriptParamPattern = /\b(cfparam\s*\(\s*|param\s+)([^;]*);/gi;
// Does not match when a function is part of the expression
const variableExpression = /\b((application|arguments|attributes|caller|cffile|cgi|client|cookie|flash|form|local|request|server|session|static|this|thistag|thread|url|variables)\s*(?:\.\s*|\[\s*(['"])))?([a-zA-Z_$][$\w]*)\3\s*\]?(?:\s*(?:\.\s*|\[\s*(['"])?)[$\w]+\5(?:\s*\])?)*/i;
export const variableExpressionPrefix = /\b((application|arguments|attributes|caller|cffile|cgi|client|cookie|flash|form|local|request|server|session|static|this|thistag|thread|url|variables)\s*(?:\.\s*|\[\s*(['"])))?([a-zA-Z_$][$\w]*)\3\s*\]?(?:\s*(?:\.\s*|\[\s*(['"])?)[$\w]+\5(?:\s*\])?)*\s*(?:\.\s*|\[\s*['"]?)?$/i;

// TODO: Import from tag.ts when bug is found/resolved
const outputVariableTags: OutputVariableTags =
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

/**
 * Checks whether the given identifier uses the constant naming convention
 * @param ident The identifier to test
 */
export function usesConstantConvention(ident: string): boolean {
  return ident === ident.toUpperCase();
}

/**
 * Returns all of the variables declared
 * @param document The document to check
 * @param isScript Whether this document or range is defined entirely in CFScript
 * @param docRange Range within which to check
 */
export function parseVariableAssignments(documentStateContext: DocumentStateContext, isScript: boolean, docRange?: Range): Variable[] {
  let variables: Variable[] = [];
  const document: TextDocument = documentStateContext.document;
  const documentUri: Uri = document.uri;
  let textOffset: number = 0;
  let documentText: string = documentStateContext.sanitizedDocumentText;

  if (docRange && document.validateRange(docRange)) {
    textOffset = document.offsetAt(docRange.start);
    documentText = documentText.slice(textOffset, document.offsetAt(docRange.end));
  }

  const cfmlEngineSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml.engine");
  const userEngineName: CFMLEngineName = CFMLEngineName.valueOf(cfmlEngineSettings.get<string>("name"));
  const userEngine: CFMLEngine = new CFMLEngine(userEngineName, cfmlEngineSettings.get<string>("version"));

  // Add function arguments
  if (isCfcFile(document)) {
    const comp: Component = getComponent(document.uri);
    if (comp) {
      comp.functions.forEach((func: UserFunction) => {
        if (!docRange || func.bodyRange.contains(docRange)) {
          if (func.signatures) {
            func.signatures.forEach((signature: UserFunctionSignature) => {
              signature.parameters.forEach((param: Argument) => {
                const argName: string = param.name;
                if (getMatchingVariables(variables, argName, Scope.Arguments).length === 0) {
                  variables.push({
                    identifier: argName,
                    dataType: param.dataType,
                    scope: Scope.Arguments,
                    description: param.description,
                    declarationLocation: new Location(
                      document.uri,
                      param.nameRange
                    )
                  });
                }
              });
            });
          }
        }
      });
    }
  }

  // params
  let paramMatch: RegExpExecArray = null;
  const paramPattern: RegExp = isScript ? scriptParamPattern : tagParamPattern;
  while (paramMatch = paramPattern.exec(documentText)) {
    const paramPrefix: string = paramMatch[1];
    const paramAttr: string = paramMatch[2];

    const paramAttributeRange = new Range(
      document.positionAt(textOffset + paramMatch.index + paramPrefix.length),
      document.positionAt(textOffset + paramMatch.index + paramPrefix.length + paramAttr.length)
    );

    const parsedAttr: Attributes = parseAttributes(document, paramAttributeRange);
    if (!parsedAttr.has("name")) {
      continue;
    }

    let paramType: DataType = DataType.Any;
    let paramTypeComponentUri: Uri = undefined;
    if (parsedAttr.has("type")) {
      paramType = DataType.paramTypeToDataType(parsedAttr.get("type").value);
    } else if (parsedAttr.has("default")) {
      const inferredType: [DataType, Uri] = DataType.inferDataTypeFromValue(parsedAttr.get("default").value, documentUri);
      paramType = inferredType[0];
      paramTypeComponentUri = inferredType[1];
    }

    const paramName = parsedAttr.get("name").value;
    const paramNameMatch = variableExpression.exec(paramName);
    if (!paramNameMatch) {
      continue;
    }
    const varNamePrefix: string = paramNameMatch[1];
    const varNamePrefixLen: number = varNamePrefix ? varNamePrefix.length : 0;
    const scope: string = paramNameMatch[2];
    const varName: string = paramNameMatch[4];

    let scopeVal: Scope = Scope.Unknown;
    if (scope) {
      scopeVal = Scope.valueOf(scope);
    }

    const varRangeStart = parsedAttr.get("name").valueRange.start.translate(0, varNamePrefixLen);
    const varRange = new Range(
      varRangeStart,
      varRangeStart.translate(0, varName.length)
    );

    const matchingVars = getMatchingVariables(variables, varName, scopeVal);
    if (matchingVars.length > 0) {
      if (matchingVars.length > 1 || matchingVars[0].declarationLocation.range.start.isBefore(varRange.start)) {
        continue;
      } else {
        // Remove entry
        variables = variables.filter((variable: Variable) => {
          return variable !== matchingVars[0];
        });
      }
    }

    variables.push({
      identifier: varName,
      dataType: paramType,
      dataTypeComponentUri: paramTypeComponentUri,
      scope: scopeVal,
      declarationLocation: new Location(
        document.uri,
        varRange
      )
    });
  }

  // variable assignments
  let variableMatch: RegExpExecArray = null;
  const variableAssignmentPattern: RegExp = isScript ? cfscriptVariableAssignmentPattern : tagVariableAssignmentPattern;
  while (variableMatch = variableAssignmentPattern.exec(documentText)) {
    const varPrefix: string = variableMatch[1];
    const varScope: string = variableMatch[2];
    const scope: string = variableMatch[3];
    const varName: string = variableMatch[5];
    const initValue: string = variableMatch[7];

    // TODO: Does not account for arguments being overridden.
    let scopeVal: Scope = Scope.Unknown;
    if (scope) {
      scopeVal = Scope.valueOf(scope);
    } else if (varScope) {
      scopeVal = Scope.Local;
    }

    const varMatchStartOffset = textOffset + variableMatch.index + varPrefix.length;
    const varRange = new Range(
      document.positionAt(varMatchStartOffset),
      document.positionAt(varMatchStartOffset + varName.length)
    );

    const matchingVars = getMatchingVariables(variables, varName, scopeVal);
    if (matchingVars.length > 0) {
      if (matchingVars.length > 1 || matchingVars[0].declarationLocation.range.start.isBefore(varRange.start)) {
        continue;
      } else {
        // Remove entry
        variables = variables.filter((variable: Variable) => {
          return variable !== matchingVars[0];
        });
      }
    }

    if (scopeVal === Scope.Unknown) {
      scopeVal = Scope.Variables;
    }
    const inferredType: [DataType, Uri] = DataType.inferDataTypeFromValue(initValue, documentUri);
    variables.push({
      identifier: varName,
      dataType: inferredType[0],
      dataTypeComponentUri: inferredType[1],
      scope: scopeVal,
      declarationLocation: new Location(
        document.uri,
        varRange
      )
    });
  }

  if (!isScript || userEngine.supportsScriptTags()) {
    // Tags with output attributes
    let foundOutputVarTags: MySet<string> = new MySet();
    let cfTagMatch: RegExpExecArray = null;
    const cfTagPattern: RegExp = isScript ? getCfScriptTagPatternIgnoreBody() : getCfOpenTagPattern();
    while (cfTagMatch = cfTagPattern.exec(documentText)) {
      const tagName = cfTagMatch[2].toLowerCase();
      if (!foundOutputVarTags.has(tagName) && outputVariableTags.hasOwnProperty(tagName)) {
        foundOutputVarTags.add(tagName);
      }
    }

    foundOutputVarTags.forEach((tagName: string) => {
      const tagOutputAttributes: TagOutputAttribute[] = outputVariableTags[tagName];
      const parsedOutputVariableTags: OpenTag[] = (tagName === "cfquery" ? parseTags(documentStateContext, tagName, docRange) : parseOpenTags(documentStateContext, tagName, docRange));
      parsedOutputVariableTags.forEach((tag: OpenTag) => {
        const tagAttributes: Attributes = tag.attributes;
        tagOutputAttributes.filter((tagOutputAttribute: TagOutputAttribute) => {
          return tagAttributes.has(tagOutputAttribute.attributeName);
        }).forEach((tagOutputAttribute: TagOutputAttribute) => {
          const attributeName: string = tagOutputAttribute.attributeName;
          const attributeVal: string = tagAttributes.get(attributeName).value;
          const varExpressionMatch: RegExpExecArray = variableExpression.exec(attributeVal);
          if (!varExpressionMatch) {
            return;
          }
          const varNamePrefix: string = varExpressionMatch[1];
          const varNamePrefixLen: number = varNamePrefix ? varNamePrefix.length : 0;
          const scope: string = varExpressionMatch[2];
          const varName: string = varExpressionMatch[4];

          let scopeVal: Scope = Scope.Unknown;
          if (scope) {
            scopeVal = Scope.valueOf(scope);
          }

          const varRangeStart: Position = tagAttributes.get(attributeName).valueRange.start.translate(0, varNamePrefixLen);
          const varRange = new Range(
            varRangeStart,
            varRangeStart.translate(0, varName.length)
          );

          const matchingVars: Variable[] = getMatchingVariables(variables, varName, scopeVal);
          if (matchingVars.length > 0) {
            if (matchingVars.length > 1 || matchingVars[0].declarationLocation.range.start.isBefore(varRange.start)) {
              return;
            } else {
              // Remove entry
              variables = variables.filter((variable: Variable) => {
                return variable !== matchingVars[0];
              });
            }
          }

          if (scopeVal === Scope.Unknown) {
            scopeVal = Scope.Variables;
          }

          let outputVar: Variable = {
            identifier: varName,
            dataType: tagOutputAttribute.dataType,
            scope: scopeVal,
            declarationLocation: new Location(
              document.uri,
              varRange
            )
          };

          if (tagName === "cfquery" && "bodyText" in tag) {
            const queryTag = tag as Tag;
            const columns: QueryColumns = parseQueryText(queryTag.bodyText);

            if (columns.size > 0) {
              let query: Query = outputVar as Query;
              query.selectColumnNames = columns;
              outputVar = query;
            }
          }

          variables.push(outputVar);
        });
      });
    });
  }

  if (!isScript) {
    // Check cfscript sections
    const cfScriptRanges: Range[] = getCfScriptRanges(document, docRange);
    cfScriptRanges.forEach((range: Range) => {
      const cfscriptVars: Variable[] = parseVariableAssignments(documentStateContext, true, range);

      cfscriptVars.forEach((scriptVar: Variable) => {
        const matchingVars: Variable[] = getMatchingVariables(variables, scriptVar.identifier, scriptVar.scope);
        if (matchingVars.length === 0) {
          variables.push(scriptVar);
        } else if (matchingVars.length === 1 && scriptVar.declarationLocation.range.start.isBefore(matchingVars[0].declarationLocation.range.start)) {
          // Replace entry
          const matchingIndex: number = variables.findIndex((value: Variable) => {
            return value.scope === scriptVar.scope && equalsIgnoreCase(value.identifier, scriptVar.identifier);
          });
          if (matchingIndex !== -1) {
            variables[matchingIndex] = scriptVar;
          }
        }
      });
    });
  } else {
    // Check for-in loops
    let forInVariableMatch: RegExpExecArray = null;
    while (forInVariableMatch = forInVariableAssignmentPattern.exec(documentText)) {
      const varPrefix: string = forInVariableMatch[1];
      const varScope: string = forInVariableMatch[2];
      const scope: string = forInVariableMatch[3];
      const varName: string = forInVariableMatch[5];

      let scopeVal: Scope = Scope.Unknown;
      if (scope) {
        scopeVal = Scope.valueOf(scope);
      } else if (varScope) {
        scopeVal = Scope.Local;
      }

      const varMatchStartOffset = textOffset + forInVariableMatch.index + varPrefix.length;
      const varRange = new Range(
        document.positionAt(varMatchStartOffset),
        document.positionAt(varMatchStartOffset + varName.length)
      );

      const matchingVars = getMatchingVariables(variables, varName, scopeVal);
      if (matchingVars.length > 0) {
        if (matchingVars.length > 1 || matchingVars[0].declarationLocation.range.start.isBefore(varRange.start)) {
          continue;
        } else {
          // Remove entry
          variables = variables.filter((variable: Variable) => {
            return variable !== matchingVars[0];
          });
        }
      }

      if (scopeVal === Scope.Unknown) {
        scopeVal = Scope.Variables;
      }

      variables.push({
        identifier: varName,
        dataType: DataType.Any,
        scope: scopeVal,
        declarationLocation: new Location(
          document.uri,
          varRange
        )
      });
    }
  }

  return variables;
}

/**
 * Returns Variable array representation of Properties
 * @param properties The properties of a component to convert
 */
export function propertiesToVariables(properties: Properties, uri: Uri): Variable[] {
  let propertyVars: Variable[] = [];
  properties.forEach((prop: Property) => {
    propertyVars.push(
      {
        identifier: prop.name,
        dataType: prop.dataType,
        dataTypeComponentUri: prop.dataTypeComponentUri,
        scope: Scope.Variables,
        declarationLocation: new Location(uri, prop.propertyRange),
        description: prop.description
      }
    );
  });

  return propertyVars;
}

/**
 * Returns Variable array representation of Arguments
 * @param args The arguments of a function to convert
 */
export function argumentsToVariables(args: Argument[], uri: Uri): Variable[] {
  let argVars: Variable[] = [];
  args.forEach((arg: Argument) => {
    argVars.push(
      {
        identifier: arg.name,
        dataType: arg.dataType,
        dataTypeComponentUri: arg.dataTypeComponentUri,
        scope: Scope.Arguments,
        declarationLocation: new Location(uri, arg.nameRange),
        description: arg.description
      }
    );
  });

  return argVars;
}

/**
 * Returns whether the variable was already found
 * @param variables The variables to check
 * @param varName The variable name for which to check
 * @param scope The variable's scope
 */
export function getMatchingVariables(variables: Variable[], varName: string, scope = Scope.Unknown): Variable[] {
  let checkScopes: Scope[];
  if (scope === Scope.Unknown) {
    checkScopes = [Scope.Local, Scope.Arguments, Scope.Variables, Scope.Unknown];
  } else {
    checkScopes = [scope];
  }

  return variables.filter((variable: Variable) => {
    return checkScopes.includes(variable.scope) && equalsIgnoreCase(variable.identifier, varName);
  });
}

export interface Variable {
  identifier: string;
  dataType: DataType;
  dataTypeComponentUri?: Uri; // Only when dataType is Component
  scope: Scope;
  declarationLocation: Location;
  description?: string;
}

export class Variables extends MyMap<Scope, Variable[]> { }

export interface Struct {
  keys: MySet<string>;
}
