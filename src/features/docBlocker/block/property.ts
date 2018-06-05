import { Block } from "../block";
import { Doc, DocType } from "../doc";


export default class Property extends Block {

  protected pattern: RegExp = /^(\s*property)\s+/i;

  public constructDoc(): Doc {
    return new Doc(DocType.Property, this.document.uri);
  }
}
