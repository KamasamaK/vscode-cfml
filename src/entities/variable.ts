import { DataType } from "./dataType";
import { Scope } from "./scope";
import { Location, TextDocument, Range, Uri } from "vscode";
import { getCfScriptRanges, isCfcFile } from "../utils/contextUtil";
import { Component } from "./component";
import { UserFunction, UserFunctionSignature, Argument } from "./userFunction";
import { getComponent } from "../features/cachedEntities";
import { equalsIgnoreCase } from "../utils/textUtil";
import { MyMap, MySet } from "../utils/collections";
import { parseAttributes, Attributes } from "./attribute";

// Mistakenly matches implicit struct key assignments using = since '{' can also open a code block. Also matches within string or comment.
const cfscriptVariableAssignmentPattern = /((?:^|[;{}]|\bfor\s*\()\s*(\bvar\s+)?(?:(application|arguments|attributes|caller|cffile|cgi|client|cookie|flash|form|local|request|server|session|static|this|thistag|thread|url|variables)\s*(?:\.\s*|\[\s*(['"])))?)([a-zA-Z_$][$\w]*)\4\s*\]?(?:\s*(?:\.\s*|\[\s*(['"])?)[$\w]+\6(?:\s*\])?)*\s*=[^=]/gi;
const tagVariableAssignmentPattern = /(<cfset\s+(var\s+)?(?:(application|arguments|attributes|caller|cffile|cgi|client|cookie|flash|form|local|request|server|session|static|this|thistag|thread|url|variables)\s*(?:\.\s*|\[\s*(['"])))?)([a-zA-Z_$][$\w]*)\4\s*\]?(?:\s*(?:\.\s*|\[\s*(['"])?)[$\w]+\6(?:\s*\])?)*\s*=[^=]/gi;
const tagParamPattern = /(<cfparam\s+)([^>]*)>/gi;
const scriptParamPattern = /\b(cfparam\s*\(\s*|param\s+)([^;]*);/gi;
// Does not match when a function is part of the expression
const variableExpression = /\b((application|arguments|attributes|caller|cffile|cgi|client|cookie|flash|form|local|request|server|session|static|this|thistag|thread|url|variables)\s*(?:\.\s*|\[\s*(['"])))?([a-zA-Z_$][$\w]*)\3\s*\]?(?:\s*(?:\.\s*|\[\s*(['"])?)[$\w]+\5(?:\s*\])?)*/i;
const variableExpressionPrefix = /\b((application|arguments|attributes|caller|cffile|cgi|client|cookie|flash|form|local|request|server|session|static|this|thistag|thread|url|variables)\s*(?:\.\s*|\[\s*(['"])))?([a-zA-Z_$][$\w]*)\3\s*\]?(?:\s*(?:\.\s*|\[\s*(['"])?)[$\w]+\5(?:\s*\])?)*\s*(?:\.\s*|\[\s*['"]?)?$/i;

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
export function parseVariables(document: TextDocument, isScript: boolean, docRange?: Range): Variable[] {
  let variables: Variable[] = [];
  let documentText: string;
  let textOffset: number;
  if (docRange && document.validateRange(docRange)) {
    documentText = document.getText(docRange);
    textOffset = document.offsetAt(docRange.start);
  } else {
    documentText = document.getText();
    textOffset = 0;
  }

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
    if (parsedAttr.has("type")) {
      paramType = DataType.paramTypeToDataType(parsedAttr.get("type").value);
    } else if (parsedAttr.has("default")) {
      paramType = DataType.inferDataTypeFromValue(parsedAttr.get("default").value);
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

    // TODO: Does not account for arguments being overridden. Does not account for variables created in attributes.
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

  if (!isScript) {
    // Check cfscript sections
    const cfScriptRanges: Range[] = getCfScriptRanges(document, docRange);
    cfScriptRanges.forEach((range: Range) => {
      const cfscriptVars = parseVariables(document, true, range);

      cfscriptVars.forEach((scriptVar: Variable) => {
        const matchingVars = getMatchingVariables(variables, scriptVar.identifier, scriptVar.scope);
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
  }

  return variables;
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

/**
 * Returns a pattern to match the prefix of an active variable expression
 */
export function getVariableExpressionPrefixPattern(): RegExp {
  return variableExpressionPrefix;
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
