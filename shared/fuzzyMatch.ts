/**
 * Fuzzy matching utility for area name suggestions
 */

// Levenshtein distance calculation
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

// Normalize string for comparison
function normalize(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ');       // Normalize whitespace
}

// Calculate similarity score (0-100)
function calculateSimilarity(a: string, b: string): number {
  const normA = normalize(a);
  const normB = normalize(b);
  
  // Exact match after normalization
  if (normA === normB) return 100;
  
  // One contains the other
  if (normA.includes(normB) || normB.includes(normA)) {
    const shorter = Math.min(normA.length, normB.length);
    const longer = Math.max(normA.length, normB.length);
    return Math.round((shorter / longer) * 95); // Up to 95% for contains match
  }
  
  // Levenshtein-based similarity
  const distance = levenshteinDistance(normA, normB);
  const maxLength = Math.max(normA.length, normB.length);
  if (maxLength === 0) return 100;
  
  const similarity = Math.round((1 - distance / maxLength) * 100);
  return Math.max(0, similarity);
}

export interface AreaSuggestion {
  type: 'existing' | 'new';
  areaId?: number;
  areaName: string;
  confidence: number;
}

export interface ExistingArea {
  id: number;
  name: string;
  hospitalId: number;
}

const CONFIDENCE_THRESHOLD = 60; // Minimum confidence to suggest an existing area

/**
 * Find the best area suggestion for a given rawAreaText
 * @param rawAreaText - The area text extracted from CustomerRef
 * @param hospitalAreas - Existing areas for the hospital
 * @returns The best suggestion (existing area match or new area)
 */
export function findBestAreaSuggestion(
  rawAreaText: string | null,
  hospitalAreas: ExistingArea[]
): AreaSuggestion | null {
  if (!rawAreaText || rawAreaText.trim() === '') {
    return null;
  }
  
  const trimmedText = rawAreaText.trim();
  
  // Find best matching existing area
  let bestMatch: { area: ExistingArea; confidence: number } | null = null;
  
  for (const area of hospitalAreas) {
    const confidence = calculateSimilarity(trimmedText, area.name);
    
    if (confidence >= CONFIDENCE_THRESHOLD) {
      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = { area, confidence };
      }
    }
  }
  
  // If we found a good match, suggest the existing area
  if (bestMatch) {
    return {
      type: 'existing',
      areaId: bestMatch.area.id,
      areaName: bestMatch.area.name,
      confidence: bestMatch.confidence,
    };
  }
  
  // No good match found, suggest creating a new area
  return {
    type: 'new',
    areaName: trimmedText,
    confidence: 0,
  };
}

/**
 * Get suggestions for multiple unmatched purchases
 */
export function getSuggestionsForPurchases(
  purchases: Array<{ id: number; rawAreaText: string | null; hospitalId: number }>,
  allAreas: ExistingArea[]
): Map<number, AreaSuggestion | null> {
  const suggestions = new Map<number, AreaSuggestion | null>();
  
  // Group areas by hospital for efficient lookup
  const areasByHospital = new Map<number, ExistingArea[]>();
  for (const area of allAreas) {
    const hospitalAreas = areasByHospital.get(area.hospitalId) || [];
    hospitalAreas.push(area);
    areasByHospital.set(area.hospitalId, hospitalAreas);
  }
  
  // Find suggestion for each purchase
  for (const purchase of purchases) {
    const hospitalAreas = areasByHospital.get(purchase.hospitalId) || [];
    const suggestion = findBestAreaSuggestion(purchase.rawAreaText, hospitalAreas);
    suggestions.set(purchase.id, suggestion);
  }
  
  return suggestions;
}
