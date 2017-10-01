// TODO: Replace deprecated MarkedString with MarkdownString
import { MarkedString } from "vscode";

/**
 * Escapes some MarkedString constructs
 * @param text A candidate string
 */
export function textToMarkedString(text: string): MarkedString {
    return text.replace(/[\\`*_{}[\]()#+\-.!]/g, "\\$&");
}
