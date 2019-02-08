/** Adopted from https://github.com/Microsoft/vscode-css-languageservice/blob/27f369f0d527b1952689e223960f779e89457374/src/cssLanguageTypes.ts */

import { Range, Position } from "vscode";

export interface PropertyCompletionContext {
  propertyName: string;
  range: Range;
}

export interface PropertyValueCompletionContext {
  propertyName: string;
  propertyValue?: string;
  range: Range;
}

export interface URILiteralCompletionContext {
  uriValue: string;
  position: Position;
  range: Range;
}

export interface ImportPathCompletionContext {
  pathValue: string;
  position: Position;
  range: Range;
}

export interface ICompletionParticipant {
  onCssProperty?: (context: PropertyCompletionContext) => void;
  onCssPropertyValue?: (context: PropertyValueCompletionContext) => void;
  onCssURILiteralValue?: (context: URILiteralCompletionContext) => void;
  onCssImportPath?: (context: ImportPathCompletionContext) => void;
}

export interface DocumentContext {
  resolveReference(ref: string, base?: string): string;
}

export interface LanguageServiceOptions {
  customDataProviders?: ICSSDataProvider[];
}

export type EntryStatus = "standard" | "experimental" | "nonstandard" | "obsolete";

export interface IPropertyData {
  name: string;
  description?: string;
  browsers?: string[];
  restrictions?: string[];
  status?: EntryStatus;
  syntax?: string;
  values?: IValueData[];
}
export interface IAtDirectiveData {
  name: string;
  description?: string;
  browsers?: string[];
  status?: EntryStatus;
}
export interface IPseudoClassData {
  name: string;
  description?: string;
  browsers?: string[];
  status?: EntryStatus;
}
export interface IPseudoElementData {
  name: string;
  description?: string;
  browsers?: string[];
  status?: EntryStatus;
}

export interface IValueData {
  name: string;
  description?: string;
  browsers?: string[];
  status?: EntryStatus;
}

export interface CSSDataV1 {
  version: 1;
  properties?: IPropertyData[];
  atDirectives?: IAtDirectiveData[];
  pseudoClasses?: IPseudoClassData[];
  pseudoElements?: IPseudoElementData[];
}

export interface ICSSDataProvider {
  provideProperties(): IPropertyData[];
  provideAtDirectives(): IAtDirectiveData[];
  providePseudoClasses(): IPseudoClassData[];
  providePseudoElements(): IPseudoElementData[];
}

export interface ICSSDataManager {
  addDataProviders(providers: ICSSDataProvider[]): void;
  getProperty(name: string): IPropertyData;
  getAtDirective(name: string): IAtDirectiveData;
  getPseudoClass(name: string): IPseudoClassData;
  getPseudoElement(name: string): IPseudoElementData;
  getProperties(majorBrowserSupport?: boolean): IPropertyData[];
  getAtDirectives(majorBrowserSupport?: boolean): IAtDirectiveData[];
  getPseudoClasses(majorBrowserSupport?: boolean): IPseudoClassData[];
  getPseudoElements(majorBrowserSupport?: boolean): IPseudoElementData[];
  isKnownProperty(name: string): boolean;
  isStandardProperty(name: string): boolean;
}

export type IEntry = IPropertyData | IAtDirectiveData | IPseudoClassData | IPseudoElementData | IValueData;
