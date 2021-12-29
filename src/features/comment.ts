import { Position, languages, commands, window, TextEditor, LanguageConfiguration, TextDocument, CharacterPair } from "vscode";
import { LANGUAGE_ID } from "../cfmlMain";
import { isInCfScript, isCfcFile } from "../utils/contextUtil";
import { getComponent, hasComponent } from "./cachedEntities";

export enum CommentType {
  Line,
  Block
}

export interface CFMLCommentRules {
  scriptBlockComment: CharacterPair;
  scriptLineComment: string;
  tagBlockComment: CharacterPair;
}

export interface CommentContext {
  inComment: boolean;
  activeComment: string | CharacterPair;
  commentType: CommentType;
  start: Position;
}

export const cfmlCommentRules: CFMLCommentRules = {
  scriptBlockComment: ["/*", "*/"],
  scriptLineComment: "//",
  tagBlockComment: ["<!---", "--->"]
};

/**
 * Returns whether to use CFML tag comment
 * @param document The TextDocument in which the selection is made
 * @param startPosition The position at which the comment starts
 */
function isTagComment(document: TextDocument, startPosition: Position): boolean {
  const docIsScript: boolean = (isCfcFile(document) && hasComponent(document.uri) && getComponent(document.uri).isScript);

  return !docIsScript && !isInCfScript(document, startPosition);
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
export function toggleComment(commentType: CommentType): (editor: TextEditor) => Promise<void> {
  return async (editor: TextEditor) => {
    if (editor) {
      // default comment config
      let languageConfig: LanguageConfiguration = {
        comments: {
          lineComment: cfmlCommentRules.scriptLineComment,
          blockComment: cfmlCommentRules.scriptBlockComment
        }
      };

      // Changes the comment in language configuration based on the context
      if (isTagComment(editor.document, editor.selection.start)) {
        languageConfig = {
          comments: {
            blockComment: cfmlCommentRules.tagBlockComment
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
