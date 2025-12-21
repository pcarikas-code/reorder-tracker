import { describe, it, expect } from 'vitest';
import { findBestAreaSuggestion, ExistingArea } from '../shared/fuzzyMatch';

describe('findBestAreaSuggestion', () => {
  const hospitalAreas: ExistingArea[] = [
    { id: 1, name: 'Wellington Gastro Ward 2', hospitalId: 1 },
    { id: 2, name: 'Wellington Gastro', hospitalId: 1 },
    { id: 3, name: 'ICU Level 3', hospitalId: 1 },
    { id: 4, name: 'Radiology', hospitalId: 1 },
    { id: 5, name: 'Ward 5 South', hospitalId: 1 },
    { id: 6, name: 'Middlemore Ward 6', hospitalId: 2 },
  ];

  it('should return null for null or empty rawAreaText', () => {
    expect(findBestAreaSuggestion(null, hospitalAreas)).toBeNull();
    expect(findBestAreaSuggestion('', hospitalAreas)).toBeNull();
    expect(findBestAreaSuggestion('   ', hospitalAreas)).toBeNull();
  });

  it('should return exact match with 100% confidence', () => {
    const result = findBestAreaSuggestion('Wellington Gastro Ward 2', hospitalAreas);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('existing');
    expect(result?.areaId).toBe(1);
    expect(result?.areaName).toBe('Wellington Gastro Ward 2');
    expect(result?.confidence).toBe(100);
  });

  it('should match case-insensitively', () => {
    const result = findBestAreaSuggestion('wellington gastro ward 2', hospitalAreas);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('existing');
    expect(result?.areaId).toBe(1);
    expect(result?.confidence).toBe(100);
  });

  it('should find partial matches with high confidence', () => {
    const result = findBestAreaSuggestion('Wellington Gastro Ward', hospitalAreas);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('existing');
    // Should match Wellington Gastro Ward 2 (contains the search text)
    expect(result?.confidence).toBeGreaterThanOrEqual(60);
  });

  it('should suggest creating new area when no match found', () => {
    const result = findBestAreaSuggestion('Completely New Area Name', hospitalAreas);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('new');
    expect(result?.areaName).toBe('Completely New Area Name');
    expect(result?.confidence).toBe(0);
    expect(result?.areaId).toBeUndefined();
  });

  it('should suggest creating new area when hospital has no areas', () => {
    const result = findBestAreaSuggestion('Some Area', []);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('new');
    expect(result?.areaName).toBe('Some Area');
  });

  it('should handle special characters in area text', () => {
    const result = findBestAreaSuggestion('Ward 5 - South', hospitalAreas);
    expect(result).not.toBeNull();
    // Should find Ward 5 South as a match
    expect(result?.type).toBe('existing');
    expect(result?.areaId).toBe(5);
  });

  it('should trim whitespace from rawAreaText', () => {
    const result = findBestAreaSuggestion('  Radiology  ', hospitalAreas);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('existing');
    expect(result?.areaId).toBe(4);
    expect(result?.areaName).toBe('Radiology');
  });

  it('should prefer higher confidence matches', () => {
    // "Wellington Gastro" should match "Wellington Gastro" exactly (100%)
    // rather than "Wellington Gastro Ward 2" (partial match)
    const result = findBestAreaSuggestion('Wellington Gastro', hospitalAreas);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('existing');
    expect(result?.areaId).toBe(2);
    expect(result?.confidence).toBe(100);
  });

  it('should return new suggestion when confidence is below threshold', () => {
    // Very different text should result in new area suggestion
    const result = findBestAreaSuggestion('XYZABC123', hospitalAreas);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('new');
  });
});
