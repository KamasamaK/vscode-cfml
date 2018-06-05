import { Block } from "../block";
import { Doc, DocType } from "../doc";

export default class Component extends Block {
  protected pattern: RegExp = /^(\s*(?:component|interface))\b[^{]*\{/i;

  public constructDoc(): Doc {
    return new Doc(this.component.isInterface ? DocType.Interface : DocType.Component, this.document.uri);
  }
}
