import { workspace, SnippetString, WorkspaceConfiguration } from "vscode";
import { DataType } from "../../entities/dataType";

interface Config {
  gap: boolean;
  extra: ConfigExtra[];
}

interface ConfigExtra {
  name: string;
  default: string;
  types: string[];
}

export enum DocType {
  Component="component",
  Interface="interface",
  Property="property",
  Function="function",
  Unknown="unknown"
}

/**
 * Represents a comment block.
 *
 * This class collects data about the snippet then builds
 * it with the appropriate tags
 */
export class Doc {
  /**
   * List of param tags
   */
  public params: string[] = [];

  /**
   * The message portion of the block
   */
  public hint: string;

  /**
   * The type of structure being documented
   */
  public docType: DocType;

  /**
   * A config which will modify the result of the Doc
   */
  protected config: Config;

  /**
   * Creates an instance of Doc.
   *
   * @param hint
   */
  public constructor(docType: DocType) {
    this.docType = docType;
    this.hint = "Undocumented " + docType;
  }

  /**
   * Get the config from either vs code or the manually set one
   */
  public getConfig(): Config {
    if (!this.config) {
      this.config = workspace.getConfiguration().get<Config>("cfml.docBlock");
    }
    return this.config;
  }

  /**
   * Set the config object
   *
   * @param config
   */
  public setConfig(config): void {
    this.config = config;
  }

  /**
   * Build all the set values into a SnippetString ready for use
   *
   * @param isEmpty
   */
  public build(isEmpty: boolean = false): SnippetString {
    let snippet = new SnippetString();
    let extra = this.getConfig().extra;
    let gap = !this.getConfig().gap;

    if (isEmpty) {
      gap = true;
      extra = [];
    }

    let stop = 2;

    snippet.appendText("/**");
    snippet.appendText("\n * ");
    snippet.appendPlaceholder(this.hint);

    if (this.params.length) {
      if (!gap) {
        snippet.appendText("\n *");
        gap = true;
      }
      this.params.forEach((param) => {
        snippet.appendText(`\n * @${param} `);
        snippet.appendPlaceholder("");
      });
    }

    if (Array.isArray(extra) && extra.length > 0) {
      if (!gap) {
        snippet.appendText("\n *");
        gap = true;
      }
      extra.filter((extraItem: ConfigExtra) => {
        if (extraItem.types && Array.isArray(extraItem.types)) {
          return extraItem.types.includes(this.docType);
        }
        return true;
      }).forEach((extra: ConfigExtra) => {
        snippet.appendText(`\n * @${extra.name} `);
        snippet.appendPlaceholder(extra.default);
      });
    }

    snippet.appendText("\n */");

    return snippet;
  }
}
