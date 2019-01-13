declare function trie(input: string[]): ITrie;

export interface ITrie {
  /**
   * Get the generated raw trie object
   */
  tree(): Object;

  /**
   * Get a string representation of the trie
   */
  dump(spacer?: number): string;

  /**
   * Add a new word to the trie
   */
  addWord(word: string): ITrie;

  /**
   * Remove an existing word from the trie
   */
  removeWord(word: string): ITrie;

  /**
   * Check a prefix is valid
   */
  isPrefix(prefix: string): boolean;

  /**
   * Get a list of all words in the trie with the given prefix
   */
  getPrefix(strPrefix: string, sorted?: boolean): string[];

  /**
   * Get a random word in the trie with the given prefix
   */
  getRandomWordWithPrefix(strPrefix: string): string[];

  /**
   * Count the number of words with the given prefixSearch
   */
  countPrefix(strPrefix: string): number;

  /**
   * Get all words in the trie
   */
  getWords(sorted?: boolean): string[];

  /**
   * Check the existence of a word in the trie
   */
  hasWord(word: string): boolean;

  /**
   * Get a list of valid anagrams that can be made from the given letters
   */
  getAnagrams(letters: string): string[];

  /**
   * Get a list of all sub-anagrams that can be made from the given letters
   */
  getSubAnagrams(letters: string): string[];
}

export default trie;
