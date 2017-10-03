import { CompletionItemProvider, CompletionItem, CompletionItemKind, CancellationToken, TextDocument, Position, Range,
  workspace, WorkspaceConfiguration, Uri, SnippetString } from "vscode";
import { equalsIgnoreCase } from "../utils/textUtil";
import { keywords } from "../entities/keyword";
import { cgiVariables } from "../entities/cgi";
import { getAllGlobalFunctions, getAllGlobalTags, getComponent, getGlobalTag } from "./cachedEntities";
import { GlobalFunction, GlobalTag, GlobalFunctions, GlobalTags, getCfTagAttributePattern } from "../entities/globals";
import { inlineFunctionPattern, UserFunction, UserFunctionSignature, Argument, Access, getLocalVariables } from "../entities/userFunction";
import { getSyntaxString } from "../entities/function";
import { constructSignatureLabel, Signature } from "../entities/signature";
import { Component, COMPONENT_EXT } from "../entities/component";
import * as path from "path";
import * as fs from "fs";
import { isCfmFile, isCfcFile, getCfScriptRanges, isContinuingExpressionPattern } from "../utils/contextUtil";
import { usesConstantConvention, parseVariables, Variable } from "../entities/variable";
import { scopes, Scope, getValidScopesPrefixPattern, getVariableScopePrefixPattern } from "../entities/scope";
import { Property } from "../entities/property";
import { snippets, Snippet } from "../cfmlMain";
import { parseAttributes, Attributes } from "../entities/attribute";
import { Parameter } from "../entities/parameter";
import { MyMap } from "../utils/collections";

const findConfig = require("find-config");

interface IEntry {
  detail?: string;
  description?: string;
}

export default class CFMLCompletionItemProvider implements CompletionItemProvider {

  /**
   * Provide completion items for the given position and document.
   * @param document The document in which the command was invoked.
   * @param position The position at which the command was invoked.
   * @param token A cancellation token.
   */
  public async provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken): Promise<CompletionItem[]> {
    let result: CompletionItem[] = [];

    const cfmlCompletionSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml.suggest");
    const shouldProvideCompletionItems = cfmlCompletionSettings.get<boolean>("enable", true);
    if (!shouldProvideCompletionItems) {
      return result;
    }
    const docIsCfmFile: boolean = isCfmFile(document);
    const docIsCfcFile: boolean = isCfcFile(document);
    const documentText: string = document.getText();
    const documentUri: Uri = document.uri;
    const lineText: string = document.lineAt(position).text;
    let wordRange: Range = document.getWordRangeAtPosition(position);
    const currentWord: string = wordRange ? document.getText(wordRange) : "";
    if (!wordRange) {
      wordRange = new Range(position, position);
    }
    const docPrefix: string = documentText.slice(0, document.offsetAt(wordRange.start));
    const linePrefix: string = lineText.slice(0, wordRange.start.character);
    const prefixChr: string = wordRange.start.character !== 0 ? linePrefix.substr(linePrefix.length-1, 1) : "";
    const continuingExpression: boolean = isContinuingExpressionPattern(docPrefix);

    let added = new Set<string>();

    const createNewProposal = (name: string, kind: CompletionItemKind, entry: IEntry): CompletionItem => {
      const proposal: CompletionItem = new CompletionItem(name, kind);
      if (entry) {
        if (entry.description) {
          proposal.documentation = entry.description;
        }
        if (entry.detail) {
          proposal.detail = entry.detail;
        }
      }
      return proposal;
    };

    const matches = (word: string, name: string): boolean => {
      return word.length === 0 || name.length >= word.length && equalsIgnoreCase(name.substr(0, word.length), word);
    };

    const currentWordMatches = (name: string): boolean => {
      return matches(currentWord, name);
    };

    // Snippets
    const shouldProvideSnippetItems = cfmlCompletionSettings.get<boolean>("snippets.enable", true);
    if (shouldProvideSnippetItems && !continuingExpression) {
      const excludedSnippetItems = cfmlCompletionSettings.get<string[]>("snippets.exclude", []);
      for (let key in snippets) {
        if (!excludedSnippetItems.includes(key)) {
          let snippet: Snippet = snippets[key];
          if (currentWordMatches(snippet.prefix)) {
            let componentSnippet = new CompletionItem(snippet.prefix, CompletionItemKind.Snippet);
            componentSnippet.detail = snippet.description;
            const snippetString: string = typeof snippet.body === "string" ? snippet.body : snippet.body.join("\n");
            // componentSnippet.documentation = snippetString;
            componentSnippet.insertText = new SnippetString(snippetString);
            result.push(componentSnippet);
          }
        }
      }
    }

    // Functions and arguments
    if (docIsCfmFile) {
      let functionMatch: RegExpExecArray = null;
      while (functionMatch = inlineFunctionPattern.exec(documentText)) {
        const word1: string = functionMatch[1];
        if (word1 && !added.has(word1)) {
          added.add(word1);
          result.push(createNewProposal(word1, CompletionItemKind.Function, null));
        }
        const word2: string = functionMatch[2];
        if (word2 && !added.has(word2)) {
          added.add(word2);
          result.push(createNewProposal(word2, CompletionItemKind.Function, null));
        }
      }
    } else if (docIsCfcFile) {
      const comp: Component = getComponent(documentUri);
      if (comp) {
        const argPrefixPattern = getValidScopesPrefixPattern([Scope.Arguments], true);
        comp.functions.forEach((func: UserFunction) => {
          if (func.bodyRange.contains(position) && argPrefixPattern.test(docPrefix)) {
            if (func.signatures && func.signatures.length !== 0) {
              let argNames = new Set<string>();
              func.signatures.forEach((signature: UserFunctionSignature) => {
                signature.parameters.forEach((param: Argument) => {
                  const argName: string = param.name;
                  if (currentWordMatches(argName) && !argNames.has(argName.toLowerCase())) {
                    argNames.add(argName.toLowerCase());

                    let argType: string = param.dataType;
                    if (param.dataTypeComponentUri) {
                      argType = path.basename(param.dataTypeComponentUri.fsPath, COMPONENT_EXT);
                    }
                    const argSyntax = "(arguments) " + argType + " " + argName;
                    const argDescription = param.description;
                    result.push(createNewProposal(
                      argName, CompletionItemKind.Variable, { detail: argSyntax, description: argDescription }
                    ));
                  }
                });
              });
            }
          }

          const validScopes: Scope[] = func.access === Access.Private ? [Scope.Variables] : [Scope.Variables, Scope.This];
          const funcPrefixPattern = getValidScopesPrefixPattern(validScopes, true);
          if (funcPrefixPattern.test(docPrefix) && currentWordMatches(func.name)) {
            result.push(createNewProposal(
              func.name, CompletionItemKind.Function, { detail: `(function) ${comp.name}.${getSyntaxString(func)}`, description: func.description }
            ));
          }
        });
      }
    }

    // TODO: Add struct keys? Query columns?
    // Assigned variables
    if (docIsCfmFile) {
      const variableScopePrefixPattern: RegExp = getVariableScopePrefixPattern();
      const variableScopePrefixMatch: RegExpExecArray = variableScopePrefixPattern.exec(docPrefix);
      if (variableScopePrefixMatch) {
        parseVariables(document, false).filter((variable: Variable) => {
          return currentWordMatches(variable.identifier);
        }).filter((variable: Variable) => {
          if (variableScopePrefixMatch[1]) {
            const currentScope = Scope.valueOf(variableScopePrefixMatch[1]);
            return [currentScope, Scope.Unknown].includes(variable.scope);
          }

          return true;
        }).forEach((variable: Variable) => {
          const kind: CompletionItemKind = usesConstantConvention(variable.identifier) ? CompletionItemKind.Constant : CompletionItemKind.Variable;
          result.push(createNewProposal(variable.identifier, kind, { detail: `(${variable.scope}) ${variable.identifier}`, description: variable.description }));
        });
      }
    } else if (docIsCfcFile) {
      const comp: Component = getComponent(documentUri);
      if (comp) {
        // properties
        comp.properties.forEach((prop: Property) => {
          const propPrefixPattern = getValidScopesPrefixPattern([Scope.Variables], true);
          if (propPrefixPattern.test(docPrefix) && currentWordMatches(prop.name)) {
            let propertyType: string = prop.dataType;
            if (prop.dataTypeComponentUri) {
              propertyType = path.basename(prop.dataTypeComponentUri.fsPath, COMPONENT_EXT);
            }

            result.push(createNewProposal(
              prop.name, CompletionItemKind.Property, { detail: `(property) ${propertyType} ${comp.name}.${prop.name}`, description: prop.description }
            ));
          }

          const getterSetterPrefixPattern = getValidScopesPrefixPattern([Scope.This], true);
          if (comp.accessors && getterSetterPrefixPattern.test(docPrefix)) {
            // getters
            if (typeof prop.getter === "undefined" || prop.getter) {
              const getterName = "get" + prop.name.charAt(0).toUpperCase() + prop.name.slice(1);
              if (!comp.functions.has(getterName.toLowerCase()) && currentWordMatches(getterName)) {
                let propertyType: string = prop.dataType;
                if (prop.dataTypeComponentUri) {
                  propertyType = path.basename(prop.dataTypeComponentUri.fsPath, COMPONENT_EXT);
                }

                result.push(createNewProposal(
                  getterName, CompletionItemKind.Function, { detail: `(getter) ${propertyType} ${comp.name}.${getterName}()`, description: prop.description }
                ));
              }
            }

            // setters
            if (typeof prop.setter === "undefined" || prop.setter) {
              const setterName = "set" + prop.name.charAt(0).toUpperCase() + prop.name.slice(1);
              if (!comp.functions.has(setterName.toLowerCase()) && currentWordMatches(setterName)) {
                let propertyType: string = prop.dataType;
                if (prop.dataTypeComponentUri) {
                  propertyType = path.basename(prop.dataTypeComponentUri.fsPath, COMPONENT_EXT);
                }

                result.push(createNewProposal(
                  setterName, CompletionItemKind.Function, { detail: `(setter) ${comp.name} ${comp.name}.${setterName}(${propertyType} ${prop.name})`, description: prop.description }
                ));
              }
            }
          }
        });
        // component variables
        const compVarPrefixPattern = getValidScopesPrefixPattern([Scope.Variables, Scope.This], true);
        if (compVarPrefixPattern.test(docPrefix)) {
          comp.variables.filter((variable: Variable) => {
            return currentWordMatches(variable.identifier);
          }).forEach((variable: Variable) => {
            const kind: CompletionItemKind = usesConstantConvention(variable.identifier) ? CompletionItemKind.Constant : CompletionItemKind.Variable;
            result.push(createNewProposal(
              variable.identifier, kind, { detail: `(${variable.scope}) ${variable.identifier}`, description: variable.description }
            ));
          });
        }
        // local variables
        const localVarPrefixPattern = getValidScopesPrefixPattern([Scope.Local], true);
        if (localVarPrefixPattern.test(docPrefix)) {
          comp.functions.forEach((func: UserFunction) => {
            if (func.bodyRange.contains(position)) {
              getLocalVariables(func, document, comp.isScript).filter((variable: Variable) => {
                return currentWordMatches(variable.identifier);
              }).forEach((variable: Variable) => {
                const kind: CompletionItemKind = usesConstantConvention(variable.identifier) ? CompletionItemKind.Constant : CompletionItemKind.Variable;
                result.push(createNewProposal(variable.identifier, kind, { detail: `(${variable.scope}) ${variable.identifier}` }));
              });
            }
          });
        }
      }
    }

    // Global functions
    const shouldProvideGFItems = cfmlCompletionSettings.get<boolean>("globalFunctions.enable", true);
    if (shouldProvideGFItems && !continuingExpression) {
      const globalFunctions: GlobalFunctions = getAllGlobalFunctions();
      for (let name in globalFunctions) {
        if (currentWordMatches(name)) {
          const globalFunction: GlobalFunction = globalFunctions[name];
          result.push(createNewProposal(
            globalFunction.name,
            CompletionItemKind.Function,
            { detail: "function " + globalFunction.syntax, description: globalFunction.description }
          ));
        }
      }
    }

    // Global tags
    if (/<\s*\/?\s*$/.test(linePrefix)) {
      const globalTags: GlobalTags = getAllGlobalTags();
      for (let name in globalTags) {
        if (currentWordMatches(name)) {
          const globalTag: GlobalTag = globalTags[name];
          result.push(createNewProposal(
            globalTag.name,
            CompletionItemKind.Text,
            { detail: globalTag.syntax, description: globalTag.description }
          ));
        }
      }
    }

    // Global tag attributes
    const cfTagAttributePattern: RegExp = getCfTagAttributePattern();
    const cfTagAttributeMatch: RegExpExecArray = cfTagAttributePattern.exec(docPrefix);
    if (cfTagAttributeMatch) {
      const tagAttributePrefix: string = cfTagAttributeMatch[1];
      const tagName: string = cfTagAttributeMatch[2];
      const tagAttributes: string = cfTagAttributeMatch[3];
      const globalTag: GlobalTag = getGlobalTag(tagName);
      if (globalTag) {
        let attributeDocs: MyMap<string, Parameter> = new MyMap<string, Parameter>();
        globalTag.signatures.forEach((sig: Signature) => {
          sig.parameters.forEach((param: Parameter) => {
            attributeDocs.set(param.name.toLowerCase(), param);
          });
        });
        const attributeNames: Set<string> = new Set<string>(attributeDocs.keys());
        const tagAttributeRange = new Range(
          document.positionAt(cfTagAttributeMatch.index + tagAttributePrefix.length),
          document.positionAt(cfTagAttributeMatch.index + tagAttributePrefix.length + tagAttributes.length)
        );
        const parsedAttributes: Attributes = parseAttributes(document, tagAttributeRange, attributeNames);
        const usedAttributeNames: Set<string> = new Set<string>(parsedAttributes.keys());

        attributeDocs.filter((param: Parameter) => {
          return !usedAttributeNames.has(param.name.toLowerCase()) && currentWordMatches(param.name);
        }).forEach((param: Parameter) => {
          let attributeItem = new CompletionItem(param.name, CompletionItemKind.Property);
          attributeItem.documentation = param.description;
          attributeItem.insertText = param.name + "=";
          result.push(attributeItem);
        });
      }
    }

    if (/\.\s*$/.test(docPrefix)) {
      // TODO: Add member functions
    }

    // Keywords
    if (!continuingExpression) {
      for (let name in keywords) {
        if (currentWordMatches(name)) {
          result.push(createNewProposal(name, CompletionItemKind.Keyword, keywords[name]));
        }
      }
    }

    // TODO: Make contextual
    // Scopes
    if (!continuingExpression) {
      for (let name in scopes) {
        if (currentWordMatches(name)) {
          result.push(createNewProposal(name, CompletionItemKind.Struct, scopes[name]));
        }
      }
    }

    // Application variables
    if (getValidScopesPrefixPattern([Scope.Application], false).test(docPrefix)) {
      const fileName = "Application.cfc";
      const currentWorkingDir: string = path.dirname(document.fileName);
      const applicationFile: string = findConfig(fileName, { cwd: currentWorkingDir });
      if (applicationFile) {
        const componentUri: Uri = Uri.file(applicationFile);
        const comp: Component = getComponent(componentUri);
        workspace.openTextDocument(componentUri).then((document: TextDocument) => {
          const variables = parseVariables(document, comp.isScript);
          variables.filter((variable: Variable) => {
            return currentWordMatches(variable.identifier) && variable.scope === Scope.Application;
          }).forEach((variable: Variable) => {
            result.push(createNewProposal(variable.identifier, CompletionItemKind.Variable, { detail: `(${variable.scope}) ${variable.identifier}` }));
          });
        });
      }
    }

    // CGI variables
    if (getValidScopesPrefixPattern([Scope.CGI], false).test(docPrefix)) {
      for (let name in cgiVariables) {
        if (currentWordMatches(name)) {
          result.push(createNewProposal(name, CompletionItemKind.Property, cgiVariables[name]));
        }
      }
    }

    return result;
  }
}
