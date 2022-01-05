import { IHTMLDataProvider, ITagData, IAttributeData } from "./htmlLanguageTypes";
import * as htmlData from "vscode-html-languageservice/lib/umd/languageFacts/data/html5";
import { equalsIgnoreCase } from "../../utils/textUtil";

export const htmlDataProvider: IHTMLDataProvider = htmlData.getHTML5DataProvider();

// Recreate maps since they are private
const htmlTagMap: { [t: string]: ITagData } = {};

htmlData.HTML5_TAGS.forEach((t) => {
  htmlTagMap[t.name] = t;
});

/**
 * Whether the given name is a known HTML tag
 * @param name Tag name to check
 */
export function isKnownTag(name: string): boolean {
  return name.toLowerCase() in htmlTagMap;
}

// isStandardTag (when status becomes available)

/**
 * Gets HTML tag data
 * @param name The tag name
 */
export function getTag(name: string): ITagData | undefined {
  return htmlTagMap[name.toLowerCase()];
}

/**
 * Whether the tag with the given name has an attribute with the given name
 * @param tagName The tag name
 * @param attributeName The attribute name
 */
export function hasAttribute(tagName: string, attributeName: string): boolean {
  return htmlDataProvider.provideAttributes(tagName.toLowerCase()).some((attr: IAttributeData) => {
    return equalsIgnoreCase(attr.name, attributeName);
  });
}

/**
 * Gets HTML tag attribute data
 * @param tagName The tag name
 * @param attributeName The attribute name
 */
export function getAttribute(tagName: string, attributeName: string): IAttributeData | undefined {
  return htmlDataProvider.provideAttributes(tagName.toLowerCase()).find((attr: IAttributeData) => {
    return equalsIgnoreCase(attr.name, attributeName);
  });
}
