import { Range, TextDocument } from "vscode";

const DOC_PATTERN: RegExp = /(\n\s*(?:\*\s*)?(?:@(\w+)(?:\.(\w+))?)?\s*)(\S.*)/gi;

export interface DocBlockKeyValue {
  key: string; // lowercased
  subkey?: string; // lowercased
  value: string;
  valueRange?: Range;
}

/**
 * Parses a CFScript documentation block and returns an array of DocBlockKeyValue objects
 * @param docBlockStr The documentation block to be parsed
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

export function getKeyPattern(keyName: string): RegExp {
  return new RegExp(`@${keyName}\s+(\S+)`, "i");
}
