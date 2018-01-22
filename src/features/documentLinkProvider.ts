import { DocumentLinkProvider, TextDocument, CancellationToken, DocumentLink, Range, Uri, workspace, Position, WorkspaceFolder } from "vscode";
import * as path from "path";
import * as fs from "fs";

export default class CFMLDocumentLinkProvider implements DocumentLinkProvider {

  private linkPatterns: LinkPattern[] = [
    // attribute/value link
    {
      pattern: /\b(href|src|template|action|url)\s*=\s*(['"])([^'"]+?)\2/gi,
      linkIndex: 3
    },
    // include script
    {
      pattern: /\binclude\s+(['"])([^'"]+?)\1/gi,
      linkIndex: 2
    },
  ];

  /**
   * Provide links for the given document.
   * @param document The document in which the command was invoked.
   * @param token A cancellation token.
   */
  public async provideDocumentLinks(document: TextDocument, token: CancellationToken): Promise<DocumentLink[]> {
    const results: DocumentLink[] = [];
    const documentText: string = document.getText();

    let match: RegExpExecArray | null;

    this.linkPatterns.forEach((element: LinkPattern) => {
      const pattern: RegExp = element.pattern;
      while ((match = pattern.exec(documentText))) {
        const link: string = match[element.linkIndex];
        const preLen: number = match[0].indexOf(link);
        const offset: number = (match.index || 0) + preLen;
        const linkStart: Position = document.positionAt(offset);
        const linkEnd: Position = document.positionAt(offset + link.length);
        try {
          const target: Uri = this.resolveLink(document, link);
          if (target) {
            results.push(
              new DocumentLink(
                new Range(linkStart, linkEnd),
                target
              )
            );
          }
        } catch (e) {
          // noop
        }
      }
    });

    return results;
  }

  /**
   * Resolves given link text within a given document to a URI
   * @param document The document containing link text
   * @param link The link text to resolve
   */
  private resolveLink(document: TextDocument, link: string): Uri {
    const uri: Uri = Uri.parse(link);
    if (uri.scheme) {
      return uri;
    }

    // assume it must be a file
    const base: string = path.dirname(document.fileName);
    let resourcePath: string = uri.path;
    if (!uri.path) {
      resourcePath = document.uri.path;
    } else if (uri.path[0] === "/") {
      const root: WorkspaceFolder = workspace.getWorkspaceFolder(document.uri);
      if (root) {
        resourcePath = path.join(root.uri.fsPath, uri.path);
      }
    } else {
      resourcePath = path.join(base, uri.path);
    }

    if (fs.existsSync(resourcePath)) {
      return Uri.file(resourcePath);
    }

    return undefined;
  }
}

interface LinkPattern {
  pattern: RegExp;
  linkIndex: number;
}
