const cfTagAttributePattern = /<((cf[a-z_]+)\s+)([^<>]*)$/i;

/**
 * Returns a pattern that matches the most recent unclosed cf-tag, capturing the name and attributes
 */
export function getCfTagPattern(): RegExp {
  return cfTagAttributePattern;
}

/**
 * Returns a pattern that matches tags with the given name
 * @param tagName The name of the tag to capture
 * @param hasBody Whether this tag has a body
 */
export function getTagPattern(tagName: string, hasBody: boolean = false): RegExp {
  let pattern: string = `<(${tagName}\s+)([^>]*)`;
  if (hasBody) {
    pattern += `>([\s\S]*?)<\/${tagName}>`;
  } else {
    pattern += "\/?>";
  }
  return new RegExp(pattern, "gi");
}
