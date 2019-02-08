
import { DocumentColorProvider, TextDocument, CancellationToken, Range, Color, ColorPresentation, TextEdit, ColorInformation } from "vscode";
import { getCssRanges, isInCfOutput } from "../utils/contextUtil";
import { getDocumentStateContext, DocumentStateContext } from "../utils/documentUtil";
import { cssPropertyPattern } from "../entities/css/property";
import { cssDataManager, cssColors } from "../entities/css/languageFacts";
import { IPropertyData } from "../entities/css/cssLanguageTypes";

const rgbHexPattern = /#?#([0-9A-F]{3,4}|[0-9A-F]{6}|[0-9A-F]{8})\b/gi;
const rgbFuncPattern = /\brgba?\s*\(\s*([0-9%.]+)\s*,?\s*([0-9%.]+)\s*,?\s*([0-9%.]+)(?:\s*(?:,|\/)?\s*([0-9%.]+)\s*)?\)/gi;
const hslFuncPattern = /\bhsla?\s*\(\s*([0-9.]+)(deg|rad|grad|turn)?\s*,?\s*([0-9%.]+)\s*,?\s*([0-9%.]+)(?:\s*(?:,|\/)?\s*([0-9%.]+)\s*)?\)/gi;
const colorKeywordPattern = new RegExp(`(^|\\s+)(${Object.keys(cssColors).join("|")})(?:\\s+|$)`, "gi");

export default class CFMLDocumentColorProvider implements DocumentColorProvider {

  /**
   * Provide colors for the given document.
   * @param document The document for which to provide the colors
   * @param _token A cancellation token
   */
  public async provideDocumentColors(document: TextDocument, _token: CancellationToken): Promise<ColorInformation[]> {
    let result: ColorInformation[] = [];

    const documentStateContext: DocumentStateContext = getDocumentStateContext(document);
    const cssRanges: Range[] = getCssRanges(documentStateContext);

    for (const cssRange of cssRanges) {
      const rangeTextOffset: number = document.offsetAt(cssRange.start);
      const rangeText: string = documentStateContext.sanitizedDocumentText.slice(rangeTextOffset, document.offsetAt(cssRange.end));
      let propertyMatch: RegExpExecArray;
      while (propertyMatch = cssPropertyPattern.exec(rangeText)) {
        const propertyValuePrefix: string = propertyMatch[1];
        const propertyName: string = propertyMatch[2];
        const propertyValue: string = propertyMatch[3];

        if (!cssDataManager.isKnownProperty(propertyName)) {
          continue;
        }

        const cssProperty: IPropertyData = cssDataManager.getProperty(propertyName);
        if (cssProperty.restrictions && cssProperty.restrictions.includes("color")) {
          let colorMatch: RegExpExecArray;

          // RGB hex
          while (colorMatch = rgbHexPattern.exec(propertyValue)) {
            const rgbHexValue: string = colorMatch[1];
            const colorRange: Range = new Range(
              document.positionAt(rangeTextOffset + propertyMatch.index + propertyValuePrefix.length + colorMatch.index),
              document.positionAt(rangeTextOffset + propertyMatch.index + propertyValuePrefix.length + colorMatch.index + colorMatch[0].length)
            );

            result.push(new ColorInformation(colorRange, hexToColor(rgbHexValue)));
          }

          // RGB function
          while (colorMatch = rgbFuncPattern.exec(propertyValue)) {
            const r: string = colorMatch[1];
            const g: string = colorMatch[2];
            const b: string = colorMatch[3];
            const a: string = colorMatch[4];
            const colorRange: Range = new Range(
              document.positionAt(rangeTextOffset + propertyMatch.index + propertyValuePrefix.length + colorMatch.index),
              document.positionAt(rangeTextOffset + propertyMatch.index + propertyValuePrefix.length + colorMatch.index + colorMatch[0].length)
            );

            let red: number = r.includes("%") ? Number.parseFloat(r) / 100 : Number.parseInt(r) / 255;
            let green: number = g.includes("%") ? Number.parseInt(g) / 100 : Number.parseFloat(g) / 255;
            let blue: number = b.includes("%") ? Number.parseInt(b) / 100 : Number.parseFloat(b) / 255;
            let alpha: number;
            if (a) {
              alpha = a.includes("%") ? Number.parseFloat(a) / 100 : Number.parseFloat(a);
            } else {
              alpha = 1;
            }

            result.push(new ColorInformation(colorRange, new Color(red, green, blue, alpha)));
          }

          // HSL function
          while (colorMatch = hslFuncPattern.exec(propertyValue)) {
            const h: string = colorMatch[1];
            const hUnit: string = colorMatch[2];
            const s: string = colorMatch[3];
            const l: string = colorMatch[4];
            const a: string = colorMatch[5];
            const colorRange: Range = new Range(
              document.positionAt(rangeTextOffset + propertyMatch.index + propertyValuePrefix.length + colorMatch.index),
              document.positionAt(rangeTextOffset + propertyMatch.index + propertyValuePrefix.length + colorMatch.index + colorMatch[0].length)
            );

            let hue: number = Number.parseFloat(h);
            let sat: number = Number.parseFloat(s);
            let light: number = Number.parseFloat(l);
            let alpha: number;
            if (a) {
              alpha = a.includes("%") ? Number.parseFloat(a) / 100 : Number.parseFloat(a);
            } else {
              alpha = 1;
            }
            const hueUnit = hUnit ? hUnit as "deg" | "rad" | "grad" | "turn" : "deg";

            result.push(new ColorInformation(colorRange, colorFromHSL({ h: hue, s: sat, l: light, a: alpha }, hueUnit)));
          }

          // Color keywords
          while (colorMatch = colorKeywordPattern.exec(propertyValue)) {
            const keywordPrefix: string = colorMatch[1];
            const colorKeyword: string = colorMatch[2].toLowerCase();
            const colorRange: Range = new Range(
              document.positionAt(rangeTextOffset + propertyMatch.index + propertyValuePrefix.length + colorMatch.index + keywordPrefix.length),
              document.positionAt(rangeTextOffset + propertyMatch.index + propertyValuePrefix.length + colorMatch.index + keywordPrefix.length + colorKeyword.length)
            );

            result.push(new ColorInformation(colorRange, hexToColor(cssColors[colorKeyword])));
          }
        }
      }
    }

    return result;
  }

  /**
   * Provide representations for a color.
   * @param color The color to show and insert
   * @param context A context object with additional information
   * @param _token A cancellation token
   */
  public async provideColorPresentations(color: Color, context: { document: TextDocument, range: Range }, _token: CancellationToken | boolean): Promise<ColorPresentation[]> {
    let result: ColorPresentation[] = [];
    let red256 = Math.round(color.red * 255), green256 = Math.round(color.green * 255), blue256 = Math.round(color.blue * 255);

    let label: string;
    if (color.alpha === 1) {
      label = `rgb(${red256}, ${green256}, ${blue256})`;
    } else {
      label = `rgba(${red256}, ${green256}, ${blue256}, ${color.alpha})`;
    }
    result.push({ label: label, textEdit: TextEdit.replace(context.range, label) });

    const documentStateContext: DocumentStateContext = getDocumentStateContext(context.document);
    const hexPrefix = isInCfOutput(documentStateContext, context.range.start) ? "##" : "#";
    if (color.alpha === 1) {
      label = `${hexPrefix}${toTwoDigitHex(red256)}${toTwoDigitHex(green256)}${toTwoDigitHex(blue256)}`;
    } else {
      label = `${hexPrefix}${toTwoDigitHex(red256)}${toTwoDigitHex(green256)}${toTwoDigitHex(blue256)}${toTwoDigitHex(Math.round(color.alpha * 255))}`;
    }

    result.push({ label: label, textEdit: TextEdit.replace(context.range, label) });

    const hsl = hslFromColor(color);
    if (hsl.a === 1) {
      label = `hsl(${hsl.h}, ${Math.round(hsl.s * 100)}%, ${Math.round(hsl.l * 100)}%)`;
    } else {
      label = `hsla(${hsl.h}, ${Math.round(hsl.s * 100)}%, ${Math.round(hsl.l * 100)}%, ${hsl.a})`;
    }
    result.push({ label: label, textEdit: TextEdit.replace(context.range, label) });

    return result;
  }
}

function toTwoDigitHex(n: number): string {
  const r = n.toString(16);
  return r.length !== 2 ? "0" + r : r;
}

function fromTwoDigitHex(hex: string): number {
  return Number.parseInt(hex, 16);
}

function hexToColor(rgbHex: string): Color {
  rgbHex = rgbHex.replace(/#/g, "");

  let red: number;
  let green: number;
  let blue: number;
  let alpha: number;
  if (rgbHex.length === 3 || rgbHex.length === 4) {
    red = fromTwoDigitHex(rgbHex.substr(0, 1).repeat(2)) / 255;
    green = fromTwoDigitHex(rgbHex.substr(1, 1).repeat(2)) / 255;
    blue = fromTwoDigitHex(rgbHex.substr(2, 1).repeat(2)) / 255;
    alpha = rgbHex.length === 4 ? fromTwoDigitHex(rgbHex.substr(3, 1).repeat(2)) / 255 : 1;
  } else if (rgbHex.length === 6 || rgbHex.length === 8) {
    red = fromTwoDigitHex(rgbHex.substr(0, 2)) / 255;
    green = fromTwoDigitHex(rgbHex.substr(2, 2)) / 255;
    blue = fromTwoDigitHex(rgbHex.substr(4, 2)) / 255;
    alpha = rgbHex.length === 8 ? fromTwoDigitHex(rgbHex.substr(6, 2)) / 255 : 1;
  } else {
    return undefined;
  }

  return new Color(red, green, blue, alpha);
}

interface HSLA { h: number; s: number; l: number; a: number; }

function hslFromColor(rgba: Color): HSLA {
  const r = rgba.red;
  const g = rgba.green;
  const b = rgba.blue;
  const a = rgba.alpha;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (min + max) / 2;
  const chroma = max - min;

  if (chroma > 0) {
    s = Math.min((l <= 0.5 ? chroma / (2 * l) : chroma / (2 - (2 * l))), 1);

    switch (max) {
      case r: h = (g - b) / chroma + (g < b ? 6 : 0); break;
      case g: h = (b - r) / chroma + 2; break;
      case b: h = (r - g) / chroma + 4; break;
    }

    h *= 60;
    h = Math.round(h);
  }
  return { h, s, l, a };
}

/**
 * Converts HSLA values into `Color`
 * @param hsla The hue, saturation, lightness, and alpha values. Hue is in units based on `hueUnit`. Saturation and lightness are percentages.
 * @param hueUnit One of deg, rad, grad, turn
 */
function colorFromHSL(hsla: HSLA, hueUnit: "deg" | "rad" | "grad" | "turn" = "deg"): Color {
  let hue: number;
  switch (hueUnit) {
    case "deg": hue = hsla.h / 60.0; break;
    case "rad": hue = hsla.h * 3 / Math.PI; break;
    case "grad": hue = hsla.h * 6 / 400; break;
    case "turn": hue = hsla.h * 6; break;
  }
  const sat = hsla.s / 100;
  const light = hsla.l / 100;

  if (sat === 0) {
    return new Color(light, light, light, hsla.a);
  } else {
    const hueToRgb = (t1: number, t2: number, h: number) => {
      while (h < 0) { h += 6; }
      while (h >= 6) { h -= 6; }

      if (h < 1) { return (t2 - t1) * h + t1; }
      if (h < 3) { return t2; }
      if (h < 4) { return (t2 - t1) * (4 - h) + t1; }
      return t1;
    };
    const t2 = light <= 0.5 ? (light * (sat + 1)) : (light + sat - (light * sat));
    const t1 = light * 2 - t2;
    return new Color(hueToRgb(t1, t2, hue + 2), hueToRgb(t1, t2, hue), hueToRgb(t1, t2, hue - 2), hsla.a);
  }
}
