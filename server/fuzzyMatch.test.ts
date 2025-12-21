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
    // When all content is noise, result should be empty
    expect(result).toBe('');
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
    // Wellington Hospital prefix should be stripped since it's just city + hospital
    expect(result).toBe('Gastro Unit');
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

describe('formatNewAreaSuggestion - Naming Convention Hierarchy', () => {
  // Area Naming Convention (hierarchical):
  // 1. Where (facility name like "Children's Hospital" OR city/town like "Kenepuru")
  // 2. What (department name or function like "Piko Ward", "ED", "PACU")
  // 3. Location (building name or level like "Lvl 4", "Bldg A")
  // 4. Sub-location (room number like "Rm 5", "Rms 5 & 6")

  it('should extract facility name as Where and format correctly', () => {
    const result = formatNewAreaSuggestion(
      "296222 + 296654 + 296725 Wellington Children's Hospital Level 4 - Piko Ward",
      'Capital & Coast Health New Zealand'
    );
    expect(result).toBe("Children's Hospital Piko Ward Lvl 4");
  });

  it('should strip city+hospital prefix when no facility name', () => {
    const result = formatNewAreaSuggestion(
      'Wellington Hospital Gastro Unit',
      'Capital & Coast Health New Zealand'
    );
    expect(result).toBe('Gastro Unit');
  });

  it('should strip PO numbers and city+hospital prefix', () => {
    const result = formatNewAreaSuggestion(
      'PO293774 - Wellington Hospital - Minor Care Zone',
      'Capital & Coast Health New Zealand'
    );
    expect(result).toBe('Minor Care Zone');
  });

  it('should keep facility name like Kenepuru', () => {
    const result = formatNewAreaSuggestion(
      'Kenepuru PACU',
      'Capital & Coast Health New Zealand'
    );
    expect(result).toBe('Kenepuru PACU');
  });

  it('should handle Greenlane with Clinic Rooms and Building/Level', () => {
    const result = formatNewAreaSuggestion(
      'Greenlane Clinic Rooms Building 4 Level 1',
      'Auckland - Health New Zealand'
    );
    expect(result).toBe('Greenlane Clinic Rms Bldg 4 Lvl 1');
  });

  it('should keep facility name like Middlemore with ward', () => {
    const result = formatNewAreaSuggestion(
      'Middlemore Ward 21',
      'Counties Manukau - Health New Zealand'
    );
    expect(result).toBe('Middlemore Ward 21');
  });

  it('should reorder Level before department when Level comes first', () => {
    const result = formatNewAreaSuggestion(
      'Lvl 3 ICU',
      'Capital & Coast Health New Zealand'
    );
    expect(result).toBe('ICU Lvl 3');
  });

  it('should clean noise like 2yr Change', () => {
    const result = formatNewAreaSuggestion(
      'Transit Lounge 2yr Change',
      'Capital & Coast Health New Zealand'
    );
    expect(result).toBe('Transit Lounge');
  });

  it('should handle Hutt Valley as facility name', () => {
    const result = formatNewAreaSuggestion(
      'Hutt Valley PACU',
      'Capital & Coast Health New Zealand'
    );
    expect(result).toBe('Hutt Valley PACU');
  });

  it('should handle Starship as facility name', () => {
    const result = formatNewAreaSuggestion(
      'Starship Heart Ward A',
      'Auckland - Health New Zealand'
    );
    expect(result).toBe('Starship Heart Ward A');
  });
});
