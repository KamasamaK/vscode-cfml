/** Adopted from https://github.com/Microsoft/vscode-css-languageservice/blob/27f369f0d527b1952689e223960f779e89457374/src/languageFacts/index.ts */

import * as cssLanguageTypes from "./cssLanguageTypes";
import * as cssLanguageFacts from "vscode-css-languageservice/lib/umd/languageFacts/index";

export const cssWordRegex: RegExp = /(#?-?\d*\.\d\w*%?)|(::?[\w-]*(?=[^,{;]*[,{]))|(([@#.!])?[\w-?]+%?|[@#!.])/;

export const cssDataManager: cssLanguageTypes.ICSSDataManager = cssLanguageFacts.cssDataManager;

export const cssColors: { [name: string]: string } = cssLanguageFacts.colors;

function getEntryStatus(status: cssLanguageTypes.EntryStatus): string {
  switch (status) {
    case "experimental":
      return "⚠️ Property is experimental. Be cautious when using it.\n\n";
    case "nonstandard":
      return "🚨️ Property is nonstandard. Avoid using it.\n\n";
    case "obsolete":
      return "🚨️️️ Property is obsolete. Avoid using it.\n\n";
    default:
      return "";
  }
}

/**
 * Constructs a description for the given CSS entry
 * @param entry A CSS entry object
 */
export function getEntryDescription(entry: cssLanguageTypes.IEntry): string | null {
  if (!entry.description || entry.description === "") {
    return null;
  }

  let result: string = "";

  if (entry.status) {
    result += getEntryStatus(entry.status);
  }

  result += entry.description;

  const browserLabel = cssLanguageFacts.getBrowserLabel(entry.browsers);
  if (browserLabel) {
    result += `\n(${browserLabel})`;
  }

  /*
  if ("syntax" in entry) {
    result += `\n\nSyntax: ${entry.syntax}`;
  }
  */

  return result;
}
