import { IHTMLDataProvider, ITagData, IAttributeData } from "./htmlLanguageTypes";
import * as htmlData from "vscode-html-languageservice/lib/umd/languageFacts/data/html5";
import { equalsIgnoreCase } from "../../utils/textUtil";

export const htmlDataProvider: IHTMLDataProvider = htmlData.getHTML5DataProvider();

// Recreate maps since they are private
const htmlTagMap: { [t: string]: ITagData } = {};

htmlData.HTML5_TAGS.forEach((t) => {
  htmlTagMap[t.name] = t;
});

// Helper functions
export function isKnownTag(name: string): boolean {
  return name.toLowerCase() in htmlTagMap;
}

// isStandardTag (when status becomes available)

export function getTag(name: string): ITagData | undefined {
  return htmlTagMap[name.toLowerCase()];
}

export function hasAttribute(tagName: string, attributeName: string): boolean {
  return htmlDataProvider.provideAttributes(tagName.toLowerCase()).some((attr: IAttributeData) => {
    return equalsIgnoreCase(attr.name, attributeName);
  });
}

export function getAttribute(tagName: string, attributeName: string): IAttributeData | undefined {
  return htmlDataProvider.provideAttributes(tagName.toLowerCase()).find((attr: IAttributeData) => {
    return equalsIgnoreCase(attr.name, attributeName);
  });
}
