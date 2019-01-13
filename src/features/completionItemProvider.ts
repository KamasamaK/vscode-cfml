import * as fs from "fs";
import * as path from "path";
import { CancellationToken, CompletionContext, CompletionItem, CompletionItemKind, CompletionItemProvider, Position, Range, SnippetString, TextDocument, WorkspaceConfiguration, workspace, Uri, Command } from "vscode";
import { Attributes, IncludeAttributesSetType, VALUE_PATTERN, parseAttributes, IncludeAttributesCustom, AttributeQuoteType } from "../entities/attribute";
import { CatchInfo, catchProperties, parseCatches, CatchPropertyDetails } from "../entities/catch";
import { cgiVariables } from "../entities/cgi";
import { COMPONENT_EXT, Component, componentDottedPathPrefix, componentExtendsPathPrefix, isInComponentHead, isSubcomponentOrEqual } from "../entities/component";
import { DataType } from "../entities/dataType";
import { constructSyntaxString } from "../entities/function";
import { GlobalFunction, GlobalFunctions, GlobalTag, GlobalTags, constructTagSnippet, globalTagSyntaxToScript, constructAttributeSnippet } from "../entities/globals";
import { keywords, KeywordDetails } from "../entities/keyword";
import { Parameter } from "../entities/parameter";
import { isQuery, queryObjectProperties } from "../entities/query";
import { Scope, getValidScopesPrefixPattern, getVariableScopePrefixPattern, scopes, unscopedPrecedence } from "../entities/scope";
import { Signature } from "../entities/signature";
import { getCfScriptTagAttributePattern, getCfTagAttributePattern, getTagPrefixPattern, getComponentPathAttributes, ComponentPathAttributes, getTagAttributePattern } from "../entities/tag";
import { Access, UserFunction, parseTagFunctions, parseScriptFunctions } from "../entities/userFunction";
import { Variable, getApplicationVariables, getServerVariables, getVariablePrefixPattern, usesConstantConvention, getMatchingVariables, collectDocumentVariableAssignments, getBestMatchingVariable, getVariableExpressionPrefixPattern, getVariableTypeString } from "../entities/variable";
import { CFMLEngine } from "../utils/cfdocs/cfmlEngine";
import { MyMap, MySet } from "../utils/collections";
import { getCfScriptRanges, isInRanges, isInCss } from "../utils/contextUtil";
import { DocumentPositionStateContext, getDocumentPositionStateContext } from "../utils/documentUtil";
import { CFMLMapping, filterComponents, filterDirectories, resolveDottedPaths, resolveRootPath } from "../utils/fileUtil";
import { equalsIgnoreCase, textToMarkdownString, escapeMarkdown } from "../utils/textUtil";
import { getAllGlobalFunctions, getAllGlobalTags, getComponent, getGlobalTag } from "./cachedEntities";
import { HTMLTagSpecification, HTML_TAGS, valueSets as htmlAttributeValues, constructHTMLAttributeSnippet, getHTMLAttributes, getHTMLAttributeNames } from "../entities/html/htmlTag";
import { getCssProperties, CssProperty } from "../entities/css/property";

const snippets: Snippets = require("../../snippets/snippets.json");

const triggerCompletionCommand: Command = {
  title: "Trigger Suggest",
  command: "editor.action.triggerSuggest"
};

export interface CompletionEntry {
  detail?: string;
  description?: string;
}

interface Snippets {
  [key: string]: Snippet;
}

interface Snippet {
  prefix: string;
  body: string | string[];
  description: string;
}

/**
 * Tests whether the word being completed matches a given suggestion
 * @param word The word being completed
 * @param suggestion A completion candidate to test
 */
function matches(word: string, suggestion: string): boolean {
  return word.length === 0 || (suggestion.length >= word.length && equalsIgnoreCase(suggestion.substr(0, word.length), word));
}

function createNewProposal(name: string, kind: CompletionItemKind, entry?: CompletionEntry, sortPrefix?: string): CompletionItem {
  const proposal: CompletionItem = new CompletionItem(name, kind);
  if (entry) {
    if (entry.detail) {
      proposal.detail = entry.detail;
    }
    if (entry.description) {
      proposal.documentation = textToMarkdownString(entry.description);
    }
  }
  if (sortPrefix) {
    proposal.sortText = `${sortPrefix}${name}`;
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
   * @param _token A cancellation token.
   * @param context How the completion was triggered.
   */
  public async provideCompletionItems(document: TextDocument, position: Position, _token: CancellationToken, context: CompletionContext): Promise<CompletionItem[]> {
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
        if (globalTag && !ignoredTags.includes(globalTag.name)) {
          const attributeValueMatch: RegExpExecArray = VALUE_PATTERN.exec(docPrefix);
          if (attributeValueMatch) {
            const attributeName: string = attributeValueMatch[1];
            const currentValue: string = attributeValueMatch[3] !== undefined ? attributeValueMatch[3] : attributeValueMatch[4];

            let attributeDocs: MyMap<string, Parameter> = new MyMap<string, Parameter>();
            globalTag.signatures.forEach((sig: Signature) => {
              sig.parameters.forEach((param: Parameter) => {
                attributeDocs.set(param.name.toLowerCase(), param);
              });
            });

            const attributeValueCompletions: CompletionItem[] = getGlobalTagAttributeValueCompletions(completionState, globalTag, attributeName, currentValue);
            if (attributeValueCompletions.length > 0) {
              return attributeValueCompletions;
            }
          } else {
            return getGlobalTagAttributeCompletions(completionState, globalTag, tagAttributeStartOffset, tagAttributesLength);
          }
        }
      }
    }

    // TODO: Global function attributes in CF2018+ and Lucee (don't return)

    // HTML tag attributes
    if (!positionIsCfScript) {
      const tagAttributePattern: RegExp = getTagAttributePattern();
      const tagAttributeMatch: RegExpExecArray = tagAttributePattern.exec(docPrefix);
      if (tagAttributeMatch) {
        const tagAttributeMatchOffset: number = tagAttributeMatch.index;
        const tagAttributePrefix: string = tagAttributeMatch[1];
        const tagAttributeStartOffset: number = tagAttributeMatchOffset + tagAttributePrefix.length;
        const tagName: string = tagAttributeMatch[2];
        const tagAttributesLength: number = tagAttributeMatch[3].length;
        if (HTML_TAGS.hasOwnProperty(tagName.toLowerCase())) {
          const htmlTag: HTMLTagSpecification = HTML_TAGS[tagName];
          const attributeValueMatch: RegExpExecArray = VALUE_PATTERN.exec(docPrefix);
          if (attributeValueMatch) {
            const attributeName: string = attributeValueMatch[1];
            const currentValue: string = attributeValueMatch[3] !== undefined ? attributeValueMatch[3] : attributeValueMatch[4];
            const attributeValueCompletions: CompletionItem[] = getHTMLTagAttributeValueCompletions(htmlTag, attributeName, currentValue);
            if (attributeValueCompletions.length > 0) {
              return attributeValueCompletions;
            }
          } else {
            return getHTMLTagAttributeCompletions(completionState, htmlTag, tagAttributeStartOffset, tagAttributesLength);
          }
        }
      }
    }

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
    const applicationDocVariables: Variable[] = getApplicationVariables(documentUri);
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
        for (const propName in catchProperties) {
          const catchProp: CatchPropertyDetails = catchProperties[propName];
          const catchType: string = closestCatch.type.toLowerCase();
          if (currentWordMatches(propName) && (catchType === "any" || catchProp.appliesToTypes === undefined || catchProp.appliesToTypes.includes(catchType))) {
            result.push(createNewProposal(propName, CompletionItemKind.Property, catchProp));
          }
        }
      }

      // TODO: rethrow
    }

    // CGI variables
    if (getValidScopesPrefixPattern([Scope.CGI], false).test(docPrefix)) {
      for (const name in cgiVariables) {
        if (currentWordMatches(name)) {
          result.push(createNewProposal(name, CompletionItemKind.Property, cgiVariables[name]));
        }
      }
    }

    // Document user functions
    if (docIsCfmFile) {
      if (getValidScopesPrefixPattern([Scope.Variables], true).test(docPrefix)) {
        const tagFunctions: UserFunction[] = parseTagFunctions(documentPositionStateContext);
        const scriptFunctions: UserFunction[] = parseScriptFunctions(documentPositionStateContext).filter((func: UserFunction) => {
          return isInRanges(cfscriptRanges, func.location.range.start);
        });

        const allTemplateFunctions: UserFunction[] = tagFunctions.concat(scriptFunctions);

        allTemplateFunctions.filter((func: UserFunction) => {
          return currentWordMatches(func.name);
        }).forEach((func: UserFunction) => {
          result.push(createNewProposal(
            func.name, CompletionItemKind.Function, { detail: `(function) ${constructSyntaxString(func)}`, description: func.description }
          ));
        });
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
            currComponent.functions.filter((_func: UserFunction, funcKey: string) => {
              return currentWordMatches(funcKey) && !addedFunctions.has(funcKey);
            }).forEach((func: UserFunction, funcKey: string) => {
              addedFunctions.add(funcKey);
              result.push(createNewProposal(
                func.name, CompletionItemKind.Function, { detail: `(function) ${currComponent.name}.${constructSyntaxString(func)}`, description: func.description }
              ));
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
            // From component variable
            if (foundVar.dataTypeComponentUri) {
              let addedFunctions: MySet<string> = new MySet();
              let addedVariables: MySet<string> = new MySet();
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
                // component functions
                foundComponent.functions.filter((func: UserFunction, funcKey: string) => {
                  return currentWordMatches(funcKey)
                    && validFunctionAccess.has(func.access)
                    && !addedFunctions.has(funcKey);
                }).forEach((func: UserFunction, funcKey: string) => {
                  result.push(createNewProposal(
                    func.name, CompletionItemKind.Function, { detail: `(function) ${foundComponent.name}.${constructSyntaxString(func)}`, description: func.description }
                  ));
                  addedFunctions.add(funcKey);
                });

                // component this-scoped variables
                foundComponent.variables.filter((variable: Variable) => {
                  const varKey = variable.identifier.toLowerCase();
                  return variable.scope === Scope.This
                    && !addedVariables.has(varKey);
                }).forEach((variable: Variable) => {
                  const varKey = variable.identifier.toLowerCase();
                  const varKind: CompletionItemKind = usesConstantConvention(variable.identifier) || variable.final ? CompletionItemKind.Constant : CompletionItemKind.Variable;
                  const varType: string = getVariableTypeString(variable);

                  result.push(createNewProposal(
                    variable.identifier, varKind, { detail: `(${variable.scope}) ${variable.identifier}: ${varType}`, description: variable.description }
                  ));

                  addedVariables.add(varKey);
                });

                if (foundComponent.extends) {
                  foundComponent = getComponent(foundComponent.extends);
                } else {
                  foundComponent = undefined;
                }
              }
            // From other variable type
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

                for (const queryPropertyName in queryObjectProperties) {
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

    // HTML tags
    const shouldProvideHtmlTags: boolean = cfmlCompletionSettings.get<boolean>("htmlTags.enable", true);
    if (shouldProvideHtmlTags && docIsCfmFile && !positionIsCfScript) {
      result = result.concat(getHTMLTagCompletions(completionState));
    }

    // CSS
    const shouldProvideCss: boolean = cfmlCompletionSettings.get<boolean>("css.enable", true);
    if (shouldProvideCss && docIsCfmFile && isInCss(documentPositionStateContext, position)) {
      // Properties
      if (/[{;]\s*([a-z-]*)$/i.test(docPrefix)) {
        result = result.concat(getCSSPropertyCompletions(completionState));
      }

      // TODO: Values
    }

    // Keywords
    if (!isContinuingExpression) {
      for (const name in keywords) {
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
      for (const name in scopes) {
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

/**
 * Gets a global entity's attribute as completion items
 * @param state An object representing the state of completion
 * @param globalTag The global entity that's attributes will be checked
 * @param attributeStartOffset The offset within the document that the entity's attributes start
 * @param attributesLength The length of the entity's attributes string
 */
function getGlobalTagAttributeCompletions(state: CompletionState, globalTag: GlobalTag, attributeStartOffset: number, attributesLength: number): CompletionItem[] {
  let attributeDocs: MyMap<string, Parameter> = new MyMap<string, Parameter>();
  globalTag.signatures.forEach((sig: Signature) => {
    sig.parameters.forEach((param: Parameter) => {
      attributeDocs.set(param.name.toLowerCase(), param);
    });
  });
  const attributeNames: MySet<string> = new MySet(attributeDocs.keys());
  const tagAttributeRange = new Range(state.document.positionAt(attributeStartOffset), state.document.positionAt(attributeStartOffset + attributesLength));
  const parsedAttributes: Attributes = parseAttributes(state.document, tagAttributeRange, attributeNames);
  const usedAttributeNames: MySet<string> = new MySet(parsedAttributes.keys());
  const attributeCompletions: CompletionItem[] = getCFTagAttributeCompletions(state, globalTag, Array.from(attributeDocs.values()), usedAttributeNames);

  return attributeCompletions;
}

/**
 * Gets a CF tag's attribute as completion items
 * @param state An object representing the state of completion
 * @param globalTag The global entity that's attributes will be checked
 * @param params All of the possible parameters that could be presented
 * @param usedAttributeNames The set of attribute names that are already being used
 */
function getCFTagAttributeCompletions(state: CompletionState, globalTag: GlobalTag, params: Parameter[], usedAttributeNames: MySet<string>): CompletionItem[] {
  const cfmlGTAttributesQuoteType: AttributeQuoteType = state.cfmlCompletionSettings.get<AttributeQuoteType>("globalTags.attributes.quoteType", AttributeQuoteType.Double);
  const cfmlGTAttributesDefault: boolean = state.cfmlCompletionSettings.get<boolean>("globalTags.attributes.defaultValue", false);

  const attributeCompletions: CompletionItem[] = params.filter((param: Parameter) => {
    return !usedAttributeNames.has(param.name.toLowerCase()) && state.currentWordMatches(param.name);
  }).map((param: Parameter) => {
    let attributeItem = new CompletionItem(param.name, CompletionItemKind.Property);
    attributeItem.detail = `${param.required ? "(required) " : ""}${param.name}: ${param.dataType}`;
    attributeItem.documentation = param.description;
    if (cfmlGTAttributesQuoteType === AttributeQuoteType.None) {
      attributeItem.insertText = param.name + "=";
    } else {
      attributeItem.insertText = new SnippetString(constructAttributeSnippet(param, 0, cfmlGTAttributesQuoteType, cfmlGTAttributesDefault));
    }
    attributeItem.sortText = "!" + param.name + "=";

    /* Not working. */
    const attributeValueCompletions: CompletionItem[] = getGlobalTagAttributeValueCompletions(state, globalTag, param.name.toLowerCase(), "");
    if (attributeValueCompletions.length > 0) {
      attributeItem.command = triggerCompletionCommand;
    }

    return attributeItem;
  });

  return attributeCompletions;
}

/**
 * Gets a global tag's attribute values as completion items for a given attribute
 * @param state An object representing the state of completion
 * @param globalTag The global tag that's attribute values will be checked
 * @param attributeName The name of the attribute that's values will be presented
 * @param currentValue The current value of the given attribute
 */
function getGlobalTagAttributeValueCompletions(state: CompletionState, globalTag: GlobalTag, attributeName: string, currentValue: string): CompletionItem[] {
  let attrValCompletions: CompletionItem[] = [];

  let attributeDocs: MyMap<string, Parameter> = new MyMap<string, Parameter>();
  globalTag.signatures.forEach((sig: Signature) => {
    sig.parameters.forEach((param: Parameter) => {
      attributeDocs.set(param.name.toLowerCase(), param);
    });
  });

  const param: Parameter = attributeDocs.get(attributeName);
  if (param) {
    if (param.dataType === DataType.Boolean) {
      attrValCompletions.push(createNewProposal("true", CompletionItemKind.Unit, undefined, "!!"));
      attrValCompletions.push(createNewProposal("false", CompletionItemKind.Unit, undefined, "!!"));
    } else {
      if (param.enumeratedValues) {
        param.enumeratedValues.forEach((enumVal: string) => {
          enumVal = enumVal.toString();
          if (matches(currentValue, enumVal)) {
            attrValCompletions.push(createNewProposal(enumVal, CompletionItemKind.Unit, undefined, "!!"));
          }
        });
      }
    }

    // TODO: Check if attribute uses or assigns variables
  }

  const componentPathAttributes: ComponentPathAttributes = getComponentPathAttributes();
  if (componentPathAttributes.hasOwnProperty(globalTag.name) && componentPathAttributes[globalTag.name].includes(attributeName)) {
    const parentDottedPath: string = currentValue.split(".").slice(0, -1).join(".");
    attrValCompletions = attrValCompletions.concat(getDottedPathCompletions(state, parentDottedPath));
  }

  return attrValCompletions;
}

/**
 * Gets an HTML tag's attribute as completion items
 * @param state An object representing the state of completion
 * @param htmlTag The HTML tag that's attributes will be checked
 * @param attributeStartOffset The offset within the document that the tag's attributes start
 * @param attributesLength The length of the tag's attributes string
 */
function getHTMLTagAttributeCompletions(state: CompletionState, htmlTag: HTMLTagSpecification, attributeStartOffset: number, attributesLength: number): CompletionItem[] {
  const attributeNames: MySet<string> = new MySet(getHTMLAttributeNames(htmlTag));
  const tagAttributeRange = new Range(state.document.positionAt(attributeStartOffset), state.document.positionAt(attributeStartOffset + attributesLength));
  const parsedAttributes: Attributes = parseAttributes(state.document, tagAttributeRange, attributeNames);
  const usedAttributeNames: MySet<string> = new MySet(parsedAttributes.keys());
  const unusedAttributeNames: string[] = Array.from(attributeNames).filter((attr: string) => {
    return !usedAttributeNames.has(attr.toLowerCase()) && state.currentWordMatches(attr);
  });

  const attributeCompletions: CompletionItem[] = unusedAttributeNames.map((attr: string) => {
    const htmlTagAttributesQuoteType: AttributeQuoteType = state.cfmlCompletionSettings.get<AttributeQuoteType>("htmlTags.attributes.quoteType", AttributeQuoteType.Double);

    let attributeItem =  new CompletionItem(attr, CompletionItemKind.Property);
    attributeItem.insertText = new SnippetString(constructHTMLAttributeSnippet(htmlTag, attr, htmlTagAttributesQuoteType));
    attributeItem.sortText = "!" + attr + "=";

    /* Not working */
    const attributeValueCompletions: CompletionItem[] = getHTMLTagAttributeValueCompletions(htmlTag, attr, "");
    if (attributeValueCompletions.length > 0) {
      attributeItem.command = triggerCompletionCommand;
    }

    return attributeItem;
  });

  return attributeCompletions;
}

/**
 * Gets an HTML tag's attribute values as completion items for a given attribute
 * @param htmlTag The HTML tag that's attribute values will be checked
 * @param attributeName The name of the attribute that's values will be presented
 * @param currentValue The current value of the given attribute
 */
function getHTMLTagAttributeValueCompletions(htmlTag: HTMLTagSpecification, attributeName: string, currentValue: string): CompletionItem[] {
  let attrValCompletions: CompletionItem[] = [];

  const attribute: string = getHTMLAttributes(htmlTag).find((attr: string) => {
    return attr.split(":")[0] === attributeName;
  });

  if (attribute.split(":").length === 2 && attribute.split(":")[1] !== "v") {
    const valueType: string = attribute.split(":")[1];

    if (htmlAttributeValues.hasOwnProperty(valueType)) {
      htmlAttributeValues[valueType].forEach((enumVal: string) => {
        if (matches(currentValue, enumVal)) {
          attrValCompletions.push(createNewProposal(enumVal, CompletionItemKind.Unit, undefined, "!"));
        }
      });
    }
  }

  return attrValCompletions;
}

/**
 * Gets the standard included snippets as completion items
 * @param state An object representing the state of completion
 * @param excludedSnippetItems The snippets that should be excluded
 */
function getStandardSnippetCompletions(state: CompletionState, excludedSnippetItems: string[] = []): CompletionItem[] {
  let snippetCompletions: CompletionItem[] = [];
  for (const key in snippets) {
    if (!excludedSnippetItems.includes(key)) {
      let snippet: Snippet = snippets[key];
      // TODO: Use key to determine if script vs tag
      if (state.currentWordMatches(snippet.prefix) && state.positionIsScript) {
        let standardSnippet = new CompletionItem(snippet.prefix, CompletionItemKind.Snippet);
        standardSnippet.detail = `(snippet) ${snippet.description}`;
        const snippetString: string = Array.isArray(snippet.body) ? snippet.body.join("\n") : snippet.body;
        // standardSnippet.documentation = snippetString;
        standardSnippet.insertText = new SnippetString(snippetString);
        snippetCompletions.push(standardSnippet);
      }
    }
  }

  return snippetCompletions;
}

/**
 * Gets the variable completions for the given state
 * @param state An object representing the state of completion
 * @param variables All variable declarations
 */
function getVariableCompletions(state: CompletionState, variables: Variable[]): CompletionItem[] {
  let variableCompletions: CompletionItem[] = [];

  const variableScopePrefixPattern: RegExp = getVariableScopePrefixPattern();
  const variableScopePrefixMatch: RegExpExecArray = variableScopePrefixPattern.exec(state.docPrefix);
  if (variableScopePrefixMatch) {
    const scopePrefix: string = variableScopePrefixMatch[1];
    let prefixScope: Scope;
    if (scopePrefix) {
      prefixScope = Scope.valueOf(scopePrefix);
    }

    variableCompletions = variables.filter((variable: Variable) => {
      if (!state.currentWordMatches(variable.identifier) || variable.declarationLocation.range.contains(state.position)) {
        return false;
      }

      if (prefixScope) {
        return (variable.scope === prefixScope || (variable.scope === Scope.Unknown && unscopedPrecedence.includes(prefixScope)));
      }

      return (unscopedPrecedence.includes(variable.scope) || variable.scope === Scope.Unknown);
    }).map((variable: Variable) => {
      const varKind: CompletionItemKind = usesConstantConvention(variable.identifier) || variable.final ? CompletionItemKind.Constant : CompletionItemKind.Variable;
      const varType: string = getVariableTypeString(variable);

      return createNewProposal(variable.identifier, varKind, { detail: `(${variable.scope}) ${variable.identifier}: ${varType}`, description: variable.description });
    });
  }

  return variableCompletions;
}

/**
 * Gets the function completions for the given component and state
 * @param state An object representing the state of completion
 * @param component The component in which to suggest functions
 */
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
        let hasValidScopes: boolean = false;
        if (func.access === Access.Private) {
          hasValidScopes = privateAccessPrefixMatched;
        } else if (func.isImplicit) {
          hasValidScopes = getterSetterPrefixMatched;
        } else {
          hasValidScopes = otherAccessPrefixMatched;
        }
        return (hasValidScopes && state.currentWordMatches(funcKey) && !addedFunctions.has(funcKey));
      }).forEach((func: UserFunction, funcKey: string) => {
        addedFunctions.add(funcKey);
        componentFunctionCompletions.push(
          createNewProposal(func.name, CompletionItemKind.Function, { detail: `(function) ${currComponent.name}.${constructSyntaxString(func)}`, description: func.description })
        );
      });

      if (currComponent.extends) {
        currComponent = getComponent(currComponent.extends);
      } else {
        currComponent = undefined;
      }
    }
  }

  return componentFunctionCompletions;
}

/**
 * Gets the global function completions for the given state
 * @param state An object representing the state of completion
 */
function getGlobalFunctionCompletions(state: CompletionState): CompletionItem[] {
  const cfmlGFFirstLetterCase: string = state.cfmlCompletionSettings.get<string>("globalFunctions.firstLetterCase", "unchanged");

  let globalFunctionCompletions: CompletionItem[] = [];
  if (!state.isContinuingExpression) {
    const globalFunctions: GlobalFunctions = getAllGlobalFunctions();
    for (const name in globalFunctions) {
      if (state.currentWordMatches(name)) {
        const globalFunction: GlobalFunction = globalFunctions[name];
        let functionDetail = globalFunction.syntax;
        if (!functionDetail.startsWith("function ")) {
          functionDetail = "function " + globalFunction.syntax;
        }

        let globalFunctionName: string = globalFunction.name;
        if (cfmlGFFirstLetterCase === "lower") {
          globalFunctionName = `${globalFunctionName.charAt(0).toLowerCase()}${globalFunctionName.substr(1)}`;
        } else if (cfmlGFFirstLetterCase === "upper") {
          globalFunctionName = `${globalFunctionName.charAt(0).toUpperCase()}${globalFunctionName.substr(1)}`;
        }

        globalFunctionCompletions.push(
          createNewProposal(
            globalFunctionName,
            CompletionItemKind.Function,
            { detail: globalFunction.syntax, description: globalFunction.description }
          )
        );
      }
    }
  }

  return globalFunctionCompletions;
}

/**
 * Gets the global tag completions for the given state
 * @param state An object representing the state of completion
 */
function getGlobalTagCompletions(state: CompletionState): CompletionItem[] {
  let globalTagCompletions: CompletionItem[] = [];

  const tagPrefixPattern: RegExp = getTagPrefixPattern();
  const tagPrefixMatch: RegExpExecArray = tagPrefixPattern.exec(state.docPrefix);
  if (tagPrefixMatch) {
    const closingSlash: string = tagPrefixMatch[1];
    const cfmlGTAttributesQuoteType: AttributeQuoteType = state.cfmlCompletionSettings.get<AttributeQuoteType>("globalTags.attributes.quoteType", AttributeQuoteType.Double);
    const cfmlGTAttributesDefault: boolean = state.cfmlCompletionSettings.get<boolean>("globalTags.attributes.defaultValue", false);
    const cfmlGTAttributesSetType: IncludeAttributesSetType = state.cfmlCompletionSettings.get<IncludeAttributesSetType>("globalTags.includeAttributes.setType", IncludeAttributesSetType.None);
    const cfmlGTAttributesCustom: IncludeAttributesCustom = state.cfmlCompletionSettings.get<IncludeAttributesCustom>("globalTags.includeAttributes.custom", {});
    const globalTags: GlobalTags = getAllGlobalTags();
    for (const tagName in globalTags) {
      if (state.currentWordMatches(tagName)) {
        const globalTag: GlobalTag = globalTags[tagName];
        let thisGlobalTagCompletion: CompletionItem = createNewProposal(
          globalTag.name,
          CompletionItemKind.TypeParameter,
          { detail: globalTag.syntax, description: globalTag.description }
        );
        if (!closingSlash && (cfmlGTAttributesSetType !== IncludeAttributesSetType.None || cfmlGTAttributesCustom.hasOwnProperty(tagName))) {
          thisGlobalTagCompletion.insertText = constructTagSnippet(globalTag, cfmlGTAttributesSetType, cfmlGTAttributesQuoteType, cfmlGTAttributesCustom[tagName], cfmlGTAttributesDefault, false);
        }

        globalTagCompletions.push(thisGlobalTagCompletion);
      }
    }
  }

  return globalTagCompletions;
}

/**
 * Gets the global tag script completions for the given state
 * @param state An object representing the state of completion
 */
function getGlobalTagScriptCompletions(state: CompletionState): CompletionItem[] {
  let globalTagScriptCompletions: CompletionItem[] = [];

  if (state.userEngine.supportsScriptTags() && !state.isContinuingExpression) {
    const cfmlGTAttributesQuoteType: AttributeQuoteType = state.cfmlCompletionSettings.get<AttributeQuoteType>("globalTags.attributes.quoteType", AttributeQuoteType.Double);
    const cfmlGTAttributesDefault: boolean = state.cfmlCompletionSettings.get<boolean>("globalTags.attributes.defaultValue", false);
    const cfmlGTAttributesSetType: IncludeAttributesSetType = state.cfmlCompletionSettings.get<IncludeAttributesSetType>("globalTags.includeAttributes.setType", IncludeAttributesSetType.None);
    const cfmlGTAttributesCustom: IncludeAttributesCustom = state.cfmlCompletionSettings.get<IncludeAttributesCustom>("globalTags.includeAttributes.custom", {});
    const globalTags: GlobalTags = getAllGlobalTags();
    for (const tagName in globalTags) {
      // TODO: Filter tags not available in script
      if (state.currentWordMatches(tagName)) {
        const globalTag: GlobalTag = globalTags[tagName];
        let thisGlobalTagScriptCompletion: CompletionItem = createNewProposal(
          globalTag.name,
          CompletionItemKind.Function,
          { detail: globalTagSyntaxToScript(globalTag), description: globalTag.description }
        );
        if (cfmlGTAttributesSetType !== IncludeAttributesSetType.None || cfmlGTAttributesCustom.hasOwnProperty(tagName)) {
          thisGlobalTagScriptCompletion.insertText = constructTagSnippet(globalTag, cfmlGTAttributesSetType, cfmlGTAttributesQuoteType, cfmlGTAttributesCustom[tagName], cfmlGTAttributesDefault, true);
        }

        globalTagScriptCompletions.push(thisGlobalTagScriptCompletion);
      }
    }
  }

  return globalTagScriptCompletions;
}

/**
 * Gets the HTML tag completions for the given state
 * @param state An object representing the state of completion
 */
function getHTMLTagCompletions(state: CompletionState): CompletionItem[] {
  let htmlTagCompletions: CompletionItem[] = [];

  const tagPrefixPattern: RegExp = getTagPrefixPattern();
  const tagPrefixMatch: RegExpExecArray = tagPrefixPattern.exec(state.docPrefix);
  if (tagPrefixMatch) {
    for (const tagName in HTML_TAGS) {
      if (state.currentWordMatches(tagName)) {
        const htmlTag: HTMLTagSpecification = HTML_TAGS[tagName];
        let thisHTMLTagCompletion: CompletionItem = createNewProposal(
          htmlTag.name,
          CompletionItemKind.TypeParameter,
          { detail: `<${htmlTag.name}>`, description: htmlTag.description }
        );

        htmlTagCompletions.push(thisHTMLTagCompletion);
      }
    }
  }

  return htmlTagCompletions;
}

/**
 * Gets the CSS property completions for the given state
 * @param state An object representing the state of completion
 */
function getCSSPropertyCompletions(state: CompletionState): CompletionItem[] {
  let cssPropertyCompletions: CompletionItem[] = [];

  const cssWordRange: Range = state.document.getWordRangeAtPosition(state.position, /(#?-?\d*\.\d\w*%?)|(::?[\w-]*(?=[^,{;]*[,{]))|(([@#.!])?[\w-?]+%?|[@#!.])/);
  const currentCssWord: string = cssWordRange ? state.document.getText(cssWordRange) : "";

  const cssProperties = getCssProperties();

  cssProperties.filter((prop: CssProperty) => {
    return matches(currentCssWord, prop.name);
  }).forEach((prop: CssProperty) => {
    let entry: CompletionEntry = { detail: prop.name, description: prop.desc };
    if (prop.syntax) {
      entry.detail = `${prop.name}: ${prop.syntax}`;
    }
    let thisCssPropertyCompletion: CompletionItem = createNewProposal(
      prop.name,
      CompletionItemKind.Property,
      entry
    );
    thisCssPropertyCompletion.range = cssWordRange;

    cssPropertyCompletions.push(thisCssPropertyCompletion);
  });

  return cssPropertyCompletions;
}

/**
 * Gets dotted path completions for the given state
 * @param state An object representing the state of completion
 * @param parentDottedPath The dotted path part that is higher in the hierarchy
 */
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
        { detail: `(folder) ${directory}`, description: escapeMarkdown(path.join(thisPath, directory)) },
        "!"
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
        { detail: `(component) ${componentName}`, description: escapeMarkdown(path.join(thisPath, componentFile)) },
        "!"
      ));
    });
  });

  // custom mappings
  const cfmlMappings: CFMLMapping[] = workspace.getConfiguration("cfml", state.document.uri).get<CFMLMapping[]>("mappings", []);
  const splitParentPath: string[] = parentDottedPath === "" ? [] : parentDottedPath.split(".");
  for (const cfmlMapping of cfmlMappings) {
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
      completionEntry = { detail: `(mapping) ${dottedLogicalPath}` };

      if (directoryPath) {
        completionEntry.description = escapeMarkdown(directoryPath);
      }
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
