import { CompletionItemProvider, CompletionItem, CompletionItemKind, CancellationToken, TextDocument, Position, Range,
  workspace, WorkspaceConfiguration, Uri, SnippetString, CompletionContext } from "vscode";
import { equalsIgnoreCase, textToMarkdownString } from "../utils/textUtil";
import { keywords } from "../entities/keyword";
import { cgiVariables } from "../entities/cgi";
import { cfcatchProperties, cfcatchPropertyPrefixPattern } from "../entities/cfcatch";
import { getAllGlobalFunctions, getAllGlobalTags, getComponent, getGlobalTag } from "./cachedEntities";
import { GlobalFunction, GlobalTag, GlobalFunctions, GlobalTags, globalTagSyntaxToScript } from "../entities/globals";
import { inlineScriptFunctionPattern, UserFunction, UserFunctionSignature, Argument, Access, getLocalVariables, ComponentFunctions } from "../entities/userFunction";
import { getSyntaxString } from "../entities/function";
import { Signature } from "../entities/signature";
import { Component, COMPONENT_EXT, componentDottedPathPrefix } from "../entities/component";
import * as path from "path";
import { getCfScriptRanges, isInRanges } from "../utils/contextUtil";
import { usesConstantConvention, parseVariableAssignments, Variable, propertiesToVariables, argumentsToVariables, variableExpressionPrefix, getApplicationVariables } from "../entities/variable";
import { scopes, Scope, getValidScopesPrefixPattern, getVariableScopePrefixPattern, unscopedPrecedence } from "../entities/scope";
import { Property, Properties, getImplicitFunctions } from "../entities/property";
import { snippets, Snippet } from "../cfmlMain";
import { parseAttributes, Attributes, VALUE_PATTERN } from "../entities/attribute";
import { Parameter } from "../entities/parameter";
import { MyMap, MySet } from "../utils/collections";
import { getCfTagAttributePattern, getCfScriptTagAttributePattern, getTagPrefixPattern } from "../entities/tag";
import { CFMLEngine } from "../utils/cfdocs/cfmlEngine";
import { DataType } from "../entities/dataType";
import { isQuery, queryObjectProperties } from "../entities/query";
import { resolveDottedPaths, filterDirectories, filterComponents } from "../utils/fileUtil";
import * as fs from "fs";
import { DocumentPositionStateContext, getDocumentPositionStateContext } from "../utils/documentUtil";

export interface CompletionEntry {
  detail?: string;
  description?: string;
}

function matches(word: string, name: string): boolean {
  return word.length === 0 || (name.length >= word.length && equalsIgnoreCase(name.substr(0, word.length), word));
}

function createNewProposal(name: string, kind: CompletionItemKind, entry?: CompletionEntry): CompletionItem {
  const proposal: CompletionItem = new CompletionItem(name, kind);
  if (entry) {
    if (entry.description) {
      proposal.documentation = textToMarkdownString(entry.description);
    }
    if (entry.detail) {
      proposal.detail = entry.detail;
    }
  }

  return proposal;
}

interface CompletionState extends DocumentPositionStateContext {
  completionContext: CompletionContext;
  cfmlCompletionSettings: WorkspaceConfiguration;
  currentWordMatches: (name: string) => boolean;
}

export default class CFMLCompletionItemProvider implements CompletionItemProvider {

  /**
   * Provide completion items for the given position and document.
   * @param document The document in which the command was invoked.
   * @param position The position at which the command was invoked.
   * @param token A cancellation token.
   */
  public async provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext): Promise<CompletionItem[]> {
    let result: CompletionItem[] = [];

    const cfmlCompletionSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml.suggest");
    const shouldProvideCompletions = cfmlCompletionSettings.get<boolean>("enable", true);
    if (!shouldProvideCompletions) {
      return result;
    }

    const documentUri: Uri = document.uri;
    const cfscriptRanges: Range[] = getCfScriptRanges(document);

    const documentPositionStateContext: DocumentPositionStateContext = getDocumentPositionStateContext(document, position);

    const currentWordMatches = (name: string): boolean => {
      return matches(documentPositionStateContext.currentWord, name);
    };

    const completionState: CompletionState = Object.assign(documentPositionStateContext,
      {
        completionContext: context,
        cfmlCompletionSettings: cfmlCompletionSettings,
        currentWordMatches: currentWordMatches
      }
    );

    const userEngine: CFMLEngine = completionState.userEngine;
    const docIsCfmFile: boolean = completionState.isCfmFile;
    const docIsCfcFile: boolean = completionState.isCfcFile;
    const thisComponent: Component = completionState.component;
    const sanitizedDocumentText: string = completionState.sanitizedDocumentText;
    const positionIsCfScript: boolean = completionState.positionIsScript;
    const docPrefix: string = completionState.docPrefix;
    const isContinuingExpression: boolean = completionState.isContinuingExpression;

    if (completionState.positionInComment) {
      return result;
    }

    // Global tag attributes
    if (!positionIsCfScript || userEngine.supportsScriptTags()) {
      const ignoredTags: string[] = ["cfset", "cfif", "cfelseif", "cfreturn"];
      const cfTagAttributePattern: RegExp = positionIsCfScript ? getCfScriptTagAttributePattern() : getCfTagAttributePattern();
      const cfTagAttributeMatch: RegExpExecArray = cfTagAttributePattern.exec(docPrefix);
      if (cfTagAttributeMatch) {
        const cfTagAttributeMatchOffset: number = cfTagAttributeMatch.index;
        const tagAttributePrefix: string = cfTagAttributeMatch[1];
        const tagAttributeStartOffset: number = cfTagAttributeMatchOffset + tagAttributePrefix.length;
        const tagName: string = cfTagAttributeMatch[2];
        const tagAttributesLength: number = cfTagAttributeMatch[3].length;
        const globalTag: GlobalTag = getGlobalTag(tagName);
        if (!ignoredTags.includes(tagName) && globalTag) {
          const attributeValueMatch: RegExpExecArray = VALUE_PATTERN.exec(docPrefix);
          if (attributeValueMatch) {
            const attributeName: string = attributeValueMatch[1];
            const attributeValueCompletions: CompletionItem[] = getGlobalTagAttributeValueCompletions(completionState, globalTag, attributeName);
            if (attributeValueCompletions.length > 0) {
              return attributeValueCompletions;
            }
          } else {
            return getGlobalTagAttributeCompletions(completionState, globalTag, tagAttributeStartOffset, tagAttributesLength);
          }
        }
      }
    }

    // Snippets
    const shouldProvideSnippetItems = cfmlCompletionSettings.get<boolean>("snippets.enable", true);
    if (shouldProvideSnippetItems && !isContinuingExpression) {
      const excludedSnippetItems = cfmlCompletionSettings.get<string[]>("snippets.exclude", []);
      const snippetCompletions: CompletionItem[] = getSnippetCompletions(completionState, excludedSnippetItems);

      result = result.concat(snippetCompletions);
    }

    // TODO: Add struct keys? Invoke collectVariableAssignments instead?
    // Assigned variables
    let allVariableAssignments: Variable[] = [];
    if (docIsCfmFile) {
      const docVariableAssignments: Variable[] = parseVariableAssignments(documentPositionStateContext, false);
      allVariableAssignments = allVariableAssignments.concat(docVariableAssignments);

      const variableScopePrefixPattern: RegExp = getVariableScopePrefixPattern();
      const variableScopePrefixMatch: RegExpExecArray = variableScopePrefixPattern.exec(docPrefix);
      if (variableScopePrefixMatch) {
        const validScope: string = variableScopePrefixMatch[1];
        const docVariableCompletions: CompletionItem[] = getTemplateVariableCompletions(completionState, docVariableAssignments, validScope);

        result = result.concat(docVariableCompletions);
      }
    } else if (docIsCfcFile) {
      if (thisComponent) {
        // properties
        const componentProperties: Properties = thisComponent.properties;
        allVariableAssignments = allVariableAssignments.concat(propertiesToVariables(componentProperties, documentUri));

        let componentPropertyCompletions: CompletionItem[] = getComponentPropertyCompletions(completionState, componentProperties, thisComponent);
        result = result.concat(componentPropertyCompletions);

        // component variables
        let currComponent: Component = thisComponent;
        let componentVariables: Variable[] = [];
        while (currComponent) {
          const currComponentVariables: Variable[] = currComponent.variables.filter((variable: Variable) => {
            return !componentVariables.some((existingVariable: Variable) => {
              return existingVariable.scope === variable.scope && equalsIgnoreCase(existingVariable.identifier, variable.identifier);
            });
          });
          componentVariables = componentVariables.concat(currComponentVariables);
          allVariableAssignments = allVariableAssignments.concat(componentVariables);
          const compVarPrefixPattern = getValidScopesPrefixPattern([Scope.Variables, Scope.This], true);
          if (compVarPrefixPattern.test(docPrefix)) {
            const componentVariableCompletions: CompletionItem[] = getComponentVariableCompletions(completionState, componentVariables);
            result = result.concat(componentVariableCompletions);
          }

          if (currComponent.extends) {
            currComponent = getComponent(currComponent.extends);
          } else {
            currComponent = undefined;
          }
        }

        // function arguments
        let functionArgs: Argument[] = [];
        thisComponent.functions.filter((func: UserFunction) => {
          return func.bodyRange.contains(position) && func.signatures && func.signatures.length !== 0;
        }).forEach((func: UserFunction) => {
          func.signatures.forEach((signature: UserFunctionSignature) => {
            functionArgs = signature.parameters;
          });
        });
        allVariableAssignments = allVariableAssignments.concat(argumentsToVariables(functionArgs, documentUri));
        const functionArgCompletions: CompletionItem[] = getFunctionArgumentCompletions(completionState, functionArgs);
        result = result.concat(functionArgCompletions);

        // function local variables
        let localVariables: Variable[] = [];
        thisComponent.functions.filter((func: UserFunction) => {
          return func.bodyRange.contains(position);
        }).forEach((func: UserFunction) => {
          localVariables = localVariables.concat(getLocalVariables(func, documentPositionStateContext, thisComponent.isScript));
        });
        allVariableAssignments = allVariableAssignments.concat(localVariables);
        const localVariableCompletions: CompletionItem[] = getLocalVariableCompletions(completionState, localVariables);
        result = result.concat(localVariableCompletions);
      }
    }

    // Document user functions
    if (docIsCfmFile && !isContinuingExpression) {
      // TODO: Add more info. Add check for tag function. Check scope.
      let functionMatch: RegExpExecArray = null;
      while (functionMatch = inlineScriptFunctionPattern.exec(sanitizedDocumentText)) {
        const functionPos: Position = document.positionAt(functionMatch.index);
        if (isInRanges(cfscriptRanges, functionPos)) {
          const word1: string = functionMatch[1];
          let added = new MySet<string>();
          if (word1 && currentWordMatches(word1) && !added.has(word1)) {
            added.add(word1);
            result.push(createNewProposal(word1, CompletionItemKind.Function, { detail: `(function) ${word1}(...)` }));
          }
          const word2: string = functionMatch[2];
          if (word2 && currentWordMatches(word2) && !added.has(word2)) {
            added.add(word2);
            result.push(createNewProposal(word2, CompletionItemKind.Function, { detail: `(function) ${word2}(...)` }));
          }
        }
      }
    } else if (docIsCfcFile) {
      const componentFunctionCompletions: CompletionItem[] = getComponentFunctionCompletions(completionState, thisComponent);
      result = result.concat(componentFunctionCompletions);
    }

    // TODO: Replace regex check with variable references range check
    // External user/member functions
    const varPrefixMatch: RegExpExecArray = variableExpressionPrefix.exec(docPrefix);
    if (varPrefixMatch) {
      const varMatchText: string = varPrefixMatch[0];
      const varScope: string = varPrefixMatch[2];
      const varQuote: string = varPrefixMatch[3];
      const varName: string = varPrefixMatch[4];

      let dotSeparatedCount = 2;
      if (varScope && !varQuote) {
        dotSeparatedCount++;
      }

      if (varMatchText.split(".").length === dotSeparatedCount) {
        // From super keyword
        if (docIsCfcFile && !varScope && equalsIgnoreCase(varName, "super")) {
          // Ensure not to duplicate overridden functions
          let addedFunctions: MySet<string> = new MySet();
          let baseComponent: Component = getComponent(thisComponent.extends);
          while (baseComponent) {
            baseComponent.functions.filter((func: UserFunction, funcKey: string) => {
              return currentWordMatches(func.name) && !addedFunctions.has(funcKey);
            }).forEach((func: UserFunction, funcKey: string) => {
              addedFunctions.add(funcKey);
              result.push(createNewProposal(
                func.name, CompletionItemKind.Function, { detail: `(function) ${baseComponent.name}.${getSyntaxString(func)}`, description: func.description }
              ));
            });

            if (baseComponent.extends) {
              baseComponent = getComponent(baseComponent.extends);
            } else {
              baseComponent = undefined;
            }
          }
        // From variable
        } else {
          let foundVar: Variable;

          if (varScope) {
            const scopeVal = Scope.valueOf(varScope);

            foundVar = allVariableAssignments.find((currentVar: Variable) => {
              return currentVar.scope === scopeVal && equalsIgnoreCase(currentVar.identifier, varName);
            });
          } else {
            for (let checkScope of unscopedPrecedence) {
              foundVar = allVariableAssignments.find((currentVar: Variable) => {
                return currentVar.scope === checkScope && equalsIgnoreCase(currentVar.identifier, varName);
              });
              if (foundVar) {
                break;
              }
            }
          }

          if (foundVar) {
            // User functions
            if (foundVar.dataType === DataType.Component) {
              let addedFunctions: MySet<string> = new MySet();
              const initialFoundComp: Component = getComponent(foundVar.dataTypeComponentUri);
              let foundComponent: Component = initialFoundComp;
              // Ensure not to duplicate overridden functions
              while (foundComponent) {
                foundComponent.functions.filter((func: UserFunction, funcKey: string) => {
                  // TODO: Access.Package
                  return currentWordMatches(func.name)
                    && (func.access === Access.Public || func.access === Access.Remote)
                    && !addedFunctions.has(funcKey);
                }).forEach((func: UserFunction, funcKey: string) => {
                  addedFunctions.add(funcKey);
                  result.push(createNewProposal(
                    func.name, CompletionItemKind.Function, { detail: `(function) ${initialFoundComp.name}.${getSyntaxString(func)}`, description: func.description }
                  ));
                });

                const implicitFunctions: ComponentFunctions = getImplicitFunctions(foundComponent);
                implicitFunctions.filter((implFunc: UserFunction, funcKey: string) => {
                  return !addedFunctions.has(funcKey) && currentWordMatches(funcKey);
                }).forEach((implFunc: UserFunction, funcKey: string) => {
                  const firstPart: string = implFunc.name.slice(0, 3);
                  const completionType = firstPart === "get" ? "getter" : "setter";
                  result.push(createNewProposal(implFunc.name, CompletionItemKind.Function, {
                    detail: `(${completionType}) ${initialFoundComp.name}.${getSyntaxString(implFunc)}`,
                    description: implFunc.description
                  }));
                });

                if (foundComponent.extends) {
                  foundComponent = getComponent(foundComponent.extends);
                } else {
                  foundComponent = undefined;
                }
              }
            } else {
              if (foundVar.dataType === DataType.Query) {
                if (isQuery(foundVar)) {
                  foundVar.selectColumnNames.filter((column: string) => {
                    return currentWordMatches(column);
                  }).forEach((column: string) => {
                    result.push(createNewProposal(
                      column, CompletionItemKind.EnumMember, { detail: `(query column) ${column}` }
                    ));
                  });
                }

                for (let queryPropertyName in queryObjectProperties) {
                  const queryProperty = queryObjectProperties[queryPropertyName];
                  result.push(createNewProposal(
                    queryPropertyName, CompletionItemKind.Property, { detail: queryProperty.detail, description: queryProperty.description }
                  ));
                }
              }

              // TODO: Add member functions based on foundVar.dataType
            }
          }
        }
      }
    }

    // Global functions
    const shouldProvideGFItems = cfmlCompletionSettings.get<boolean>("globalFunctions.enable", true);
    if (shouldProvideGFItems) {
      const globalFunctionCompletions: CompletionItem[] = getGlobalFunctionCompletions(completionState);
      result = result.concat(globalFunctionCompletions);
    }

    // Global tags
    const globalTagCompletions: CompletionItem[] = getGlobalTagCompletions(completionState);
    result = result.concat(globalTagCompletions);

    // Global tags as functions
    const globalTagAsFunctionCompletions: CompletionItem[] = getGlobalTagScriptCompletions(completionState);
    result = result.concat(globalTagAsFunctionCompletions);

    // Keywords
    if (!isContinuingExpression) {
      for (let name in keywords) {
        if (currentWordMatches(name)) {
          result.push(createNewProposal(name, CompletionItemKind.Keyword, keywords[name]));
        }
      }
      if (thisComponent && thisComponent.extends) {
        result.push(createNewProposal("super", CompletionItemKind.Keyword, { description: "Reference to the base component" }));
      }
    }

    // Scopes
    if (!isContinuingExpression) {
      for (let name in scopes) {
        if (currentWordMatches(name)) {
          result.push(createNewProposal(name, CompletionItemKind.Struct, scopes[name]));
        }
      }
    }

    // Application variables
    if (getValidScopesPrefixPattern([Scope.Application], false).test(docPrefix)) {
      const applicationDocVariables: Variable[] = await getApplicationVariables(document.uri);
      const applicationVariableCompletions: CompletionItem[] = applicationDocVariables.filter((variable: Variable) => {
        return variable.scope === Scope.Application && currentWordMatches(variable.identifier);
      }).map((variable: Variable) => {
        let varType: string = variable.dataType;
        if (variable.dataTypeComponentUri) {
          varType = path.basename(variable.dataTypeComponentUri.fsPath, COMPONENT_EXT);
        }
        return createNewProposal(variable.identifier, CompletionItemKind.Variable, { detail: `(${variable.scope}) ${variable.identifier}: ${varType}` });
      });

      result = result.concat(applicationVariableCompletions);
    }

    // CGI variables
    if (getValidScopesPrefixPattern([Scope.CGI], false).test(docPrefix)) {
      for (let name in cgiVariables) {
        if (currentWordMatches(name)) {
          result.push(createNewProposal(name, CompletionItemKind.Property, cgiVariables[name]));
        }
      }
    }

    // cfcatch variables
    if (cfcatchPropertyPrefixPattern.test(docPrefix)) {
      for (let name in cfcatchProperties) {
        if (currentWordMatches(name)) {
          result.push(createNewProposal(name, CompletionItemKind.Property, cfcatchProperties[name]));
        }
      }
    }

    // Component instantiation
    const componentDottedPathMatch: RegExpExecArray = componentDottedPathPrefix.exec(docPrefix);
    if (componentDottedPathMatch) {
      const componentDottedPath: string = componentDottedPathMatch[3];
      const parentDottedPath: string = componentDottedPath.split(".").slice(0, -1).join(".");

      const newInstanceCompletions: CompletionItem[] = getDottedPathCompletions(completionState, parentDottedPath);
      result = result.concat(newInstanceCompletions);
    }

    return result;
  }
}

function getGlobalTagAttributeCompletions(state: CompletionState, globalTag: GlobalTag, tagAttributeStartOffset: number, tagAttributesLength: number): CompletionItem[] {
  let attributeDocs: MyMap<string, Parameter> = new MyMap<string, Parameter>();
  globalTag.signatures.forEach((sig: Signature) => {
    sig.parameters.forEach((param: Parameter) => {
      attributeDocs.set(param.name.toLowerCase(), param);
    });
  });
  const attributeNames: MySet<string> = new MySet(attributeDocs.keys());
  const tagAttributeRange = new Range(state.document.positionAt(tagAttributeStartOffset), state.document.positionAt(tagAttributeStartOffset + tagAttributesLength));
  const parsedAttributes: Attributes = parseAttributes(state.document, tagAttributeRange, attributeNames);
  const usedAttributeNames: MySet<string> = new MySet(parsedAttributes.keys());
  const attributeCompletions: CompletionItem[] = getTagAttributeCompletions(state, attributeDocs, usedAttributeNames);

  return attributeCompletions;
}

function getTagAttributeCompletions(state: CompletionState, attributeDocs: MyMap<string, Parameter>, usedAttributeNames: MySet<string>): CompletionItem[] {
  const attributeCompletions: CompletionItem[] = Array.from(attributeDocs.values()).filter((param: Parameter) => {
    return !usedAttributeNames.has(param.name.toLowerCase()) && state.currentWordMatches(param.name);
  }).map((param: Parameter) => {
    let attributeItem = new CompletionItem(param.name, CompletionItemKind.Property);
    attributeItem.detail = `${param.required ? "(required) " : ""}${param.name}: ${param.dataType}`;
    attributeItem.documentation = param.description;
    attributeItem.insertText = param.name + "=";

    return attributeItem;
  });

  return attributeCompletions;
}

function getGlobalTagAttributeValueCompletions(state: CompletionState, globalTag: GlobalTag, attributeName: string): CompletionItem[] {
  let attrValCompletions: CompletionItem[] = [];

  let attributeDocs: MyMap<string, Parameter> = new MyMap<string, Parameter>();
  globalTag.signatures.forEach((sig: Signature) => {
    sig.parameters.forEach((param: Parameter) => {
      attributeDocs.set(param.name.toLowerCase(), param);
    });
  });

  const param: Parameter = attributeDocs.get(attributeName);
  if (param) {
    // Enumerated values
    const enumeratedValues: string[] = param.enumeratedValues;
    if (enumeratedValues) {
      enumeratedValues.forEach((enumVal: string) => {
        if (state.currentWordMatches(enumVal)) {
          attrValCompletions.push(new CompletionItem(enumVal, CompletionItemKind.Unit));
        }
      });
    }

    // TODO: Check if attribute uses or assigns variables
  }

  return attrValCompletions;
}

function getSnippetCompletions(state: CompletionState, excludedSnippetItems: string[] = []): CompletionItem[] {
  // TODO: Check context
  let snippetCompletions: CompletionItem[] = [];
  for (let key in snippets) {
    if (!excludedSnippetItems.includes(key)) {
      let snippet: Snippet = snippets[key];
      if (state.currentWordMatches(snippet.prefix)) {
        let componentSnippet = new CompletionItem(snippet.prefix, CompletionItemKind.Snippet);
        componentSnippet.detail = snippet.description;
        const snippetString: string = Array.isArray(snippet.body) ? snippet.body.join("\n") : snippet.body;
        // componentSnippet.documentation = snippetString;
        componentSnippet.insertText = new SnippetString(snippetString);
        snippetCompletions.push(componentSnippet);
      }
    }
  }

  return snippetCompletions;
}

function getTemplateVariableCompletions(state: CompletionState, docVariableAssignments: Variable[], validScope: string): CompletionItem[] {
  const docVariableCompletions: CompletionItem[] = docVariableAssignments.filter((variable: Variable) => {
    if (!state.currentWordMatches(variable.identifier)) {
      return false;
    }
    if (validScope) {
      const currentScope: Scope = Scope.valueOf(validScope);
      return [currentScope, Scope.Unknown].includes(variable.scope);
    }

    return true;
  }).map((variable: Variable) => {
    const kind: CompletionItemKind = usesConstantConvention(variable.identifier) ? CompletionItemKind.Constant : CompletionItemKind.Variable;
    let varType: string = variable.dataType;
    if (variable.dataTypeComponentUri) {
      varType = path.basename(variable.dataTypeComponentUri.fsPath, COMPONENT_EXT);
    }

    return createNewProposal(variable.identifier, kind, { detail: `(${variable.scope}) ${variable.identifier}: ${varType}`, description: variable.description });
  });

  return docVariableCompletions;
}

function getComponentPropertyCompletions(state: CompletionState, componentProperties: Properties, thisComponent: Component): CompletionItem[] {
  let componentPropertyCompletions: CompletionItem[] = [];
  componentProperties.forEach((prop: Property) => {
    const propPrefixPattern = getValidScopesPrefixPattern([Scope.Variables], true);
    if (propPrefixPattern.test(state.docPrefix) && state.currentWordMatches(prop.name)) {
      let propertyType: string = prop.dataType;
      if (prop.dataTypeComponentUri) {
        propertyType = path.basename(prop.dataTypeComponentUri.fsPath, COMPONENT_EXT);
      }
      componentPropertyCompletions.push(createNewProposal(prop.name, CompletionItemKind.Property, {
        detail: `(property) ${thisComponent.name}.${prop.name}: ${propertyType}`,
        description: prop.description
      }));
    }
  });

  return componentPropertyCompletions;
}

function getComponentVariableCompletions(state: CompletionState, componentVariables: Variable[]): CompletionItem[] {
  return componentVariables.filter((variable: Variable) => {
    return state.currentWordMatches(variable.identifier);
  }).map((variable: Variable) => {
    const kind: CompletionItemKind = usesConstantConvention(variable.identifier) ? CompletionItemKind.Constant : CompletionItemKind.Variable;
    let varType: string = variable.dataType;
    if (variable.dataTypeComponentUri) {
      varType = path.basename(variable.dataTypeComponentUri.fsPath, COMPONENT_EXT);
    }

    return createNewProposal(variable.identifier, kind, { detail: `(${variable.scope}) ${variable.identifier}: ${varType}`, description: variable.description });
  });
}

function getLocalVariableCompletions(state: CompletionState, localVariables: Variable[]): CompletionItem[] {
  let localVariableCompletions: CompletionItem[] = [];
  const localVarPrefixPattern = getValidScopesPrefixPattern([Scope.Local], true);
  if (localVarPrefixPattern.test(state.docPrefix)) {
    localVariableCompletions = localVariables.filter((variable: Variable) => {
      return state.currentWordMatches(variable.identifier);
    }).map((variable: Variable) => {
      const kind: CompletionItemKind = usesConstantConvention(variable.identifier) ? CompletionItemKind.Constant : CompletionItemKind.Variable;
      let varType: string = variable.dataType;
      if (variable.dataTypeComponentUri) {
        varType = path.basename(variable.dataTypeComponentUri.fsPath, COMPONENT_EXT);
      }
      return createNewProposal(variable.identifier, kind, { detail: `(${variable.scope}) ${variable.identifier}: ${varType}` });
    });
  }

  return localVariableCompletions;
}

function getFunctionArgumentCompletions(state: CompletionState, functionArgs: Argument[]): CompletionItem[] {
  let functionArgCompletions: CompletionItem[] = [];
  const argPrefixPattern = getValidScopesPrefixPattern([Scope.Arguments], true);
  if (argPrefixPattern.test(state.docPrefix)) {
    functionArgCompletions = functionArgs.filter((arg: Argument) => {
      return state.currentWordMatches(arg.name);
    }).map((arg: Argument) => {
      const argName: string = arg.name;
      let argType: string = arg.dataType;
      if (arg.dataTypeComponentUri) {
        argType = path.basename(arg.dataTypeComponentUri.fsPath, COMPONENT_EXT);
      }
      const argSyntax = `(arguments) ${argName}: ${argType}`;
      const argDescription = arg.description;

      return createNewProposal(argName, CompletionItemKind.Variable, { detail: argSyntax, description: argDescription });
    });
  }

  return functionArgCompletions;
}

function getComponentFunctionCompletions(state: CompletionState, component: Component): CompletionItem[] {
  let componentFunctionCompletions: CompletionItem[] = [];
  if (component) {
    let addedFunctions: MySet<string> = new MySet();
    const getterSetterPrefixPattern = getValidScopesPrefixPattern([Scope.This], true);
    let currComponent: Component = component;
    while (currComponent) {
      currComponent.functions.filter((func: UserFunction, funcKey: string) => {
        const validScopes: Scope[] = func.access === Access.Private ? [Scope.Variables] : [Scope.Variables, Scope.This];
        const funcPrefixPattern = getValidScopesPrefixPattern(validScopes, true);
        return (funcPrefixPattern.test(state.docPrefix) && state.currentWordMatches(funcKey) && !addedFunctions.has(funcKey));
      }).forEach((func: UserFunction, funcKey: string) => {
        addedFunctions.add(funcKey);
        componentFunctionCompletions.push(
          createNewProposal(func.name, CompletionItemKind.Function, { detail: `(function) ${currComponent.name}.${getSyntaxString(func)}`, description: func.description }));
      });

      if (getterSetterPrefixPattern.test(state.docPrefix)) {
        const implicitFunctions: ComponentFunctions = getImplicitFunctions(currComponent);
        implicitFunctions.filter((implFunc: UserFunction, funcKey: string) => {
          return !addedFunctions.has(funcKey) && state.currentWordMatches(funcKey);
        }).forEach((implFunc: UserFunction, funcKey: string) => {
          const firstPart: string = implFunc.name.slice(0, 3);
          const completionType = firstPart === "get" ? "getter" : "setter";
          componentFunctionCompletions.push(createNewProposal(implFunc.name, CompletionItemKind.Function, {
            detail: `(${completionType}) ${component.name}.${getSyntaxString(implFunc)}`,
            description: implFunc.description
          }));
        });
      }

      if (currComponent.extends) {
        currComponent = getComponent(currComponent.extends);
      } else {
        currComponent = undefined;
      }
    }
  }

  return componentFunctionCompletions;
}

function getGlobalFunctionCompletions(state: CompletionState): CompletionItem[] {
  let globalFunctionCompletions: CompletionItem[] = [];
  if (!state.isContinuingExpression) {
    const globalFunctions: GlobalFunctions = getAllGlobalFunctions();
    for (let name in globalFunctions) {
      if (state.currentWordMatches(name)) {
        const globalFunction: GlobalFunction = globalFunctions[name];
        globalFunctionCompletions.push(
          createNewProposal(
            globalFunction.name,
            CompletionItemKind.Function,
            { detail: "function " + globalFunction.syntax, description: globalFunction.description }
          )
        );
      }
    }
  }

  return globalFunctionCompletions;
}

function getGlobalTagCompletions(state: CompletionState): CompletionItem[] {
  let globalTagCompletions: CompletionItem[] = [];
  const tagPrefixPattern: RegExp = getTagPrefixPattern();
  if (tagPrefixPattern.test(state.docPrefix)) {
    const globalTags: GlobalTags = getAllGlobalTags();
    for (let name in globalTags) {
      if (state.currentWordMatches(name)) {
        const globalTag: GlobalTag = globalTags[name];
        globalTagCompletions.push(
          createNewProposal(globalTag.name, CompletionItemKind.TypeParameter, { detail: globalTag.syntax, description: globalTag.description })
        );
      }
    }
  }

  return globalTagCompletions;
}

function getGlobalTagScriptCompletions(state: CompletionState): CompletionItem[] {
  let globalTagScriptCompletions: CompletionItem[] = [];
  if (state.userEngine.supportsScriptTags() && !state.isContinuingExpression) {
    const globalTags: GlobalTags = getAllGlobalTags();
    for (let name in globalTags) {
      // TODO: Filter tags not available in script
      if (state.currentWordMatches(name)) {
        const globalTag: GlobalTag = globalTags[name];
        globalTagScriptCompletions.push(
          createNewProposal(
            globalTag.name,
            CompletionItemKind.Function,
            { detail: globalTagSyntaxToScript(globalTag), description: globalTag.description }
          )
        );
      }
    }
  }

  return globalTagScriptCompletions;
}

function getDottedPathCompletions(state: CompletionState, parentDottedPath: string): CompletionItem[] {
  const newInstanceCompletions: CompletionItem[] = [];
  const paths: string[] = resolveDottedPaths(parentDottedPath, state.document.uri);
  paths.forEach((thisPath: string) => {
    const files: string[] = fs.readdirSync(thisPath);
    const directoryPaths: string[] = filterDirectories(files, thisPath);
    directoryPaths.filter((directoryPath: string) => {
      return state.currentWordMatches(path.basename(directoryPath));
    }).forEach((directoryPath: string) => {
      newInstanceCompletions.push(createNewProposal(path.basename(directoryPath), CompletionItemKind.Folder));
    });
    const componentPaths: string[] = filterComponents(files);
    componentPaths.filter((componentPath: string) => {
      return state.currentWordMatches(path.basename(componentPath, COMPONENT_EXT));
    }).forEach((componentPath: string) => {
      newInstanceCompletions.push(createNewProposal(path.basename(componentPath, COMPONENT_EXT), CompletionItemKind.Class));
    });
  });

  return newInstanceCompletions;
}
