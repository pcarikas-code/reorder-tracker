/**
 * Fuzzy matching utility for area name suggestions
 * 
 * Area Naming Convention:
 * 1. Where (facility name like "Children's Hospital", "Greenlane", OR city/town like "Wellington", "Kenepuru")
 * 2. What (department name or function like "Piko Ward", "ED", "PACU")
 * 3. Location (building name or level like "Lvl 4", "Building A")
 * 4. Sub-location (room number like "Rm 5", "Rms 5 & 6")
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

// Known facility names (Where) - these are specific hospital/campus names
// Priority: match these first before falling back to city/town names
const FACILITY_PATTERNS = [
  // Hospital campuses
  "children's hospital", "childrens hospital",
  "starship", "greenlane", "galbraith", "middlemore",
  "hutt valley", "kenepuru", "kapiti", "waikanae",
  "pukekohe", "manukau super clinic", "botany downs",
  "papakura", "mangere", "north shore", "waitakere",
  // Regional hospitals
  "whangarei", "dargaville", "wairau", "tauranga", "hamilton",
  "thames", "tokoroa", "rotorua", "taupo", "whakatane", "opotiki",
  "gisborne", "napier", "hastings", "palmerston", "porirua",
  "nelson", "blenheim", "christchurch", "timaru", "dunedin",
  "invercargill", "queenstown", "greymouth", "hokitika", "westport",
  "ashburton", "oamaru", "alexandra", "cromwell", "wanaka", "gore",
  "balclutha", "clutha", "taranaki", "new plymouth",
  // Specific facilities
  "wrh", "wellington regional", "auckland city",
  "mercy ascot", "epsom", "onehunga", "tamaki",
  "rhoda read", "kakariki", "toi whanau", "canopy",
];

// City/town names that can be used as Where if no facility found
const CITY_PATTERNS = [
  'wellington', 'auckland', 'christchurch', 'hamilton', 'tauranga',
  'dunedin', 'palmerston north', 'napier', 'hastings', 'nelson',
  'rotorua', 'new plymouth', 'whangarei', 'invercargill', 'whanganui',
  'gisborne', 'blenheim', 'timaru', 'pukekohe', 'taupo',
];

// Known department/function keywords (What)
const DEPARTMENT_PATTERNS = [
  // Wards
  'ward', 'piko ward', 'kowhai ward', 'heart ward', 'decant ward',
  // Emergency/Acute
  'ed', 'ced', 'emergency', 'adult ed', "children's ed", 'kids er',
  'minor care zone', 'triage', 'resus', 'resuscitation', 'monitored',
  'assu', 'mssu', 'sled', 'wra',
  // Critical Care
  'icu', 'hdu', 'ccu', 'nicu', 'picu', 'pacu', 'mapu', 'edou',
  'critical care', 'intensive care', 'coronary care',
  // Surgery/Theatre
  'theatre', 'theatres', 'surgery', 'surgical', 'day stay', 'day surgical',
  'ssr', 'holding bays', 'recovery', 'pre-op', 'preop', 'post-op', 'postop',
  'anaesthetic bays', 'delivery suite',
  // Specialties
  'maternity', 'birthing', 'labour', 'labor', 'neonatal', 'special care',
  'paediatric', 'pediatric', 'oncology', 'cardiology', 'cardiac',
  'cardiothoracic', 'heart lung', 'stroke', 'neurology', 'neurosurgery',
  'orthopaedic', 'orthopedic', 'orthopaedics', 'fracture', 'joint',
  'renal', 'dialysis', 'urology', 'gastro', 'gastroenterology',
  'respiratory', 'pulmonary', 'dermatology', 'ophthalmology', 'ent',
  'dental', 'vascular', 'thoracic', 'spinal', 'burns', 'plastics', 'trauma',
  // Imaging/Diagnostics
  'radiology', 'ct', 'ct scanning', 'mri', 'xray', 'x-ray', 'imaging',
  'ultrasound', 'mammography', 'fluoroscopy', 'nuclear medicine',
  'pet', 'spect', 'cath lab', 'angio', 'interventional',
  // Procedures
  'endoscopy', 'colonoscopy', 'bronchoscopy', 'consults', 'consult rooms',
  'clinic', 'clinics', 'clinic rms', 'outpatient', 'outpatients',
  // Rehab/Support
  'rehab', 'rehabilitation', 'older persons', 'aged care', 'respite',
  'mental health', 'psychiatric', 'psych', 'palliative', 'hospice',
  'physiotherapy', 'physio', 'occupational therapy', 'ot', 'speech therapy',
  'gym room',
  // Other areas
  'lounge', 'transit lounge', 'reception', 'waiting', 'prep', 'preparation',
  'admissions', 'discharge', 'district nurse', 'community health',
  'primary care', 'gp', 'super clinic', 'health centre',
  'pharmacy', 'pathology', 'laboratory', 'lab', 'blood bank', 'transfusion',
  'infection control', 'sterilisation', 'sterile', 'cssd', 'supply',
  'admin', 'administration', 'records', 'staff changing',
  'flexi', 'minimal assist', 'lay-z boy', 'sau', 'irw',
  'ambulatory', 'assessment', 'adult assessment',
  'inpatient', 'satellite', 'sliding doors',
];

// Known location patterns (Location - building/level)
const LOCATION_REGEX_PATTERNS = [
  /\blvl\.?\s*\d+/i,           // Lvl 3, Lvl. 3
  /\blevel\s*\d+/i,            // Level 3
  /\bl\s*\d+\b/i,              // L3
  /\bfloor\s*\d+/i,            // Floor 3
  /\bbldg\.?\s*\d+/i,          // Bldg 4, Bldg. 4
  /\bbuilding\s*[a-z0-9]+/i,   // Building A, Building 1
  /\bblock\s*[a-z0-9]+/i,      // Block A
  /\bwing\s*[a-z0-9]+/i,       // Wing A
  /\b[a-z]\s*wing\b/i,         // A Wing
  /\bunit\s*\d+/i,             // Unit 1
  /\bsouth\b/i,                // South
  /\bnorth\b/i,                // North
  /\beast\b/i,                 // East
  /\bwest\b/i,                 // West
  /\b[a-z]\s*side\b/i,         // A Side, Right Side
  /\bright\s*side/i,           // Right Side
  /\bleft\s*side/i,            // Left Side
];

// Known sub-location patterns (Sub-location - room numbers)
// These patterns should only match room references with specific numbers
const SUBLOCATION_REGEX_PATTERNS = [
  /\brms\.?\s*\d[\d&\s,and]*/i,   // Rms 5 & 6, Rms 2, 3 and SAU (must start with digit)
  /\brm\.?\s*\d+/i,               // Rm 5, Rm. 5
  /\brooms?\s*\d[\d&\s,-]*/i,     // Rooms 5-6, Room 5, 6 (must start with digit)
  /\bbays?\s*[\d&\s,-]+/i,        // Bays 1-4
  /\bbay\s*\d+/i,                 // Bay 5
  /\bbeds?\s*[\d&\s,-]+/i,        // Beds 1-4
  /\bbed\s*\d+/i,                 // Bed 5
  /\bspaces?\s*[\d&\s,-]+/i,      // Spaces 1-4
  /\bspace\s*\d+/i,               // Space 1
  /\bcare\s*\d+/i,                // Care 3
  /\bresus\s*[\d&\s,-]+/i,        // Resus 1-4, Resus 5 and 6
  /\bchair\s*bays?\b/i,           // Chair Bays
  /\bbed\s*spaces?\b/i,           // Bed Spaces
];

// Noise patterns to remove from raw text
const NOISE_PATTERNS = [
  /\b\d+\s*[-–]?\s*yr\s*(curtain\s*)?(changeover|change\s*over|replacement)s?\b/gi,
  /\b\d+\s*[-–]?\s*year\s*(curtain\s*)?(changeover|change\s*over|replacement)s?\b/gi,
  /\b(curtain\s*)?(changeover|change\s*over|replacement)s?\b/gi,
  /\bcurtains?\b/gi,
  /\b2yr\b/gi,
  /\bchange\b/gi,
  /\bnew\b/gi,
  /\breplacements?\b/gi,
  /\bscreens?\b/gi,
  /\bPO[-\s]?\d+\b/gi,
  /\bP\d{6,}\b/gi,
  /\bCE\d+\b/gi,
  /\b\d{6,}\b/g,                    // Long numbers (PO numbers without prefix)
  /\b\d{2}\/\d{2}\/\d{2,4}\b/g,    // Dates
  /\bacceptance\s*email\b/gi,
  /\bemail\b/gi,
  /\bbalance\s*of\s*(curtains?)?\b/gi,
  /\bhw\b/gi,
  /\bper\s+[a-z]+\s+[a-z]+\s+email\b/gi, // "Per Patricia Milne email"
  /\b\d+\s*x\s*(med|lge|sml|small|medium|large)\b/gi, // "5 x Med"
  /\+/g,                            // Plus signs between PO numbers
];

/**
 * Parse rawAreaText and extract components according to naming convention
 */
interface ParsedArea {
  where: string | null;      // Facility name or city/town
  what: string | null;       // Department/function
  location: string | null;   // Building/level
  subLocation: string | null; // Room number
  original: string;
}

function parseAreaText(rawText: string, hospitalName: string): ParsedArea {
  const result: ParsedArea = {
    where: null,
    what: null,
    location: null,
    subLocation: null,
    original: rawText.trim()
  };
  
  // First clean up noise patterns from the raw text
  let text = rawText.trim();
  for (const pattern of NOISE_PATTERNS) {
    text = text.replace(pattern, ' ');
  }
  text = text.replace(/\s*[-–]\s*/g, ' ').replace(/\s+/g, ' ').trim();
  
  // Look for facility names (Where) FIRST - prioritize these over city names
  const lowerText = text.toLowerCase();
  for (const facility of FACILITY_PATTERNS) {
    if (lowerText.includes(facility)) {
      result.where = capitalizeWords(facility);
      // Remove the facility name from text to avoid duplication
      const facilityRegex = new RegExp(`\\b${escapeRegex(facility)}\\b`, 'gi');
      text = text.replace(facilityRegex, ' ').replace(/\s+/g, ' ').trim();
      break;
    }
  }
  
  // If a facility was found, also remove any city name prefix (e.g., "Wellington" before "Children's Hospital")
  if (result.where) {
    for (const city of CITY_PATTERNS) {
      const cityRegex = new RegExp(`\\b${escapeRegex(city)}\\b`, 'gi');
      text = text.replace(cityRegex, ' ').replace(/\s+/g, ' ').trim();
    }
  }
  
  // Remove "Hospital" suffix when preceded by a city name (e.g., "Wellington Hospital" -> just use the facility/dept)
  text = text.replace(/\b(wellington|auckland|christchurch|hamilton|dunedin)\s+hospital\s*[-:]?\s*/gi, '');
  
  // Handle "Rooms" / "Clinic Rooms" - convert to abbreviation and keep as part of department
  // "Clinic Rooms" -> "Clinic Rms"
  // "Rooms Building 4 Level 1" -> "Rms" (keep Rms in department, Building/Level will be extracted as location)
  text = text.replace(/\bclinic\s+rooms?\b/gi, 'Clinic Rms');
  text = text.replace(/\brooms?(?=\s+(building|bldg|level|lvl|block|wing))/gi, 'Rms');
  
  // Extract sub-location (room numbers) - specific room numbers like "Rm 5", "Rms 5 & 6"
  for (const pattern of SUBLOCATION_REGEX_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      result.subLocation = match[0].trim();
      text = text.replace(pattern, ' ').replace(/\s+/g, ' ').trim();
      break; // Only take the first match
    }
  }
  
  // Extract location (level/building) - preserve order as they appear in original text
  // First, find all matches with their positions
  const locationMatches: Array<{match: string, index: number}> = [];
  for (const pattern of LOCATION_REGEX_PATTERNS) {
    const match = text.match(pattern);
    if (match && match.index !== undefined) {
      locationMatches.push({ match: match[0].trim(), index: match.index });
    }
  }
  // Sort by position in text to preserve original order
  locationMatches.sort((a, b) => a.index - b.index);
  // Remove matches from text and collect parts
  for (const lm of locationMatches) {
    const pattern = new RegExp(escapeRegex(lm.match), 'i');
    text = text.replace(pattern, ' ').replace(/\s+/g, ' ').trim();
  }
  if (locationMatches.length > 0) {
    result.location = locationMatches.map(lm => lm.match).join(' ');
  }
  
  // If no facility found from text, check hospital name for facility hints
  if (!result.where) {
    const hospitalLower = hospitalName.toLowerCase();
    for (const facility of FACILITY_PATTERNS) {
      if (hospitalLower.includes(facility)) {
        // Don't add city names from hospital name - only specific facilities
        if (!CITY_PATTERNS.includes(facility)) {
          result.where = capitalizeWords(facility);
        }
        break;
      }
    }
  }
  
  // The remaining text should be the department/function (What)
  if (text.length > 0) {
    // Clean up and set as department
    let dept = text
      .replace(/\s*[-–:]\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (dept.length > 0) {
      result.what = dept;
    }
  }
  
  return result;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Capitalize first letter of each word
 */
function capitalizeWords(str: string): string {
  return str.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Standardize common abbreviations
 */
function standardizeAbbreviations(text: string): string {
  return text
    // Medical unit abbreviations - must be uppercase
    .replace(/\bIcu\b/g, 'ICU')
    .replace(/\bEd\b/g, 'ED')
    .replace(/\bCed\b/g, 'CED')
    .replace(/\bHdu\b/g, 'HDU')
    .replace(/\bCcu\b/g, 'CCU')
    .replace(/\bNicu\b/g, 'NICU')
    .replace(/\bPicu\b/g, 'PICU')
    .replace(/\bPacu\b/g, 'PACU')
    .replace(/\bMapu\b/g, 'MAPU')
    .replace(/\bEdou\b/g, 'EDOU')
    .replace(/\bSsr\b/g, 'SSR')
    .replace(/\bSau\b/g, 'SAU')
    .replace(/\bSapu\b/g, 'SAPU')
    .replace(/\bAssu\b/g, 'ASSU')
    .replace(/\bMssu\b/g, 'MSSU')
    .replace(/\bIrw\b/g, 'IRW')
    .replace(/\bWrh\b/g, 'WRH')
    // Imaging abbreviations
    .replace(/\bCt\b/g, 'CT')
    .replace(/\bMri\b/g, 'MRI')
    .replace(/\bEnt\b/g, 'ENT')
    .replace(/\bPet\b/g, 'PET')
    // Location abbreviations
    .replace(/\bLvl\b/g, 'Lvl')
    .replace(/\bBldg\b/g, 'Bldg')
    .replace(/\bRm\b/g, 'Rm')
    .replace(/\bRms\b/g, 'Rms')
    // Other
    .replace(/\bGp\b/g, 'GP')
    .replace(/\bOt\b/g, 'OT');
}

/**
 * Format area name according to naming convention
 * Convention: Where What Location Sub-location
 */
function formatAreaName(parsed: ParsedArea): string {
  const parts: string[] = [];
  
  // Add Where (facility name or city)
  if (parsed.where) {
    parts.push(parsed.where);
  }
  
  // Add What (department) - this is the main identifier
  if (parsed.what) {
    let dept = capitalizeWords(parsed.what);
    dept = standardizeAbbreviations(dept);
    parts.push(dept);
  }
  
  // Add Location (level/building)
  if (parsed.location) {
    let loc = parsed.location
      .replace(/\blvl\.?\s*/gi, 'Lvl ')
      .replace(/\blevel\s*/gi, 'Lvl ')
      .replace(/\bl\s*(\d+)\b/gi, 'Lvl $1')
      .replace(/\bfloor\s*/gi, 'Floor ')
      .replace(/\bbldg\.?\s*/gi, 'Bldg ')
      .replace(/\bbuilding\s*/gi, 'Bldg ')
      .replace(/\bblock\s*/gi, 'Block ')
      .replace(/\bwing\s*/gi, 'Wing ')
      .replace(/\bunit\s*/gi, 'Unit ')
      .replace(/\s+/g, ' ')
      .trim();
    loc = capitalizeWords(loc);
    parts.push(loc);
  }
  
  // Add Sub-location (room number)
  if (parsed.subLocation) {
    let subLoc = parsed.subLocation
      .replace(/\brms\.?\s*/gi, 'Rms ')
      .replace(/\brm\.?(?!s)\s*/gi, 'Rm ')  // Negative lookahead to not match 'rms'
      .replace(/\brooms?\s*/gi, 'Rm ')
      .replace(/\bbays?\s*/gi, 'Bays ')
      .replace(/\bbeds?\s*/gi, 'Beds ')
      .replace(/\bspaces?\s*/gi, 'Spaces ')
      .replace(/\bcare\s*/gi, 'Care ')
      .replace(/\bresus\s*/gi, 'Resus ')
      .replace(/\s+/g, ' ')
      .trim();
    parts.push(subLoc);
  }
  
  // If we couldn't parse anything meaningful, return cleaned original
  if (parts.length === 0) {
    return cleanAreaName(parsed.original);
  }
  
  let result = parts.join(' ').replace(/\s+/g, ' ').trim();
  return standardizeAbbreviations(result);
}

/**
 * Clean up area name - remove noise but keep structure
 */
function cleanAreaName(name: string): string {
  let cleaned = name;
  
  // Apply noise patterns
  for (const pattern of NOISE_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ');
  }
  
  // Clean up punctuation and whitespace
  cleaned = cleaned
    .replace(/[,;:]+/g, ' ')
    .replace(/\s*[-–]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // If nothing left after cleaning, return empty string (not original noisy text)
  if (!cleaned || cleaned.length < 2) {
    return '';
  }
  
  // Capitalize properly
  cleaned = cleaned
    .split(' ')
    .filter(word => word.length > 0)
    .map(word => {
      // Keep abbreviations uppercase
      if (/^[A-Z]{2,}$/.test(word)) return word;
      // Capitalize first letter
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
  
  return standardizeAbbreviations(cleaned);
}

/**
 * Generate a formatted area name suggestion for new areas
 */
export function formatNewAreaSuggestion(rawAreaText: string, hospitalName: string): string {
  // First try to parse according to naming convention
  const parsed = parseAreaText(rawAreaText, hospitalName);
  const formatted = formatAreaName(parsed);
  
  // If formatting produced a reasonable result, use it
  if (formatted && formatted.length >= 3 && formatted !== rawAreaText.trim()) {
    return formatted;
  }
  
  // Otherwise just clean up the original
  return cleanAreaName(rawAreaText);
}

/**
 * Clean raw area text for matching - remove PO numbers, hospital prefixes, etc.
 */
function cleanForMatching(rawText: string, hospitalName: string): string {
  let text = rawText.trim();
  
  // Apply noise patterns
  for (const pattern of NOISE_PATTERNS) {
    text = text.replace(pattern, ' ');
  }
  
  // Remove "[City] Hospital -" patterns
  text = text.replace(/\b(wellington|auckland|christchurch|hamilton|dunedin|middlemore|whangarei)\s*(hospital|health)?\s*[-:]\s*/gi, '');
  
  // Remove standalone city prefixes at start
  for (const city of CITY_PATTERNS) {
    const patternStandalone = new RegExp(`^${escapeRegex(city)}\\s+`, 'gi');
    text = text.replace(patternStandalone, '');
  }
  
  // Remove hospital name parts if present
  if (hospitalName) {
    const hospitalParts = hospitalName.toLowerCase()
      .replace(/[-&]/g, ' ')
      .replace(/\s+/g, ' ')
      .split(' ')
      .filter(p => p.length > 2 && !['new', 'zealand', 'health', 'services', 'district', 'board', 'dhb', 'the'].includes(p));
    
    for (const part of hospitalParts) {
      if (CITY_PATTERNS.includes(part)) {
        // Remove city names followed by "Hospital" or separator
        const pattern = new RegExp(`\\b${escapeRegex(part)}\\s*(hospital|health)?\\s*[-:]?\\s*`, 'gi');
        text = text.replace(pattern, '');
      }
    }
  }
  
  // Clean up separators and whitespace
  text = text.replace(/^\s*[-:]+\s*/, '').replace(/\s+/g, ' ').trim();
  
  return text;
}

/**
 * Find the best area suggestion for a given rawAreaText
 * @param rawAreaText - The area text extracted from CustomerRef
 * @param hospitalAreas - Existing areas for the hospital
 * @param hospitalName - Name of the hospital (for context in formatting)
 * @returns The best suggestion (existing area match or new area)
 */
export function findBestAreaSuggestion(
  rawAreaText: string | null,
  hospitalAreas: ExistingArea[],
  hospitalName: string = ''
): AreaSuggestion | null {
  if (!rawAreaText || rawAreaText.trim() === '') {
    return null;
  }
  
  const trimmedText = rawAreaText.trim();
  
  // Clean the text for better matching
  const cleanedText = cleanForMatching(trimmedText, hospitalName);
  
  // Find best matching existing area
  let bestMatch: { area: ExistingArea; confidence: number } | null = null;
  
  for (const area of hospitalAreas) {
    // Also clean the area name to remove location prefixes for comparison
    const cleanedAreaName = cleanForMatching(area.name, hospitalName);
    
    // Try multiple matching strategies:
    // 1. Original text vs original area name
    // 2. Cleaned text vs original area name  
    // 3. Cleaned text vs cleaned area name
    // 4. Original text vs cleaned area name
    const confidenceOriginal = calculateSimilarity(trimmedText, area.name);
    const confidenceCleanedVsOriginal = calculateSimilarity(cleanedText, area.name);
    const confidenceCleanedVsCleaned = calculateSimilarity(cleanedText, cleanedAreaName);
    const confidenceOriginalVsCleaned = calculateSimilarity(trimmedText, cleanedAreaName);
    
    const confidence = Math.max(
      confidenceOriginal,
      confidenceCleanedVsOriginal,
      confidenceCleanedVsCleaned,
      confidenceOriginalVsCleaned
    );
    
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
  
  // No good match found, suggest creating a new area with formatted name
  const formattedName = formatNewAreaSuggestion(trimmedText, hospitalName);
  
  return {
    type: 'new',
    areaName: formattedName,
    confidence: 0,
  };
}

/**
 * Get suggestions for multiple unmatched purchases
 */
export function getSuggestionsForPurchases(
  purchases: Array<{ id: number; rawAreaText: string | null; hospitalId: number }>,
  areasByHospital: Map<number, ExistingArea[]>,
  hospitalNames: Map<number, string>
): Map<number, AreaSuggestion | null> {
  const suggestions = new Map<number, AreaSuggestion | null>();
  
  for (const purchase of purchases) {
    const hospitalAreas = areasByHospital.get(purchase.hospitalId) || [];
    const hospitalName = hospitalNames.get(purchase.hospitalId) || '';
    const suggestion = findBestAreaSuggestion(purchase.rawAreaText, hospitalAreas, hospitalName);
    suggestions.set(purchase.id, suggestion);
  }
  
  return suggestions;
}
