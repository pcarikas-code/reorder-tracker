import { describe, it, expect } from 'vitest';
import { findBestAreaSuggestion, ExistingArea, formatNewAreaSuggestion } from '../shared/fuzzyMatch';

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
    const result = findBestAreaSuggestion('Completely New Area Name', hospitalAreas, 'Test Hospital');
    expect(result).not.toBeNull();
    expect(result?.type).toBe('new');
    expect(result?.confidence).toBe(0);
    expect(result?.areaId).toBeUndefined();
  });

  it('should suggest creating new area when hospital has no areas', () => {
    const result = findBestAreaSuggestion('Some Area', [], 'Test Hospital');
    expect(result).not.toBeNull();
    expect(result?.type).toBe('new');
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
    const result = findBestAreaSuggestion('XYZABC123', hospitalAreas, 'Test Hospital');
    expect(result).not.toBeNull();
    expect(result?.type).toBe('new');
  });
});

describe('formatNewAreaSuggestion - Naming Convention', () => {
  // Area Naming Convention:
  // 1. Where (town)
  // 2. What (department name or function)
  // 3. Location (building name or level or both)
  // 4. Sub-location (room number)

  it('should clean up changeover/replacement text', () => {
    const result = formatNewAreaSuggestion('2-yr Curtain changeover', 'Counties Manukau');
    expect(result.toLowerCase()).not.toContain('changeover');
    expect(result.toLowerCase()).not.toContain('curtain');
    // The cleaned result should just be the town prefix since the rest is noise
  });

  it('should format level/location properly', () => {
    const result = formatNewAreaSuggestion('Lvl 3 ICU', 'Capital & Coast Health');
    expect(result).toContain('ICU');
    expect(result).toMatch(/Lvl|Level/i);
  });

  it('should format room numbers properly', () => {
    const result = formatNewAreaSuggestion('Rms 5 & 6', 'Capital & Coast Health');
    expect(result).toMatch(/Rm|Room/i);
  });

  it('should capitalize department abbreviations', () => {
    const result = formatNewAreaSuggestion('ed department', 'Counties Manukau');
    expect(result).toContain('ED');
  });

  it('should handle PACU abbreviation', () => {
    const result = formatNewAreaSuggestion('Lvl 3 pacu', 'Capital & Coast Health');
    expect(result).toContain('PACU');
  });

  it('should handle HDU abbreviation', () => {
    const result = formatNewAreaSuggestion('New HDU', 'Capital & Coast Health');
    expect(result).toContain('HDU');
  });

  it('should handle ward names', () => {
    const result = formatNewAreaSuggestion('Ward 21 Maternity', 'Counties Manukau');
    expect(result).toContain('Ward');
    expect(result).toContain('Maternity');
  });

  it('should handle location with building/level', () => {
    const result = formatNewAreaSuggestion('LVL 5 Gailbraith (B)', 'Counties Manukau');
    expect(result).toMatch(/Lvl|Level/i);
    expect(result).toContain('5');
  });

  it('should clean up PO numbers', () => {
    const result = formatNewAreaSuggestion('PO CE15082022 Med & Injury', 'Waikato DHB');
    expect(result).not.toMatch(/PO\s*CE\d+/);
    expect(result).toContain('Med');
  });

  it('should handle simple department names', () => {
    const result = formatNewAreaSuggestion('Maternity', 'Counties Manukau');
    // May include town prefix from hospital name
    expect(result).toContain('Maternity');
  });

  it('should handle ED', () => {
    const result = formatNewAreaSuggestion('ED', 'Counties Manukau');
    // May include town prefix from hospital name
    expect(result).toContain('ED');
  });

  it('should handle complex area names with multiple components', () => {
    const result = formatNewAreaSuggestion('Wellington Hospital Gastro Unit', 'Capital & Coast Health');
    expect(result).toContain('Gastro');
    // Should include Wellington as the town
    expect(result.toLowerCase()).toContain('wellington');
  });

  it('should handle orthopaedic clinic with level', () => {
    const result = formatNewAreaSuggestion('Lvl 3 Orthopaedic Clinic', 'Capital & Coast Health');
    expect(result).toContain('Orthopaedic');
    expect(result).toContain('Clinic');
  });

  it('should handle transit lounge', () => {
    const result = formatNewAreaSuggestion('Transit Lounge 2yr Change', 'Capital & Coast Health');
    expect(result).toContain('Transit');
    expect(result).toContain('Lounge');
    expect(result.toLowerCase()).not.toContain('change');
    expect(result.toLowerCase()).not.toContain('2yr');
  });

  it('should handle recovery areas', () => {
    const result = formatNewAreaSuggestion('SSR Lv3 2nd Stage recovery', 'Capital & Coast Health');
    expect(result).toContain('SSR');
    expect(result).toContain('Recovery');
  });

  it('should handle dialysis units', () => {
    const result = formatNewAreaSuggestion('Toto Ora Dialysis A1', 'Counties Manukau');
    expect(result).toContain('Dialysis');
  });

  it('should handle radiology with room', () => {
    const result = formatNewAreaSuggestion('Radiology CT Wait Area', 'Counties Manukau');
    expect(result).toContain('Radiology');
    expect(result).toContain('CT');
  });

  it('should handle surgical units', () => {
    const result = formatNewAreaSuggestion('Elective Short Stay Surgical Unit Ward M4', 'Waikato DHB');
    expect(result).toContain('Surgical');
  });

  it('should handle cardiac care with level', () => {
    const result = formatNewAreaSuggestion('Cardiac Care Lvl 1, Care 3', 'Waikato DHB');
    expect(result).toContain('Cardiac');
    expect(result).toContain('Care');
  });
});
