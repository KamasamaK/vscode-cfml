import { Range, Position, languages, commands, window, TextEditor, LanguageConfiguration, Selection, TextDocument } from "vscode";
import { LANGUAGE_ID } from "../cfmlMain";
import { isCfmFile, containsCfTag, containsCfScriptTag, isLastTagCFScript } from "../utils/contextUtil";


export enum CommentType {
  Line,
  Block
}

/**
 * Returns whether to use CFML tag comment
 * @param document The TextDocument in which the selection is made
 * @param beforeSelection The text in the document before the start of the selection
 * @param selection The text in the document that is selected
 */
function isTagComment(document: TextDocument, beforeSelection: string, selection: string): boolean {
  return (
    (isCfmFile(document) || containsCfTag(document.getText())) &&
    (containsCfScriptTag(selection) || !isLastTagCFScript(beforeSelection))
  );
}

/**
 * Get selection text for specified context
 * For line comment, we want to consider text outside of the actual comment bounds
 * For block comment, we do not want to consider text outside of the actual comment bounds
 * @param editor The currently active editor
 * @param commentType The comment type for which the selection will be used
 */
function getSelectionText(editor: TextEditor, commentType: CommentType): string {
  let range: Range;
  if (commentType === CommentType.Line) {
    range = new Range(
      new Position(editor.selection.start.line, 0),
      editor.document.lineAt(editor.selection.end).range.end
    );
  } else {
    range = editor.selection;
  }

  return editor.document.getText(range);
}

/**
 * Returns the command for the comment type specified
 * @param commentType The comment type for which to get the command
 */
function getCommentCommand(commentType: CommentType): string {
  let command: string = "";
  if (commentType === CommentType.Line) {
    command = "editor.action.commentLine";
  } else {
    command = "editor.action.blockComment";
  }

  return command;
}

/**
 * Return a function that can be used to execute a line or block comment
 * @param commentType The comment type for which the command will be executed
 */
export function toggleComment(commentType: CommentType): () => void {
  return () => {
    const editor: TextEditor = window.activeTextEditor;

    if (editor) {
      // default comment config
      let languageConfig: LanguageConfiguration = {
        comments: {
          lineComment: "//",
          blockComment: ["/*", "*/"]
        }
      };

      const selection: Selection = editor.selection;
      const textBeforeSelection: string = editor.document.getText(
        new Range(new Position(0, 0), selection.start)
      );
      const selectionText: string = getSelectionText(editor, commentType);

      // Changes the comment in language configuration based on the context
      if (isTagComment(editor.document, textBeforeSelection, selectionText)) {
        languageConfig = {
          comments: {
            blockComment: ["<!---", "--->"]
          }
        };
      }
      languages.setLanguageConfiguration(LANGUAGE_ID, languageConfig);
      const command: string = getCommentCommand(commentType);
      commands.executeCommand(command);
    } else {
      window.showInformationMessage("No editor is active");
    }
  };
}
