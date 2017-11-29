import { Position, SnippetString, TextDocument } from "vscode";
import FunctionBlock from "./block/function";
import Property from "./block/property";
import Component from "./block/component";
import { Doc, DocType } from "./doc";

/**
 * Check which type of DocBlock we need and instruct the components to build the
 * snippet and pass it back
 */
export default class Documenter {
  /**
   * The target position of the comment block
   */
  protected targetPosition: Position;

  /**
   * The document to pass to each editor
   */
  protected document: TextDocument;

  /**
   * Creates an instance of Documenter.
   *
   * @param position
   * @param editor
   */
  public constructor(position: Position, document: TextDocument) {
    this.targetPosition = position;
    this.document = document;
  }

  /**
   * Load and test each type of signature to see if they can trigger and
   * if not load an empty block
   */
  public autoDocument(): SnippetString {
    let func = new FunctionBlock(this.targetPosition, this.document);
    if (func.test()) {
      return func.constructDoc().build();
    }

    let prop = new Property(this.targetPosition, this.document);
    if (prop.test()) {
      return prop.constructDoc().build();
    }

    let comp = new Component(this.targetPosition, this.document);
    if (comp.test()) {
      return comp.constructDoc().build();
    }

    return new Doc(DocType.Unknown).build(true);
  }
}
