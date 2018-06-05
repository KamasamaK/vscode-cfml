import { Block } from "../block";
import { Doc, DocType } from "../doc";
import { Position } from "vscode";
import { UserFunction, UserFunctionSignature, Argument } from "../../../entities/userFunction";

/**
 * Represents a function code block
 *
 * This is probably going to be the most complicated of all the
 * blocks as function signatures tend to be the most complex and
 * varied
 */
export default class FunctionBlock extends Block {

  protected pattern: RegExp = /^(\s*)(?:\b(?:private|package|public|remote|static|final|abstract)\s+)?(?:\b(?:private|package|public|remote|static|final|abstract)\s+)?(?:\b(?:[A-Za-z0-9_\.$]+)\s+)?function\s+(?:[_$a-zA-Z][$\w]*)\s*(?:\((?:=\s*\{|[^{])*)[\{;]/i;

  public constructDoc(): Doc {
    let doc = new Doc(DocType.Function, this.document.uri);

    const positionOffset: number = this.document.offsetAt(this.position);
    const patternMatch: RegExpExecArray = this.pattern.exec(this.suffix);
    if (patternMatch) {
      const declaration: Position = this.document.positionAt(positionOffset + patternMatch[1].length + 1);
      this.component.functions.filter((func: UserFunction) => {
        return func.location.range.contains(declaration);
      }).forEach((func: UserFunction) => {
        func.signatures.forEach((sig: UserFunctionSignature) => {
          sig.parameters.forEach((arg: Argument) => {
            doc.params.push(arg.name);
          });
        });
      });
    }

    return doc;
  }
}
