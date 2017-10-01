// TODO: Replace deprecated MarkedString with MarkdownString
import {
  Hover, HoverProvider, Position, Range, TextDocument, TextLine, CancellationToken, MarkedString, ExtensionContext, WorkspaceConfiguration, workspace
} from "vscode";

import * as fs from "fs";
import * as cachedEntity from "./cachedEntities";
import { textToMarkedString } from "../utils/markedTextUtil";
import { GlobalFunction, GlobalTag } from "../entities/globals";
import { Parameter } from "../entities/parameter";
import { LANGUAGE_ID } from "../cfmlMain";
import { DataType } from "../entities/dataType";
import { Function, getSyntaxString } from "../entities/function";
import { Component, getComponentNameFromDotPath, COMPONENT_EXT } from "../entities/component";
import { getComponent } from "./cachedEntities";
import { Signature } from "../entities/signature";
import { getValidScopesPrefixPattern, Scope } from "../entities/scope";
import { Access, UserFunction } from "../entities/userFunction";
import * as path from "path";

const cfDocsLinkPrefix = "https://cfdocs.org/";

interface HoverProviderItem {
  name: string;
  syntax: string;
  symbolType: string;
  description: string;
  params: Parameter[];
  returnType?: string;
  externalLink?: string;
}

export default class CFMLHoverProvider implements HoverProvider {
  /**
   * Generates properly formatted strings to use in hover
   * @param document The document in which the hover was invoked.
   * @param position The position at which the hover was invoked.
   */
  public async getFormattedStrings(document: TextDocument, position: Position): Promise<MarkedString[]> {
    const wordRange: Range = document.getWordRangeAtPosition(position);
    if (!wordRange) {
      return null;
    }

    const textLine: TextLine = document.lineAt(position);
    const lineText: string = textLine.text;
    const word: string = document.getText(wordRange);
    const linePrefix: string = lineText.slice(textLine.firstNonWhitespaceCharacterIndex, wordRange.start.character);
    const lineSuffix: string = lineText.slice(wordRange.end.character, textLine.range.end.character);

    const isGlobalFunction: boolean = cachedEntity.isGlobalFunction(word);
    const isGlobalTag: boolean = cachedEntity.isGlobalTag(word);

    let isUserFunction = false;

    const comp: Component = getComponent(document.uri);
    if (comp && comp.functions.has(word.toLowerCase())) {
      const userFunc = comp.functions.get(word.toLowerCase());
      const validScopes: Scope[] = userFunc.access === Access.Private ? [Scope.Variables] : [Scope.Variables, Scope.This];
      const funcPrefixPattern = getValidScopesPrefixPattern(validScopes, true);
      if (funcPrefixPattern.test(linePrefix)) {
        isUserFunction = true;
      }
    }

    if (!isGlobalFunction && !isGlobalTag && !isUserFunction) {
      return null;
    }
    if (isGlobalTag && !/<(\s*\/)?\s*$/.test(linePrefix)) {
      return null;
    }
    if ((isGlobalFunction || isUserFunction) && !/^\s*\(/.test(lineSuffix)) {
      return null;
    }

    return new Promise<MarkedString[]>((resolve, reject) => {
      let definition: HoverProviderItem;
      if (isGlobalFunction) {
        definition = this.FunctionToHoverProviderItem(cachedEntity.getGlobalFunction(word.toLowerCase()));
      } else if (isGlobalTag) {
        definition = this.GTtoHoverProviderItem(cachedEntity.getGlobalTag(word.toLowerCase()));
      } else if (isUserFunction) {
        definition = this.FunctionToHoverProviderItem(comp.functions.get(word.toLowerCase()));
      }

      if (!definition) {
        return reject("Definition not found");
      }

      if (!definition.name) {
        return reject("Invalid definition format");
      }

      const hoverTexts: MarkedString[] = this.createHoverText(definition);

      return resolve(hoverTexts);
    });
  }

  /**
   * Creates HoverProviderItem from given global tag
   * @param tag Global tag to convert
   */
  public GTtoHoverProviderItem(tag: GlobalTag): HoverProviderItem {
    let paramArr: Parameter[] = [];
    let paramNames = new Set<string>();

    tag.signatures.forEach((s: Signature) => {
      s.parameters.forEach((p: Parameter) => {
        const paramName = p.name.split("=")[0];
        if (!paramNames.has(paramName)) {
          paramNames.add(paramName);
          paramArr.push(p);
        }
      });
    });

    return {
      name: tag.name,
      syntax: tag.syntax,
      symbolType: "tag",
      description: tag.description,
      params: paramArr,
      returnType: undefined,
      externalLink: cfDocsLinkPrefix + tag.name
    };
  }

  /**
   * Creates HoverProviderItem from given function
   * @param func Function to convert
   */
  public FunctionToHoverProviderItem(func: Function): HoverProviderItem {
    let paramArr: Parameter[] = [];
    let paramNames = new Set<string>();
    func.signatures.forEach((s: Signature) => {
      s.parameters.forEach((p: Parameter) => {
        const paramName = p.name.split("=")[0];
        if (!paramNames.has(paramName)) {
          paramNames.add(paramName);
          paramArr.push(p);
        }
      });
    });

    let returnType: string = DataType.Any;
    if ("returnTypeUri" in func) {
      const userFunction: UserFunction = <UserFunction>func;
      if (userFunction.returnTypeUri) {
        returnType = path.basename(userFunction.returnTypeUri.fsPath, COMPONENT_EXT);
      }
    } else if (func.returntype) {
      returnType = func.returntype;
    }

    let hoverItem: HoverProviderItem = {
      name: func.name,
      syntax: getSyntaxString(func),
      symbolType: "function",
      description: func.description,
      params: paramArr,
      returnType: returnType
    };

    if (cachedEntity.isGlobalFunction(func.name)) {
      const globalFunc = <GlobalFunction>func;
      hoverItem.syntax = globalFunc.syntax;
      hoverItem.externalLink = cfDocsLinkPrefix + globalFunc.name;
    }

    return hoverItem;
  }

  /**
   * Creates a list of MarkedString that becomes the hover text based on the symbol definition
   * @param definition The symbol definition information
   */
  public createHoverText(definition: HoverProviderItem): MarkedString[] {
    let hoverTexts: MarkedString[] = [];

    const returnType: string = definition.returnType;
    let syntax: string = definition.syntax;

    const symbolType: string = definition.symbolType;
    let language = "";
    let paramKind = "";
    if (definition.symbolType === "function") {
      syntax = "function " + syntax;
      if (returnType && returnType.length) {
        syntax += ": " + returnType;
      }
      language = "typescript"; // cfml not coloring properly
      paramKind = "Argument";
    } else {
      language = LANGUAGE_ID;
      paramKind = "Attribute";
    }

    hoverTexts.push({ language, value: syntax });

    if (definition.description) {
      hoverTexts.push(textToMarkedString(definition.description));
    } else {
      hoverTexts.push("_No " + symbolType.toLowerCase() + " description_");
    }

    const paramList: Parameter[] = definition.params;
    if (paramList.length > 0) {
      hoverTexts.push("**" + paramKind + " Reference**");
    }

    paramList.forEach((param: Parameter) => {
      let paramString = param.name.split("=")[0];
      if (param.dataType && param.dataType.length) {
        paramString += ": " + param.dataType.toLowerCase();
      }
      hoverTexts.push({ language: "typescript", value: paramString });

      if (param.description) {
        // textToMarkedString?
        hoverTexts.push(param.description);
      } else {
        hoverTexts.push("_No " + paramKind.toLowerCase() + " description_");
      }
    });

    if (definition.externalLink) {
      hoverTexts.push("Link: " + definition.externalLink);
    }

    return hoverTexts;
  }

  /**
   * Provides a hover for the given position and document
   * @param document The document in which the hover was invoked.
   * @param position The position at which the hover was invoked.
   * @param token A cancellation token.
   */
  public async provideHover(document: TextDocument, position: Position, token: CancellationToken): Promise<Hover | undefined> {
    const cfmlHoverSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml.hover");
    if (!cfmlHoverSettings.get<boolean>("enable", true)) {
      return undefined;
    }

    const filePath: string = document.fileName;
    if (!filePath) {
      return undefined;
    }

    return this.getFormattedStrings(document, position).then((formattedStrings: MarkedString[]) => {
      return new Hover(formattedStrings);
    }, () => {
      return undefined;
    });
  }
}
