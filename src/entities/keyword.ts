export interface KeywordDetails {
  description: string;
  onlyScript: boolean;
  links: string[];
}

export interface Keywords {
  [keyword: string]: KeywordDetails;
}

export const keywords: Keywords = {
  "var": {
    description: "",
    onlyScript: false,
    links: []
  },
  "for": {
    description: "",
    onlyScript: true,
    links: []
  },
  "default": {
    description: "",
    onlyScript: true,
    links: []
  },
  "continue": {
    description: "",
    onlyScript: true,
    links: []
  },
  "import": {
    description: "",
    onlyScript: true,
    links: []
  },
  "finally": {
    description: "",
    onlyScript: true,
    links: []
  },
  "interface": {
    description: "",
    onlyScript: true,
    links: []
  },
  "pageencoding": {
    description: "",
    onlyScript: true,
    links: []
  },
  "abort": {
    description: "",
    onlyScript: true,
    links: []
  },
  "exist": {
    description: "",
    onlyScript: true,
    links: []
  },
};
