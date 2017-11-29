import { DataType } from "./dataType";
import { Scope } from "./scope";
import { Location, TextDocument, Range, Uri, Position } from "vscode";
import { getCfScriptRanges, isCfcFile, getCommentRanges } from "../utils/contextUtil";
import { Component } from "./component";
import { UserFunction, UserFunctionSignature, Argument } from "./userFunction";
import { getComponent } from "../features/cachedEntities";
import { equalsIgnoreCase, replaceRangeWithSpaces } from "../utils/textUtil";
import { MyMap, MySet } from "../utils/collections";
import { parseAttributes, Attributes } from "./attribute";
import { getTagPattern, outputVariableTags, TagOutputAttribute } from "./tag";

// Erroneously matches implicit struct key assignments using = since '{' can also open a code block. Also matches within string or comment.
const cfscriptVariableAssignmentPattern = /((?:^|[;{}]|\bfor\s*\()\s*(\bvar\s+)?(?:(application|arguments|attributes|caller|cffile|cgi|client|cookie|flash|form|local|request|server|session|static|this|thistag|thread|url|variables)\s*(?:\.\s*|\[\s*(['"])))?)([a-zA-Z_$][$\w]*)\4\s*\]?(?:\s*(?:\.\s*|\[\s*(['"])?)[$\w]+\6(?:\s*\])?)*\s*=\s*([^=][^;]*)/gi;
const tagVariableAssignmentPattern = /(<cfset\s+(var\s+)?(?:(application|arguments|attributes|caller|cffile|cgi|client|cookie|flash|form|local|request|server|session|static|this|thistag|thread|url|variables)\s*(?:\.\s*|\[\s*(['"])))?)([a-zA-Z_$][$\w]*)\4\s*\]?(?:\s*(?:\.\s*|\[\s*(['"])?)[$\w]+\6(?:\s*\])?)*\s*=\s*([^=][^>]*)/gi;
const tagParamPattern =  getTagPattern("cfparam");
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
export function parseVariableAssignments(document: TextDocument, isScript: boolean, docRange?: Range): Variable[] {
  let variables: Variable[] = [];
  const documentUri: Uri = document.uri;
  let textOffset: number = 0;
  let documentText: string = replaceRangeWithSpaces(document, getCommentRanges(document, isScript));

  if (docRange && document.validateRange(docRange)) {
    textOffset = document.offsetAt(docRange.start);
    documentText = documentText.substring(textOffset, document.offsetAt(docRange.end));
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
  let outputVariableMatch: RegExpExecArray = null;
  const paramPattern: RegExp = isScript ? scriptParamPattern : tagParamPattern;
  while (outputVariableMatch = paramPattern.exec(documentText)) {
    const paramPrefix: string = outputVariableMatch[1];
    const paramAttr: string = outputVariableMatch[2];

    const paramAttributeRange = new Range(
      document.positionAt(textOffset + outputVariableMatch.index + paramPrefix.length),
      document.positionAt(textOffset + outputVariableMatch.index + paramPrefix.length + paramAttr.length)
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

  if (!isScript) {
    // Tags with output attributes
    for (let tagName in outputVariableTags) {
      const tagOutputAttributes: TagOutputAttribute[] = outputVariableTags[tagName];
      let outputVariableMatch: RegExpExecArray = null;
      const outputVariablePattern: RegExp = getTagPattern(tagName);
      while (outputVariableMatch = outputVariablePattern.exec(documentText)) {
        const outputTagPrefix: string = outputVariableMatch[1];
        const outputTagAttr: string = outputVariableMatch[2];

        const outputTagAttributeRange = new Range(
          document.positionAt(textOffset + outputVariableMatch.index + outputTagPrefix.length),
          document.positionAt(textOffset + outputVariableMatch.index + outputTagPrefix.length + outputTagAttr.length)
        );

        const parsedAttr: Attributes = parseAttributes(document, outputTagAttributeRange);

        tagOutputAttributes.filter((tagOutputAttribute: TagOutputAttribute) => {
          return parsedAttr.has(tagOutputAttribute.attributeName);
        }).forEach((tagOutputAttribute: TagOutputAttribute) => {
          const attributeName: string = tagOutputAttribute.attributeName;
          const attributeVal: string = parsedAttr.get(attributeName).value;
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

          const varRangeStart: Position = parsedAttr.get(attributeName).valueRange.start.translate(0, varNamePrefixLen);
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

          variables.push({
            identifier: varName,
            dataType: tagOutputAttribute.dataType,
            scope: scopeVal,
            declarationLocation: new Location(
              document.uri,
              varRange
            )
          });
        });
      }
    }

    // Check cfscript sections
    const cfScriptRanges: Range[] = getCfScriptRanges(document, docRange);
    cfScriptRanges.forEach((range: Range) => {
      const cfscriptVars: Variable[] = parseVariableAssignments(document, true, range);

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
