import {
  TextDocument, Position, CancellationToken, CompletionItem, CompletionItemProvider, Range, CompletionItemKind
} from "vscode";
import Documenter from "./documenter";
import { Component } from "../../entities/component";
import { getComponent, getGlobalTag } from "../cachedEntities";
import { Property, Properties } from "../../entities/property";
import { UserFunction, UserFunctionSignature, Argument, ComponentFunctions } from "../../entities/userFunction";
import { MySet, MyMap } from "../../utils/collections";
import { GlobalTag } from "../../entities/globals";
import { Signature } from "../../entities/signature";
import { Parameter } from "../../entities/parameter";

/**
 * Completions provider that can be registered to the language
 */
export default class DocBlockCompletions implements CompletionItemProvider {

  /**
   * Implemented function to find and return completions either from
   * the tag list or initiate a complex completion
   *
   * @param document
   * @param position
   * @param token
   */
  public async provideCompletionItems(document: TextDocument, position: Position, _token: CancellationToken): Promise<CompletionItem[]> {
    let result: CompletionItem[] = [];
    let wordMatchRange: Range;

    if ((wordMatchRange = document.getWordRangeAtPosition(position, /\/\*\*/)) !== undefined) {
      let documenter: Documenter = new Documenter(wordMatchRange.end, document);

      let block = new CompletionItem("/** */", CompletionItemKind.Snippet);
      block.range = wordMatchRange;
      block.insertText = documenter.autoDocument();
      block.documentation = "Docblock completion";
      result.push(block);

      return result;
    }

    const comp: Component = getComponent(document.uri);
    if (!comp) {
      return result;
    }

    if ((wordMatchRange = document.getWordRangeAtPosition(position, /\@[\w$]*(\.[a-z]*)?/)) === undefined) {
      return result;
    }

    // const tagKeyPattern = / \* @$/;
    // const tagSubKeyPattern = / \* @[\w$]+\.$/;

    let tagSuggestions: MyMap<string, string> = new MyMap<string, string>();
    let subKeySuggestions: MyMap<string, string> = new MyMap<string, string>();

    let wordRange: Range = document.getWordRangeAtPosition(position);
    if (!wordRange) {
      wordRange = new Range(position, position);
    }
    const search: string = document.getText(wordRange);
    const lineText: string = document.lineAt(position).text;
    const wordPrefix: string = lineText.slice(0, wordRange.start.character);
    const prefixChr: string = wordRange.start.character !== 0 ? wordPrefix.substr(wordPrefix.length-1, 1) : "";

    if (prefixChr !== "@" && prefixChr !== ".") {
      return result;
    }

    // TODO: Prevent redundant suggestions.
    let argumentNames: MySet<string> = new MySet<string>();
    const foundProperty: Properties = comp.properties.filter((prop: Property) => {
      return prop.propertyRange.contains(position);
    });
    if (foundProperty.size === 1) {
      const propertyTag: GlobalTag = getGlobalTag("cfproperty");
      propertyTag.signatures.forEach((sig: Signature) => {
        sig.parameters.filter((param: Parameter) => {
          return param.name !== "name";
        }).forEach((param: Parameter) => {
          tagSuggestions.set(param.name, param.description);
        });
      });
    } else {
      const foundFunction: ComponentFunctions = comp.functions.filter((func: UserFunction) => {
        return func.location.range.contains(position);
      });
      if (foundFunction.size === 1) {
        const functionTag: GlobalTag = getGlobalTag("cffunction");
        functionTag.signatures.forEach((sig: Signature) => {
          sig.parameters.filter((param: Parameter) => {
            return param.name !== "name";
          }).forEach((param: Parameter) => {
            tagSuggestions.set(param.name, param.description);
          });
        });

        foundFunction.forEach((func: UserFunction) => {
          func.signatures.forEach((sig: UserFunctionSignature) => {
            sig.parameters.forEach((arg: Argument) => {
              argumentNames.add(arg.name);
              tagSuggestions.set(arg.name, arg.description);
            });
          });
        });

        const argumentTag: GlobalTag = getGlobalTag("cfargument");
        argumentTag.signatures.forEach((sig: Signature) => {
          sig.parameters.filter((param: Parameter) => {
            return param.name !== "name";
          }).forEach((param: Parameter) => {
            subKeySuggestions.set(param.name, param.description);
          });
        });
      } else {
        if (comp.isInterface) {
          const interfaceTag: GlobalTag = getGlobalTag("cfinterface");
          interfaceTag.signatures.forEach((sig: Signature) => {
            sig.parameters.filter((param: Parameter) => {
              return param.name !== "name";
            }).forEach((param: Parameter) => {
              tagSuggestions.set(param.name, param.description);
            });
          });
        } else {
          const componentTag: GlobalTag = getGlobalTag("cfcomponent");
          componentTag.signatures.forEach((sig: Signature) => {
            sig.parameters.filter((param: Parameter) => {
              return param.name !== "name";
            }).forEach((param: Parameter) => {
              tagSuggestions.set(param.name, param.description);
            });
          });
        }
      }
    }

    let suggestions: MyMap<string, string>;
    if (prefixChr === "." && argumentNames.size !== 0) {
      let prevWordRange: Range = document.getWordRangeAtPosition(wordRange.start.translate(0, -1));
      if (!prevWordRange) {
        prevWordRange = new Range(position, position);
      }
      const prevWord: string = document.getText(prevWordRange);
      if (argumentNames.has(prevWord)) {
        suggestions = subKeySuggestions;
      }
    } else if (prefixChr === "@") {
      suggestions = tagSuggestions;
    }

    if (suggestions) {
      suggestions.filter((suggestDesc: string, suggestionName: string) => {
        return suggestionName.match(search) !== null;
      }).forEach((suggestDesc: string, suggestionName: string) => {
        let item = new CompletionItem(suggestionName, CompletionItemKind.Property);
        item.documentation = suggestDesc;
        result.push(item);
      });
    }

    return result;
  }
}
