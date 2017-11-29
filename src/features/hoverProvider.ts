import {
  Hover, HoverProvider, Position, Range, TextDocument, TextLine, CancellationToken, WorkspaceConfiguration, workspace, MarkdownString
} from "vscode";
import * as cachedEntity from "./cachedEntities";
import { textToMarkdownString } from "../utils/textUtil";
import { GlobalFunction, GlobalTag } from "../entities/globals";
import { Parameter } from "../entities/parameter";
import { LANGUAGE_ID } from "../cfmlMain";
import { DataType } from "../entities/dataType";
import { Function, getSyntaxString, getFunctionSuffixPattern } from "../entities/function";
import { Component, COMPONENT_EXT } from "../entities/component";
import { getComponent } from "./cachedEntities";
import { Signature } from "../entities/signature";
import { getValidScopesPrefixPattern, Scope } from "../entities/scope";
import { Access, UserFunction, Argument } from "../entities/userFunction";
import * as path from "path";
import { MySet } from "../utils/collections";
import { CFMLEngine, CFMLEngineName } from "../utils/cfdocs/cfmlEngine";
import { isInComment } from "../utils/contextUtil";
import { getTagPrefixPattern } from "../entities/tag";

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
  public async getFormattedStrings(document: TextDocument, position: Position): Promise<MarkdownString[] | null> {

    const cfmlEngineSettings: WorkspaceConfiguration = workspace.getConfiguration("cfml.engine");
    const userEngineName: CFMLEngineName = CFMLEngineName.valueOf(cfmlEngineSettings.get<string>("name"));
    const userEngine: CFMLEngine = new CFMLEngine(userEngineName, cfmlEngineSettings.get<string>("version"));

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
    let userFunc: UserFunction = null;

    const comp: Component = getComponent(document.uri);

    const isScript: boolean = (comp && comp.isScript) ? true : false;
    if (isInComment(document, position, isScript)) {
      return null;
    }

    if (comp && comp.functions.has(word.toLowerCase())) {
      userFunc = comp.functions.get(word.toLowerCase());
      const validScopes: Scope[] = userFunc.access === Access.Private ? [Scope.Variables] : [Scope.Variables, Scope.This];
      const funcPrefixPattern = getValidScopesPrefixPattern(validScopes, true);
      if (funcPrefixPattern.test(linePrefix)) {
        isUserFunction = true;
      }
    }

    // TODO: Add hover for arguments and properties

    if (!isGlobalFunction && !isGlobalTag && !isUserFunction) {
      return null;
    }
    // Only include function-format based on engine
    const tagPrefixPattern: RegExp = getTagPrefixPattern();
    const functionSuffixPattern: RegExp = getFunctionSuffixPattern();
    if (
      isGlobalTag && !tagPrefixPattern.test(linePrefix) && !(userEngine.supportsScriptTags() && functionSuffixPattern.test(lineSuffix))
    )
    {
      return null;
    }
    if ((isGlobalFunction || isUserFunction) && !functionSuffixPattern.test(lineSuffix)) {
      return null;
    }

    return new Promise<MarkdownString[]>((resolve, reject) => {
      let definition: HoverProviderItem;
      if (isGlobalFunction) {
        definition = this.functionToHoverProviderItem(cachedEntity.getGlobalFunction(word.toLowerCase()));
      } else if (isGlobalTag) {
        definition = this.globalTagToHoverProviderItem(cachedEntity.getGlobalTag(word.toLowerCase()));
      } else if (isUserFunction) {
        definition = this.functionToHoverProviderItem(userFunc);
      }

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
   * Creates HoverProviderItem from given global tag
   * @param tag Global tag to convert
   */
  public globalTagToHoverProviderItem(tag: GlobalTag): HoverProviderItem {
    let paramArr: Parameter[] = [];
    let paramNames = new MySet<string>();

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
  public functionToHoverProviderItem(func: Function): HoverProviderItem {
    let paramArr: Parameter[] = [];
    let paramNames = new MySet<string>();
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
   * Creates a list of MarkdownString that becomes the hover text based on the symbol definition
   * @param definition The symbol definition information
   */
  public createHoverText(definition: HoverProviderItem): MarkdownString[] {
    let hoverTexts: MarkdownString[] = [];

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

    hoverTexts.push(new MarkdownString().appendCodeblock(syntax, language));

    if (definition.description) {
      hoverTexts.push(textToMarkdownString(definition.description));
    } else {
      hoverTexts.push(new MarkdownString("_No " + symbolType.toLowerCase() + " description_"));
    }

    const paramList: Parameter[] = definition.params;
    if (paramList.length > 0) {
      hoverTexts.push(new MarkdownString("**" + paramKind + " Reference**"));
    }

    paramList.forEach((param: Parameter) => {
      let paramString = param.name.split("=")[0];

      let paramType: string = param.dataType.toLowerCase();
      if (param.dataType === DataType.Component) {
        const arg: Argument = <Argument>param;
        if (arg.dataTypeComponentUri) {
          paramType = path.basename(arg.dataTypeComponentUri.fsPath, COMPONENT_EXT);
        }
      }

      if (paramType && paramType.length) {
        paramString += ": " + paramType;
      }

      hoverTexts.push(new MarkdownString().appendCodeblock(paramString, "typescript"));

      if (param.description) {
        hoverTexts.push(textToMarkdownString(param.description));
      } else {
        hoverTexts.push(new MarkdownString("_No " + paramKind.toLowerCase() + " description_"));
      }
    });

    if (definition.externalLink) {
      hoverTexts.push(new MarkdownString("Link: " + definition.externalLink));
    }

    return hoverTexts;
  }
}
