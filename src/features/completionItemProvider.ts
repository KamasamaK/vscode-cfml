import * as fs from "fs";
import * as path from "path";
import { CancellationToken, CompletionContext, CompletionItem, CompletionItemKind, CompletionItemProvider, Position, Range, SnippetString, TextDocument, WorkspaceConfiguration, workspace, Uri } from "vscode";
import { Snippet, snippets } from "../cfmlMain";
import { Attributes, IncludeAttributesSetType, VALUE_PATTERN, parseAttributes, IncludeAttributesCustom } from "../entities/attribute";
import { CatchInfo, catchProperties, parseCatches } from "../entities/catch";
import { cgiVariables } from "../entities/cgi";
import { COMPONENT_EXT, Component, componentDottedPathPrefix, componentExtendsPathPrefix, isInComponentHead, isSubcomponentOrEqual } from "../entities/component";
import { DataType } from "../entities/dataType";
import { getSyntaxString } from "../entities/function";
import { GlobalEntity, GlobalFunction, GlobalFunctions, GlobalTag, GlobalTags, constructTagSnippet, globalTagSyntaxToScript } from "../entities/globals";
import { keywords, KeywordDetails } from "../entities/keyword";
import { Parameter } from "../entities/parameter";
import { getImplicitFunctions } from "../entities/property";
import { isQuery, queryObjectProperties } from "../entities/query";
import { Scope, getValidScopesPrefixPattern, getVariableScopePrefixPattern, scopes, unscopedPrecedence } from "../entities/scope";
import { Signature } from "../entities/signature";
import { getCfScriptTagAttributePattern, getCfTagAttributePattern, getTagPrefixPattern } from "../entities/tag";
import { Access, ComponentFunctions, UserFunction, inlineScriptFunctionPattern } from "../entities/userFunction";
import { Variable, getApplicationVariables, getServerVariables, getVariablePrefixPattern, usesConstantConvention, getMatchingVariables, collectDocumentVariableAssignments, getBestMatchingVariable, getVariableExpressionPrefixPattern } from "../entities/variable";
import { CFMLEngine } from "../utils/cfdocs/cfmlEngine";
import { MyMap, MySet } from "../utils/collections";
import { getCfScriptRanges, isInRanges } from "../utils/contextUtil";
import { DocumentPositionStateContext, getDocumentPositionStateContext } from "../utils/documentUtil";
import { CFMLMapping, filterComponents, filterDirectories, resolveDottedPaths, resolveRootPath } from "../utils/fileUtil";
import { equalsIgnoreCase, textToMarkdownString, escapeMarkdown } from "../utils/textUtil";
import { getAllGlobalFunctions, getAllGlobalTags, getComponent, getGlobalTag } from "./cachedEntities";

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

    const documentUri: Uri = document.uri;

    const cfmlCompletionSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml.suggest", documentUri);
    const shouldProvideCompletions = cfmlCompletionSettings.get<boolean>("enable", true);
    if (!shouldProvideCompletions) {
      return result;
    }

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
            return getGlobalEntityAttributeCompletions(completionState, globalTag, tagAttributeStartOffset, tagAttributesLength);
          }
        }
      }
    }

    // TODO: Global function attributes in CF2018+ and Lucee (don't return)

    if (docIsCfcFile && isInComponentHead(documentPositionStateContext)) {
      // extends and implements path completion. does not apply to docblock
      const componentDottedPathMatch: RegExpExecArray = componentExtendsPathPrefix.exec(docPrefix);
      if (componentDottedPathMatch) {
        const componentDottedPath: string = componentDottedPathMatch[3];
        const parentDottedPath: string = componentDottedPath.split(".").slice(0, -1).join(".");

        return getDottedPathCompletions(completionState, parentDottedPath);
      }
    }

    // Snippets
    const shouldProvideSnippetItems = cfmlCompletionSettings.get<boolean>("snippets.enable", true);
    if (shouldProvideSnippetItems && !isContinuingExpression) {
      const excludedSnippetItems = cfmlCompletionSettings.get<string[]>("snippets.exclude", []);
      const snippetCompletions: CompletionItem[] = getStandardSnippetCompletions(completionState, excludedSnippetItems);

      result = result.concat(snippetCompletions);
    }

    // Assigned document variables
    let allVariableAssignments: Variable[] = collectDocumentVariableAssignments(documentPositionStateContext);

    // TODO: Add struct keys?

    // Application variables
    const applicationDocVariables: Variable[] = await getApplicationVariables(documentUri);
    allVariableAssignments = allVariableAssignments.concat(applicationDocVariables.filter((variable: Variable) => {
      return getMatchingVariables(allVariableAssignments, variable.identifier, variable.scope).length === 0;
    }));

    // Server variables
    const serverDocVariables: Variable[] = getServerVariables(documentUri);
    allVariableAssignments = allVariableAssignments.concat(serverDocVariables.filter((variable: Variable) => {
      return getMatchingVariables(allVariableAssignments, variable.identifier, variable.scope).length === 0;
    }));

    // Variable completions
    result = result.concat(getVariableCompletions(completionState, allVariableAssignments));

    // Catch variable
    const catchInfoArr: CatchInfo[] = parseCatches(documentPositionStateContext, documentPositionStateContext.docIsScript);
    const applicableCatches: CatchInfo[] = catchInfoArr.filter((catchInfo: CatchInfo) => {
      return catchInfo.bodyRange.contains(position);
    });

    if (applicableCatches.length > 0) {
      const closestCatch: CatchInfo = applicableCatches.pop();
      if (!isContinuingExpression && currentWordMatches(closestCatch.variableName)) {
        result.push(createNewProposal(
          closestCatch.variableName,
          CompletionItemKind.Struct,
          {
            detail: closestCatch.variableName,
            description: "A structure that contains information about the exception"
          }
        ));
      }

      if (getVariablePrefixPattern(closestCatch.variableName).test(docPrefix)) {
        for (let propName in catchProperties) {
          const catchProp = catchProperties[propName];
          if (currentWordMatches(propName) && (catchProp.appliesToTypes === undefined || catchProp.appliesToTypes.includes(closestCatch.type.toLowerCase()))) {
            result.push(createNewProposal(propName, CompletionItemKind.Property, catchProp));
          }
        }
      }

      // TODO: rethrow
    }

    // CGI variables
    if (getValidScopesPrefixPattern([Scope.CGI], false).test(docPrefix)) {
      for (let name in cgiVariables) {
        if (currentWordMatches(name)) {
          result.push(createNewProposal(name, CompletionItemKind.Property, cgiVariables[name]));
        }
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

    // External user/member functions
    const varPrefixMatch: RegExpExecArray = getVariableExpressionPrefixPattern().exec(docPrefix);
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
          let addedFunctions: MySet<string> = new MySet();
          let baseComponent: Component = getComponent(thisComponent.extends);
          let currComponent: Component = baseComponent;
          while (currComponent) {
            currComponent.functions.filter((func: UserFunction, funcKey: string) => {
              return currentWordMatches(funcKey) && !addedFunctions.has(funcKey);
            }).forEach((func: UserFunction, funcKey: string) => {
              addedFunctions.add(funcKey);
              result.push(createNewProposal(
                func.name, CompletionItemKind.Function, { detail: `(function) ${currComponent.name}.${getSyntaxString(func)}`, description: func.description }
              ));
            });

            const implicitFunctions: ComponentFunctions = getImplicitFunctions(currComponent, false);
            implicitFunctions.filter((implFunc: UserFunction, funcKey: string) => {
              return !addedFunctions.has(funcKey) && currentWordMatches(funcKey);
            }).forEach((implFunc: UserFunction, funcKey: string) => {
              addedFunctions.add(funcKey);
              const firstPart: string = implFunc.name.slice(0, 3);
              const completionType = firstPart === "get" ? "getter" : "setter";
              result.push(createNewProposal(implFunc.name, CompletionItemKind.Function, {
                detail: `(${completionType}) ${currComponent.name}.${getSyntaxString(implFunc)}`,
                description: implFunc.description
              }));
            });

            if (currComponent.extends) {
              currComponent = getComponent(currComponent.extends);
            } else {
              currComponent = undefined;
            }
          }
        // From variable
        } else {
          const scopeVal: Scope = varScope ? Scope.valueOf(varScope) : undefined;
          const foundVar: Variable = getBestMatchingVariable(allVariableAssignments, varName, scopeVal);

          if (foundVar) {
            // User functions
            if (foundVar.dataTypeComponentUri) {
              let addedFunctions: MySet<string> = new MySet();
              const initialFoundComp: Component = getComponent(foundVar.dataTypeComponentUri);

              let validFunctionAccess: MySet<Access> = new MySet([Access.Remote, Access.Public]);
              if (thisComponent) {
                if (isSubcomponentOrEqual(thisComponent, initialFoundComp)) {
                  validFunctionAccess.add(Access.Private);
                  validFunctionAccess.add(Access.Package);
                }
              }
              if (!validFunctionAccess.has(Access.Package) && path.dirname(documentUri.fsPath) === path.dirname(initialFoundComp.uri.fsPath)) {
                validFunctionAccess.add(Access.Package);
              }

              let foundComponent: Component = initialFoundComp;
              while (foundComponent) {
                foundComponent.functions.filter((func: UserFunction, funcKey: string) => {
                  return currentWordMatches(funcKey)
                    && validFunctionAccess.has(func.access)
                    && !addedFunctions.has(funcKey);
                }).forEach((func: UserFunction, funcKey: string) => {
                  addedFunctions.add(funcKey);
                  result.push(createNewProposal(
                    func.name, CompletionItemKind.Function, { detail: `(function) ${foundComponent.name}.${getSyntaxString(func)}`, description: func.description }
                  ));
                });

                const implicitFunctions: ComponentFunctions = getImplicitFunctions(foundComponent, false);
                implicitFunctions.filter((implFunc: UserFunction, funcKey: string) => {
                  return !addedFunctions.has(funcKey) && currentWordMatches(funcKey);
                }).forEach((implFunc: UserFunction, funcKey: string) => {
                  addedFunctions.add(funcKey);
                  const firstPart: string = implFunc.name.slice(0, 3);
                  const completionType = firstPart === "get" ? "getter" : "setter";
                  result.push(createNewProposal(implFunc.name, CompletionItemKind.Function, {
                    detail: `(${completionType}) ${foundComponent.name}.${getSyntaxString(implFunc)}`,
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
    const shouldProvideGFItems: boolean = cfmlCompletionSettings.get<boolean>("globalFunctions.enable", true);
    if (shouldProvideGFItems) {
      const globalFunctionCompletions: CompletionItem[] = getGlobalFunctionCompletions(completionState);
      result = result.concat(globalFunctionCompletions);
    }

    // Global tags
    const shouldProvideGTItems: boolean = cfmlCompletionSettings.get<boolean>("globalTags.enable", true);
    if (shouldProvideGTItems) {
      const globalTagCompletions: CompletionItem[] = positionIsCfScript ? getGlobalTagScriptCompletions(completionState) : getGlobalTagCompletions(completionState);
      result = result.concat(globalTagCompletions);
    }

    // Keywords
    if (!isContinuingExpression) {
      for (let name in keywords) {
        const keyword: KeywordDetails = keywords[name];
        if (currentWordMatches(name) && (!keyword.onlyScript || positionIsCfScript)) {
          result.push(createNewProposal(name, CompletionItemKind.Keyword, keyword));
        }
      }
      if (thisComponent && thisComponent.extends) {
        result.push(createNewProposal("super", CompletionItemKind.Keyword, { description: "Reference to the base component" }));
      }
    }

    // Scopes
    if (!isContinuingExpression) {
      // TODO: Filter by engine
      for (let name in scopes) {
        if (currentWordMatches(name)) {
          result.push(createNewProposal(name, CompletionItemKind.Struct, scopes[name]));
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

function getGlobalEntityAttributeCompletions(state: CompletionState, globalEntity: GlobalEntity, attributeStartOffset: number, attributesLength: number): CompletionItem[] {
  let attributeDocs: MyMap<string, Parameter> = new MyMap<string, Parameter>();
  globalEntity.signatures.forEach((sig: Signature) => {
    sig.parameters.forEach((param: Parameter) => {
      attributeDocs.set(param.name.toLowerCase(), param);
    });
  });
  const attributeNames: MySet<string> = new MySet(attributeDocs.keys());
  const tagAttributeRange = new Range(state.document.positionAt(attributeStartOffset), state.document.positionAt(attributeStartOffset + attributesLength));
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

function getStandardSnippetCompletions(state: CompletionState, excludedSnippetItems: string[] = []): CompletionItem[] {
  // TODO: Check context
  let snippetCompletions: CompletionItem[] = [];
  for (let key in snippets) {
    if (!excludedSnippetItems.includes(key)) {
      let snippet: Snippet = snippets[key];
      if (state.currentWordMatches(snippet.prefix)) {
        let standardSnippet = new CompletionItem(snippet.prefix, CompletionItemKind.Snippet);
        standardSnippet.detail = snippet.description;
        const snippetString: string = Array.isArray(snippet.body) ? snippet.body.join("\n") : snippet.body;
        // standardSnippet.documentation = snippetString;
        standardSnippet.insertText = new SnippetString(snippetString);
        snippetCompletions.push(standardSnippet);
      }
    }
  }

  return snippetCompletions;
}

/*
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
*/

function getVariableCompletions(state: CompletionState, variables: Variable[]): CompletionItem[] {
  let variableCompletions: CompletionItem[] = [];

  const variableScopePrefixPattern: RegExp = getVariableScopePrefixPattern();
  const variableScopePrefixMatch: RegExpExecArray = variableScopePrefixPattern.exec(state.docPrefix);
  if (variableScopePrefixMatch) {
    const scopePrefix: string = variableScopePrefixMatch[1];

    variableCompletions = variables.filter((variable: Variable) => {
      if (!state.currentWordMatches(variable.identifier)) {
        return false;
      }

      if (scopePrefix) {
        const currentScope: Scope = Scope.valueOf(scopePrefix);
        return (variable.scope === currentScope || (variable.scope === Scope.Unknown && unscopedPrecedence.includes(currentScope)));
      }

      return (unscopedPrecedence.includes(variable.scope) || variable.scope === Scope.Unknown);
    }).map((variable: Variable) => {
      const kind: CompletionItemKind = usesConstantConvention(variable.identifier) ? CompletionItemKind.Constant : CompletionItemKind.Variable;
      let varType: string = variable.dataType;
      if (variable.dataTypeComponentUri) {
        varType = path.basename(variable.dataTypeComponentUri.fsPath, COMPONENT_EXT);
      }

      return createNewProposal(variable.identifier, kind, { detail: `(${variable.scope}) ${variable.identifier}: ${varType}`, description: variable.description });
    });
  }

  return variableCompletions;
}

function getComponentFunctionCompletions(state: CompletionState, component: Component): CompletionItem[] {
  let componentFunctionCompletions: CompletionItem[] = [];
  if (component) {
    let addedFunctions: MySet<string> = new MySet();
    const privateAccessPrefixMatched: boolean = getValidScopesPrefixPattern([Scope.Variables], true).test(state.docPrefix);
    const otherAccessPrefixMatched: boolean = getValidScopesPrefixPattern([Scope.Variables, Scope.This], true).test(state.docPrefix);
    const getterSetterPrefixMatched: boolean = getValidScopesPrefixPattern([Scope.This], true).test(state.docPrefix);
    let currComponent: Component = component;
    while (currComponent) {
      currComponent.functions.filter((func: UserFunction, funcKey: string) => {
        const hasValidScopes: boolean = func.access === Access.Private ? privateAccessPrefixMatched : otherAccessPrefixMatched;
        return (hasValidScopes && state.currentWordMatches(funcKey) && !addedFunctions.has(funcKey));
      }).forEach((func: UserFunction, funcKey: string) => {
        addedFunctions.add(funcKey);
        componentFunctionCompletions.push(
          createNewProposal(func.name, CompletionItemKind.Function, { detail: `(function) ${currComponent.name}.${getSyntaxString(func)}`, description: func.description }));
      });

      if (getterSetterPrefixMatched) {
        const implicitFunctions: ComponentFunctions = getImplicitFunctions(currComponent, false);
        implicitFunctions.filter((implFunc: UserFunction, funcKey: string) => {
          return !addedFunctions.has(funcKey) && state.currentWordMatches(funcKey);
        }).forEach((implFunc: UserFunction, funcKey: string) => {
          const firstPart: string = implFunc.name.slice(0, 3);
          const completionType = firstPart === "get" ? "getter" : "setter";
          componentFunctionCompletions.push(createNewProposal(implFunc.name, CompletionItemKind.Function, {
            detail: `(${completionType}) ${currComponent.name}.${getSyntaxString(implFunc)}`,
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
        let functionDetail = globalFunction.syntax;
        if (!functionDetail.startsWith("function ")) {
          functionDetail = "function " + globalFunction.syntax;
        }
        globalFunctionCompletions.push(
          createNewProposal(
            globalFunction.name,
            CompletionItemKind.Function,
            { detail: globalFunction.syntax, description: globalFunction.description }
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
  const tagPrefixMatch: RegExpExecArray = tagPrefixPattern.exec(state.docPrefix);
  if (tagPrefixMatch) {
    const closingSlash: string = tagPrefixMatch[1];
    const cfmlGTAttributeSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml.suggest.globalTags.includeAttributes", state.document.uri);
    const cfmlGTAttributesSetType: IncludeAttributesSetType = cfmlGTAttributeSettings.get<IncludeAttributesSetType>("setType", IncludeAttributesSetType.None);
    const cfmlGTAttributesDefault: boolean = cfmlGTAttributeSettings.get<boolean>("defaultValue", false);
    const cfmlGTAttributesCustom: IncludeAttributesCustom = cfmlGTAttributeSettings.get<IncludeAttributesCustom>("custom", {});
    const globalTags: GlobalTags = getAllGlobalTags();
    for (let tagName in globalTags) {
      if (state.currentWordMatches(tagName)) {
        const globalTag: GlobalTag = globalTags[tagName];
        let thisGlobalTagCompletion: CompletionItem = createNewProposal(
          globalTag.name,
          CompletionItemKind.TypeParameter,
          { detail: globalTag.syntax, description: globalTag.description }
        );
        if (!closingSlash && (cfmlGTAttributesSetType !== IncludeAttributesSetType.None || cfmlGTAttributesCustom.hasOwnProperty(tagName))) {
          thisGlobalTagCompletion.insertText = constructTagSnippet(globalTag, cfmlGTAttributesSetType, cfmlGTAttributesCustom[tagName], cfmlGTAttributesDefault, false);
        }

        globalTagCompletions.push(thisGlobalTagCompletion);
      }
    }
  }

  return globalTagCompletions;
}

function getGlobalTagScriptCompletions(state: CompletionState): CompletionItem[] {
  let globalTagScriptCompletions: CompletionItem[] = [];

  if (state.userEngine.supportsScriptTags() && !state.isContinuingExpression) {
    const cfmlGTAttributeSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml.suggest.globalTags.includeAttributes", state.document.uri);
    const cfmlGTAttributesSetType: IncludeAttributesSetType = cfmlGTAttributeSettings.get<IncludeAttributesSetType>("setType", IncludeAttributesSetType.None);
    const cfmlGTAttributesDefault: boolean = cfmlGTAttributeSettings.get<boolean>("defaultValue", false);
    const cfmlGTAttributesCustom: IncludeAttributesCustom = cfmlGTAttributeSettings.get<IncludeAttributesCustom>("custom", {});
    const globalTags: GlobalTags = getAllGlobalTags();
    for (let tagName in globalTags) {
      // TODO: Filter tags not available in script
      if (state.currentWordMatches(tagName)) {
        const globalTag: GlobalTag = globalTags[tagName];
        let thisGlobalTagScriptCompletion: CompletionItem = createNewProposal(
          globalTag.name,
          CompletionItemKind.Function,
          { detail: globalTagSyntaxToScript(globalTag), description: globalTag.description }
        );
        if (cfmlGTAttributesSetType !== IncludeAttributesSetType.None || cfmlGTAttributesCustom.hasOwnProperty(tagName)) {
          thisGlobalTagScriptCompletion.insertText = constructTagSnippet(globalTag, cfmlGTAttributesSetType, cfmlGTAttributesCustom[tagName], cfmlGTAttributesDefault, true);
        }

        globalTagScriptCompletions.push(thisGlobalTagScriptCompletion);
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
    const directories: string[] = filterDirectories(files, thisPath);
    directories.filter((directory: string) => {
      return state.currentWordMatches(directory);
    }).forEach((directory: string) => {
      newInstanceCompletions.push(createNewProposal(
        directory,
        CompletionItemKind.Folder,
        { detail: `(folder) ${directory}`, description: escapeMarkdown(path.join(thisPath, directory)) }
      ));
    });
    const componentFiles: string[] = filterComponents(files);
    componentFiles.filter((componentFile: string) => {
      const componentName: string = path.basename(componentFile, COMPONENT_EXT);
      return state.currentWordMatches(componentName);
    }).forEach((componentFile: string) => {
      const componentName: string = path.basename(componentFile, COMPONENT_EXT);
      newInstanceCompletions.push(createNewProposal(
        componentName,
        CompletionItemKind.Class,
        { detail: `(component) ${componentName}`, description: escapeMarkdown(path.join(thisPath, componentFile)) }
      ));
    });
  });

  // custom mappings
  const cfmlMappings: CFMLMapping[] = workspace.getConfiguration("cfml", state.document.uri).get<CFMLMapping[]>("mappings", []);
  const splitParentPath: string[] = parentDottedPath === "" ? [] : parentDottedPath.split(".");
  for (let cfmlMapping of cfmlMappings) {
    const slicedLogicalPath: string = cfmlMapping.logicalPath.slice(1);
    const splitLogicalPath: string[] = slicedLogicalPath.split("/");

    if (splitParentPath.length >= splitLogicalPath.length) {
      continue;
    }

    const invalidPath: boolean = splitParentPath.some((parentPathPart: string, idx: number) => {
      return parentPathPart !== splitLogicalPath[idx];
    });

    if (invalidPath) {
      continue;
    }

    const completionName: string = splitLogicalPath[splitParentPath.length];

    let completionEntry: CompletionEntry;
    let dottedLogicalPath: string = splitLogicalPath.slice(0, splitParentPath.length + 1).join(".");
    if (splitLogicalPath.length - splitParentPath.length === 1) {
      const directoryPath: string = cfmlMapping.isPhysicalDirectoryPath === undefined || cfmlMapping.isPhysicalDirectoryPath ? cfmlMapping.directoryPath : resolveRootPath(state.document.uri, cfmlMapping.directoryPath);
      completionEntry = { detail: `(mapping) ${dottedLogicalPath}`, description: escapeMarkdown(directoryPath) };
    } else {
      completionEntry = { detail: `(partial mapping) ${dottedLogicalPath}` };
    }

    newInstanceCompletions.push(createNewProposal(
      completionName,
      CompletionItemKind.Folder,
      completionEntry
    ));
  }

  return newInstanceCompletions;
}
