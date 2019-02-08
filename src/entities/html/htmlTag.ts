import { AttributeQuoteType } from "../attribute";
import { getQuote } from "../../utils/textUtil";
import { IAttributeData as HTMLAttributeData } from "./htmlLanguageTypes";
import { getAttribute } from "./languageFacts";

export const HTML_EMPTY_ELEMENTS: string[] = ["area", "base", "br", "col", "embed", "hr", "img", "input", "keygen", "link", "meta", "param", "source", "track", "wbr"];

export function constructHTMLAttributeSnippet(tagName: string, attributeName: string, attributeQuoteType: AttributeQuoteType = AttributeQuoteType.Double): string {
  const attribute: HTMLAttributeData = getAttribute(tagName, attributeName);

  if (!attribute) {
    return "";
  }

  if (attribute.valueSet === "v") {
    return attributeName;
  }

  const quoteStr: string = getQuote(attributeQuoteType);

  return `${attributeName}=${quoteStr}\${1}${quoteStr}`;
}
