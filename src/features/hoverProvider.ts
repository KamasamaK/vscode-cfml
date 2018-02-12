import {
  Hover, HoverProvider, Position, Range, TextDocument, TextLine, CancellationToken, WorkspaceConfiguration, workspace, MarkdownString, Uri
} from "vscode";
import * as cachedEntity from "./cachedEntities";
import { textToMarkdownString, equalsIgnoreCase } from "../utils/textUtil";
import { GlobalFunction, GlobalTag, globalTagSyntaxToScript } from "../entities/globals";
import { Parameter, constructParameterLabel } from "../entities/parameter";
import { LANGUAGE_ID } from "../cfmlMain";
import { DataType } from "../entities/dataType";
import { Function, getSyntaxString, getFunctionSuffixPattern } from "../entities/function";
import { Component, COMPONENT_EXT, objectNewInstanceInitPrefix } from "../entities/component";
import { getComponent } from "./cachedEntities";
import { Signature } from "../entities/signature";
import { getValidScopesPrefixPattern, Scope } from "../entities/scope";
import { Access, UserFunction, getFunctionFromPrefix } from "../entities/userFunction";
import * as path from "path";
import { MySet } from "../utils/collections";
import { CFMLEngine } from "../utils/cfdocs/cfmlEngine";
import { getTagPrefixPattern, getCfScriptTagAttributePattern, getCfTagAttributePattern } from "../entities/tag";
import { variableExpressionPrefix } from "../entities/variable";
import { getDocumentPositionStateContext, DocumentPositionStateContext } from "../utils/documentUtil";
import { VALUE_PATTERN } from "../entities/attribute";

const cfDocsLinkPrefix = "https://cfdocs.org/";

interface HoverProviderItem {
  name: string;
  syntax: string;
  symbolType: string;
  description: string;
  params?: Parameter[];
  returnType?: string;
  externalLink?: string;
}

export default class CFMLHoverProvider implements HoverProvider {

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

    return this.getFormattedStrings(document, position).then((formattedStrings: MarkdownString[]) => {
      if (formattedStrings) {
        return new Hover(formattedStrings);
      }
      return undefined;
    }, () => {
      return undefined;
    });
  }

  /**
   * Generates properly formatted strings to use in hover
   * @param document The document in which the hover was invoked.
   * @param position The position at which the hover was invoked.
   */
  public async getFormattedStrings(document: TextDocument, position: Position): Promise<MarkdownString[] | undefined> {

    const documentPositionStateContext: DocumentPositionStateContext = getDocumentPositionStateContext(document, position);

    const userEngine: CFMLEngine = documentPositionStateContext.userEngine;

    const wordRange: Range = document.getWordRangeAtPosition(position);
    if (!wordRange) {
      return undefined;
    }

    const textLine: TextLine = document.lineAt(position);
    const lineText: string = documentPositionStateContext.sanitizedDocumentText.slice(document.offsetAt(textLine.range.start), document.offsetAt(textLine.range.end));
    const currentWord: string = documentPositionStateContext.currentWord;
    const lowerCurrentWord = currentWord.toLowerCase();
    const lineSuffix: string = lineText.slice(wordRange.end.character, textLine.range.end.character);
    const docPrefix: string = documentPositionStateContext.docPrefix;
    const positionIsCfScript: boolean = documentPositionStateContext.positionIsScript;

    let userFunc: UserFunction;

    const tagPrefixPattern: RegExp = getTagPrefixPattern();
    const functionSuffixPattern: RegExp = getFunctionSuffixPattern();

    let definition: HoverProviderItem;

    const thisComponent: Component = documentPositionStateContext.component;

    if (documentPositionStateContext.positionInComment) {
      return undefined;
    }

    if (cachedEntity.isGlobalTag(currentWord)) {
      if (tagPrefixPattern.test(docPrefix)) {
        definition = this.globalTagToHoverProviderItem(cachedEntity.getGlobalTag(lowerCurrentWord));
        return this.createHover(definition);
      }

      if (userEngine.supportsScriptTags() && functionSuffixPattern.test(lineSuffix)) {
        definition = this.globalScriptTagToHoverProviderItem(cachedEntity.getGlobalTag(lowerCurrentWord));
        return this.createHover(definition);
      }
    }

    if (functionSuffixPattern.test(lineSuffix)) {
      // Check if instantiating via "new" operator
      const startSigPositionPrefix = `${docPrefix}${currentWord}(`;
      const objectNewInstanceInitPrefixMatch: RegExpExecArray = objectNewInstanceInitPrefix.exec(startSigPositionPrefix);
      if (objectNewInstanceInitPrefixMatch) {
        const componentDotPath: string = objectNewInstanceInitPrefixMatch[2];
        const componentUri: Uri = cachedEntity.componentPathToUri(componentDotPath, document.uri);
        if (componentUri) {
          const initComponent: Component = getComponent(componentUri);
          if (initComponent) {
            const initMethod = initComponent.initmethod ? initComponent.initmethod.toLowerCase() : "init";
            if (initComponent.functions.has(initMethod)) {
              userFunc = initComponent.functions.get(initMethod);
              definition = this.functionToHoverProviderItem(userFunc);
              return this.createHover(definition);
            }
          }
        }
      }

      // Global function
      if (cachedEntity.isGlobalFunction(currentWord)) {
        definition = this.functionToHoverProviderItem(cachedEntity.getGlobalFunction(lowerCurrentWord));
        return this.createHover(definition);
      }

      // Internal function
      if (thisComponent) {
        let currComponent: Component = thisComponent;
        let checkScope: boolean = true;
        // If preceded by super keyword, start at base component
        const varPrefixMatch: RegExpExecArray = variableExpressionPrefix.exec(docPrefix);
        if (thisComponent.extends && varPrefixMatch) {
          const varMatchText: string = varPrefixMatch[0];
          const varScope: string = varPrefixMatch[2];
          // const varQuote: string = varPrefixMatch[3];
          const varName: string = varPrefixMatch[4];

          if (varMatchText.split(".").length === 2 && !varScope && equalsIgnoreCase(varName, "super")) {
            currComponent = getComponent(thisComponent.extends);
            checkScope = false;
          }
        }
        while (currComponent) {
          if (currComponent.functions.has(lowerCurrentWord)) {
            const thisFunc = currComponent.functions.get(lowerCurrentWord);
            const validScopes: Scope[] = thisFunc.access === Access.Private ? [Scope.Variables] : [Scope.Variables, Scope.This];
            const funcPrefixPattern = getValidScopesPrefixPattern(validScopes, true);
            if (!checkScope || funcPrefixPattern.test(docPrefix)) {
              userFunc = thisFunc;
              break;
            }
          }
          if (currComponent.extends) {
            currComponent = getComponent(currComponent.extends);
          } else {
            currComponent = undefined;
          }
        }
      }

      // External function
      if (!userFunc) {
        userFunc = await getFunctionFromPrefix(documentPositionStateContext, docPrefix, lowerCurrentWord);
      }

      if (userFunc) {
        definition = this.functionToHoverProviderItem(userFunc);
        return this.createHover(definition);
      }
    }

    // Global tag attributes
    if (!positionIsCfScript || userEngine.supportsScriptTags()) {
      const cfTagAttributePattern: RegExp = positionIsCfScript ? getCfScriptTagAttributePattern() : getCfTagAttributePattern();
      const cfTagAttributeMatch: RegExpExecArray = cfTagAttributePattern.exec(docPrefix);
      if (cfTagAttributeMatch) {
        const tagName: string = cfTagAttributeMatch[2];
        const globalTag: GlobalTag = cachedEntity.getGlobalTag(tagName);
        const attributeValueMatch: RegExpExecArray = VALUE_PATTERN.exec(docPrefix);
        if (globalTag && !attributeValueMatch) {
          definition = this.attributeToHoverProviderItem(globalTag, currentWord);
          return this.createHover(definition);
        }
      }
    }

    // TODO: Function arguments, component properties

    return undefined;
  }

  /**
   * Creates HoverProviderItem from given global tag
   * @param tag Global tag to convert
   */
  public globalTagToHoverProviderItem(tag: GlobalTag): HoverProviderItem {
    let paramArr: Parameter[] = [];
    let paramNames = new MySet<string>();

    tag.signatures.forEach((sig: Signature) => {
      sig.parameters.forEach((param: Parameter) => {
        const paramName = param.name.split("=")[0];
        if (!paramNames.has(paramName)) {
          paramNames.add(paramName);
          paramArr.push(param);
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
   * Creates HoverProviderItem from given global script tag
   * @param tag Global tag to convert
   */
  public globalScriptTagToHoverProviderItem(tag: GlobalTag): HoverProviderItem {
    let paramArr: Parameter[] = [];
    let paramNames = new MySet<string>();

    tag.signatures.forEach((sig: Signature) => {
      sig.parameters.forEach((param: Parameter) => {
        const paramName = param.name.split("=")[0];
        if (!paramNames.has(paramName)) {
          paramNames.add(paramName);
          paramArr.push(param);
        }
      });
    });

    return {
      name: tag.name,
      syntax: globalTagSyntaxToScript(tag),
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
  public functionToHoverProviderItem(func: Function): HoverProviderItem {
    let paramArr: Parameter[] = [];
    let paramNames = new MySet<string>();
    func.signatures.forEach((sig: Signature) => {
      sig.parameters.forEach((param: Parameter) => {
        const paramName = param.name.split("=")[0];
        if (!paramNames.has(paramName)) {
          paramNames.add(paramName);
          paramArr.push(param);
        }
      });
    });

    let returnType: string;
    if ("returnTypeUri" in func) {
      const userFunction: UserFunction = func as UserFunction;
      if (userFunction.returnTypeUri) {
        returnType = path.basename(userFunction.returnTypeUri.fsPath, COMPONENT_EXT);
      }
    }

    if (!returnType && func.returntype) {
      returnType = func.returntype;
    } else {
      returnType = DataType.Any;
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
      const globalFunc = func as GlobalFunction;
      hoverItem.syntax = globalFunc.syntax + ": " + returnType;
      hoverItem.externalLink = cfDocsLinkPrefix + globalFunc.name;
    }

    return hoverItem;
  }

  /**
   * Creates HoverProviderItem from given global tag attribute
   * @param tag Global tag to which the attribute belongs
   * @param attributeName Global tag attribute name to convert
   */
  public attributeToHoverProviderItem(tag: GlobalTag, attributeName: string): HoverProviderItem {
    let attribute: Parameter;

    tag.signatures.forEach((sig: Signature) => {
      attribute = sig.parameters.find((param: Parameter) => {
        const paramName = param.name.split("=")[0];
        return equalsIgnoreCase(paramName, attributeName);
      });
    });

    if (!attribute) {
      return undefined;
    }

    return {
      name: attributeName,
      syntax: `${attribute.required ? "(required) " : ""}${attributeName}: ${attribute.dataType}`,
      symbolType: "attribute",
      description: attribute.description,
      externalLink: `${cfDocsLinkPrefix}${tag.name}#p-${attribute.name}`
    };
  }

  /**
   * Creates a list of MarkdownString that becomes the hover based on the symbol definition
   * @param definition The symbol definition information
   */
  public async createHover(definition: HoverProviderItem): Promise<MarkdownString[]> {
    return new Promise<MarkdownString[]>((resolve, reject) => {
      if (!definition) {
        return reject("Definition not found");
      }

      if (!definition.name) {
        return reject("Invalid definition format");
      }

      const hoverTexts: MarkdownString[] = this.createHoverText(definition);

      return resolve(hoverTexts);
    });
  }

  /**
   * Creates a list of MarkdownString that becomes the hover text based on the symbol definition
   * @param definition The symbol definition information
   */
  public createHoverText(definition: HoverProviderItem): MarkdownString[] {
    let hoverTexts: MarkdownString[] = [];
    let syntax: string = definition.syntax;

    const symbolType: string = definition.symbolType;
    let language = "";
    let paramKind = "";
    if (symbolType === "function") {
      syntax = "function " + syntax;

      language = "typescript"; // cfml not coloring properly
      paramKind = "Argument";
    } else if (symbolType === "tag") {
      language = LANGUAGE_ID;
      paramKind = "Attribute";
    } else if (symbolType === "attribute") {
      language = "typescript";
    } else {
      return undefined;
    }

    hoverTexts.push(new MarkdownString().appendCodeblock(syntax, language));

    if (definition.description) {
      hoverTexts.push(textToMarkdownString(definition.description));
    } else {
      hoverTexts.push(new MarkdownString("_No " + symbolType.toLowerCase() + " description_"));
    }

    const paramList: Parameter[] = definition.params;
    if (paramList) {
      if (paramList.length > 0) {
        hoverTexts.push(new MarkdownString("**" + paramKind + " Reference**"));
      }

      paramList.forEach((param: Parameter) => {
        let paramString = constructParameterLabel(param);

        if (!param.required && typeof param.default !== "undefined") {
          let paramDefault = param.default;
          // TODO: Improve check
          if (typeof paramDefault === "string") {
            if (param.dataType === DataType.String) {
              if (!paramDefault.trim().startsWith("'") && !paramDefault.trim().startsWith('"')) {
                paramDefault = `"${paramDefault.trim()}"`;
              }
            } else if (param.dataType === DataType.Numeric) {
              paramDefault = paramDefault.replace(/['"]/, "").trim();
            } else if (param.dataType === DataType.Boolean) {
              paramDefault = DataType.isTruthy(paramDefault).toString();
            }
          }

          if (paramDefault) {
            paramString += " = " + paramDefault;
          }
        }

        hoverTexts.push(new MarkdownString().appendCodeblock(paramString, "typescript"));

        if (param.description) {
          hoverTexts.push(textToMarkdownString(param.description));
        } else {
          hoverTexts.push(new MarkdownString("_No " + paramKind.toLowerCase() + " description_"));
        }
      });
    }

    if (definition.externalLink) {
      hoverTexts.push(new MarkdownString("Link: " + definition.externalLink));
    }

    return hoverTexts;
  }
}
