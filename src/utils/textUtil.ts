import { MarkdownString } from "vscode";

/**
 * Returns whether the string are equal ignoring case
 * @param string1 A string to compare
 * @param string2 A string to compare
 */
export function equalsIgnoreCase(string1: string, string2: string): boolean {
    return string1.toLowerCase() === string2.toLowerCase();
}

/**
 * Transforms text to MarkdownString
 * @param text A candidate string
 */
export function textToMarkdownString(text: string): MarkdownString {
  return new MarkdownString(text.replace(/\n(?!\n)/g, "  \n"));
}

/**
 * Escapes special markdown characters
 * @param text A candidate string
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!]/g, "\\$&");
}
