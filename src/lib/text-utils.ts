/**
 * Capitalizes the first letter of a string
 */
export function capitalizeFirst(text: string): string {
  if (!text || text.length === 0) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Capitalizes the first letter of each sentence in a text
 * Sentences are detected by periods followed by space
 */
export function capitalizeSentences(text: string): string {
  if (!text || text.length === 0) return text;
  
  // Split by period followed by space, capitalize each sentence
  return text
    .split(/\.\s+/)
    .map(sentence => capitalizeFirst(sentence.trim()))
    .join('. ');
}

/**
 * Capitalizes each item in an array of strings (like style notes)
 */
export function capitalizeItems(items: string[]): string[] {
  return items.map(item => capitalizeFirst(item.trim()));
}

