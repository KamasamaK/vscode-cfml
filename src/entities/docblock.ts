import { Range, TextDocument } from "vscode";

const DOC_PATTERN: RegExp = /(\n\s*(?:\*[ \t]*)?(?:@(\w+)(?:\.(\w+))?)?[ \t]*)(\S.*)/gi;

export interface DocBlockKeyValue {
  key: string; // lowercased
  subkey?: string; // lowercased
  value: string;
  valueRange?: Range;
}

/**
 * Parses a CFScript documentation block and returns an array of DocBlockKeyValue objects
 * @param document The document in which to parse
 * @param docRange The range within the document containing the docblock
 */
export function parseDocBlock(document: TextDocument, docRange: Range): DocBlockKeyValue[] {
  const docBlockStr: string = document.getText(docRange);
  let docBlock: DocBlockKeyValue[] = [];
  let prevKey = "hint";
  let activeKey = "hint";
  let prevSubkey = undefined;
  let activeSubkey = undefined;
  let activeValue = undefined;
  let activeValueStartOffset = 0;
  let activeValueEndOffset = 0;
  let docBlockMatches: RegExpExecArray = null;
  const docBlockOffset: number = document.offsetAt(docRange.start);
  while (docBlockMatches = DOC_PATTERN.exec(docBlockStr)) {
    const valuePrefix: string = docBlockMatches[1];
    const metadataKey: string = docBlockMatches[2];
    const metadataSubkey: string = docBlockMatches[3];
    const metadataValue: string = docBlockMatches[4];
    const docValueOffset: number = docBlockOffset + docBlockMatches.index + valuePrefix.length;

    if (metadataKey) {
      activeKey = metadataKey.toLowerCase();
      if (metadataSubkey) {
        activeSubkey = metadataSubkey.toLowerCase();
      } else {
        activeSubkey = undefined;
      }
    } else if (metadataValue === "*") {
      continue;
    }

    if ((activeKey !== prevKey || activeSubkey !== prevSubkey) && activeValue) {
      docBlock.push({
        key: prevKey,
        subkey: prevSubkey,
        value: activeValue,
        valueRange: new Range(document.positionAt(activeValueStartOffset), document.positionAt(activeValueEndOffset))
      });
      prevKey = activeKey;
      prevSubkey = activeSubkey;
      activeValue = undefined;
    }

    if (activeValue) {
      activeValue += " " + metadataValue;
    } else {
      activeValueStartOffset = docValueOffset;
      activeValue = metadataValue;
    }
    activeValueEndOffset = docValueOffset + metadataValue.length;
  }

  if (activeValue) {
    docBlock.push({
      key: activeKey,
      subkey: activeSubkey,
      value: activeValue,
      valueRange: new Range(document.positionAt(activeValueStartOffset), document.positionAt(activeValueEndOffset))
    });
  }

  return docBlock;
}

/**
 * Gets a regular expression that matches a docblock key with the given name and captures its next word
 * @param keyName The tag key to match
 */
export function getKeyPattern(keyName: string): RegExp {
  return new RegExp(`@${keyName}\\s+(\\S+)`, "i");
}
