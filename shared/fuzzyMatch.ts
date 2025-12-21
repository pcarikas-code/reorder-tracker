/**
 * Fuzzy matching utility for area name suggestions
 * 
 * Area Naming Convention:
 * 1. Where (town)
 * 2. What (department name or function)
 * 3. Location (building name or level or both)
 * 4. Sub-location (room number)
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

// Known town/location prefixes (Where)
const TOWN_PATTERNS = [
  'wellington', 'middlemore', 'whangarei', 'pukekohe', 'manukau', 'mangere',
  'dargaville', 'wairau', 'tauranga', 'hamilton', 'thames', 'tokoroa',
  'kenepuru', 'kapiti', 'hutt', 'porirua', 'palmerston', 'hastings',
  'napier', 'gisborne', 'rotorua', 'taupo', 'whakatane', 'opotiki',
  'nelson', 'blenheim', 'christchurch', 'timaru', 'dunedin', 'invercargill',
  'queenstown', 'greymouth', 'hokitika', 'westport', 'ashburton', 'oamaru',
  'alexandra', 'cromwell', 'wanaka', 'gore', 'balclutha', 'clutha',
  'north shore', 'waitakere', 'auckland', 'taranaki', 'new plymouth',
  'waikato', 'bay of plenty', 'hawkes bay', 'tasman', 'marlborough',
  'west coast', 'canterbury', 'otago', 'southland', 'northland',
  'galbraith', 'puke', 'allevia', 'epsom', 'onehunga', 'tamaki',
  'rhoda read', 'kakariki', 'toi whanau'
];

// Known department/function keywords (What)
const DEPARTMENT_PATTERNS = [
  'ward', 'icu', 'ed', 'emergency', 'theatre', 'theatres', 'surgery', 'surgical',
  'maternity', 'paediatric', 'pediatric', 'oncology', 'cardiology', 'cardiac',
  'neurology', 'neurosurgery', 'orthopaedic', 'orthopedic', 'orthopaedics',
  'radiology', 'ct', 'mri', 'xray', 'x-ray', 'imaging', 'ultrasound',
  'renal', 'dialysis', 'urology', 'gastro', 'gastroenterology',
  'respiratory', 'pulmonary', 'dermatology', 'ophthalmology', 'ent',
  'dental', 'outpatient', 'outpatients', 'clinic', 'clinics', 'day stay',
  'day unit', 'day care', 'short stay', 'long stay', 'recovery', 'pacu',
  'pre-op', 'preop', 'post-op', 'postop', 'ssr', 'hdu', 'ccu', 'nicu', 'picu',
  'assessment', 'triage', 'resus', 'resuscitation', 'monitored',
  'medical', 'medicine', 'general', 'acute', 'rehab', 'rehabilitation',
  'palliative', 'hospice', 'mental health', 'psychiatric', 'psych',
  'community health', 'primary care', 'gp', 'super clinic', 'health centre',
  'lounge', 'transit', 'reception', 'waiting', 'prep', 'preparation',
  'delivery', 'labour', 'labor', 'birthing', 'neonatal', 'special care',
  'intensive care', 'coronary', 'stroke', 'trauma', 'burns', 'plastics',
  'vascular', 'thoracic', 'spinal', 'fracture', 'joint', 'endoscopy',
  'colonoscopy', 'bronchoscopy', 'cath lab', 'angio', 'interventional',
  'nuclear medicine', 'pet', 'spect', 'mammography', 'fluoroscopy',
  'physiotherapy', 'physio', 'occupational therapy', 'ot', 'speech therapy',
  'pharmacy', 'pathology', 'laboratory', 'lab', 'blood bank', 'transfusion',
  'infection control', 'sterilisation', 'sterile', 'cssd', 'supply',
  'admin', 'administration', 'records', 'admissions', 'discharge',
  'flexi', 'minimal assist', 'respite', 'lay-z boy', 'assu', 'mssu'
];

// Known location patterns (Location - building/level)
const LOCATION_PATTERNS = [
  /\blvl?\s*\d+/i,           // Lvl 3, Level 3, L3
  /\blevel\s*\d+/i,          // Level 3
  /\bfloor\s*\d+/i,          // Floor 3
  /\bbuilding\s*[a-z0-9]+/i, // Building A, Building 1
  /\bblock\s*[a-z0-9]+/i,    // Block A
  /\bwing\s*[a-z0-9]+/i,     // Wing A
  /\b[a-z]\s*wing/i,         // A Wing
  /\bunit\s*\d+/i,           // Unit 1
  /\bsouth\b/i,              // South
  /\bnorth\b/i,              // North
  /\beast\b/i,               // East
  /\bwest\b/i,               // West
];

// Known sub-location patterns (Sub-location - room numbers)
const SUBLOCATION_PATTERNS = [
  /\brms\.?\s*[\d&\s,]+/i,   // Rms 5 & 6 - must come before rm
  /\brm\.?\s*\d+/i,          // Rm 5, Rm. 5
  /\brooms?\s*[\d&\s,-]+/i,  // Rooms 5-6, Room 5, 6
  /\broom\.?\s*\d+/i,        // Room 5
  /\bbays?\s*[\d&\s,-]+/i,   // Bays 1-4
  /\bbay\.?\s*\d+/i,         // Bay 5
  /\bbeds?\s*[\d&\s,-]+/i,   // Beds 1-4
  /\bbed\.?\s*\d+/i,         // Bed 5
  /\bspaces?\s*[\d&\s,-]+/i, // Spaces 1-4
  /\bspace\.?\s*\d+/i,       // Space 1
  /\bcare\s*\d+/i,           // Care 3
  /\b\d+\s*[-–]\s*\d+\b/,    // 1-6 (range)
];

/**
 * Parse rawAreaText and extract components according to naming convention
 */
interface ParsedArea {
  where: string | null;      // Town/hospital location
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
  let text = rawText.trim()
    .replace(/\b\d+\s*[-–]?\s*yr\s*(curtain\s*)?(changeover|change\s*over|replacement)s?\b/gi, '')
    .replace(/\b\d+\s*[-–]?\s*year\s*(curtain\s*)?(changeover|change\s*over|replacement)s?\b/gi, '')
    .replace(/\b(curtain\s*)?(changeover|change\s*over|replacement)s?\b/gi, '')
    .replace(/\bcurtains?\b/gi, '')
    .replace(/\b2yr\b/gi, '')
    .replace(/\bchange\b/gi, '')
    .replace(/\bnew\b/gi, '')
    .replace(/\breplacements?\b/gi, '')
    .replace(/\bscreen\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Extract sub-location (room numbers) first - they're usually at the end
  for (const pattern of SUBLOCATION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      result.subLocation = match[0].trim();
      text = text.replace(pattern, '').trim();
    }
  }
  
  // Extract location (level/building)
  for (const pattern of LOCATION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      if (!result.location) {
        result.location = match[0].trim();
      } else {
        result.location = `${result.location} ${match[0].trim()}`;
      }
      text = text.replace(pattern, '').trim();
    }
  }
  
  // Check for town/location keywords
  const lowerText = text.toLowerCase();
  for (const town of TOWN_PATTERNS) {
    if (lowerText.includes(town)) {
      result.where = capitalizeWords(town);
      // Don't remove from text - it might be part of the department name
      break;
    }
  }
  
  // If no town found, try to extract from hospital name
  if (!result.where) {
    const hospitalLower = hospitalName.toLowerCase();
    for (const town of TOWN_PATTERNS) {
      if (hospitalLower.includes(town)) {
        result.where = capitalizeWords(town);
        break;
      }
    }
  }
  
  // Check for department keywords
  const words = text.split(/\s+/);
  const departmentWords: string[] = [];
  
  for (const word of words) {
    const lowerWord = word.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (DEPARTMENT_PATTERNS.some(dept => {
      if (typeof dept === 'string') {
        return lowerWord === dept.replace(/[^a-z0-9]/g, '') || 
               lowerWord.includes(dept.replace(/[^a-z0-9]/g, ''));
      }
      return false;
    })) {
      departmentWords.push(word);
    } else if (word.length > 1 && !/^\d+$/.test(word)) {
      // Include other meaningful words that aren't just numbers
      departmentWords.push(word);
    }
  }
  
  if (departmentWords.length > 0) {
    // Clean up the department words
    let deptText = departmentWords.join(' ');
    // Remove any remaining noise
    deptText = deptText
      .replace(/\b\d+\s*[-–]?\s*yr\b/gi, '')
      .replace(/\bcurtains?\b/gi, '')
      .replace(/\bchangeover\b/gi, '')
      .replace(/\bchange\b/gi, '')
      .replace(/\breplacements?\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (deptText.length > 0) {
      result.what = deptText;
    }
  }
  
  return result;
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
 * Format area name according to naming convention
 * Convention: Where What Location Sub-location
 */
function formatAreaName(parsed: ParsedArea): string {
  const parts: string[] = [];
  
  // Check if the What field already contains the town name
  const whatLower = (parsed.what || '').toLowerCase();
  const whereLower = (parsed.where || '').toLowerCase();
  
  // Add Where (town) only if it's not already in the What field
  if (parsed.where && !whatLower.includes(whereLower)) {
    parts.push(parsed.where);
  }
  
  // Add What (department) - this is the main identifier
  if (parsed.what) {
    // Clean up the department name
    let dept = parsed.what
      .replace(/\s+/g, ' ')
      .trim();
    
    // Capitalize properly
    dept = capitalizeWords(dept);
    
    // Standardize common abbreviations
    dept = dept
      .replace(/\bIcu\b/g, 'ICU')
      .replace(/\bEd\b/g, 'ED')
      .replace(/\bHdu\b/g, 'HDU')
      .replace(/\bCcu\b/g, 'CCU')
      .replace(/\bNicu\b/g, 'NICU')
      .replace(/\bPicu\b/g, 'PICU')
      .replace(/\bPacu\b/g, 'PACU')
      .replace(/\bSsr\b/g, 'SSR')
      .replace(/\bCt\b/g, 'CT')
      .replace(/\bMri\b/g, 'MRI')
      .replace(/\bEnt\b/g, 'ENT')
      .replace(/\bGp\b/g, 'GP')
      .replace(/\bOt\b/g, 'OT')
      .replace(/\bAssu\b/g, 'ASSU')
      .replace(/\bMssu\b/g, 'MSSU');
    
    parts.push(dept);
  }
  
  // Add Location (level/building)
  if (parsed.location) {
    let loc = parsed.location
      .replace(/\blvl\b/gi, 'Lvl')
      .replace(/\blevel\b/gi, 'Level')
      .replace(/\bfloor\b/gi, 'Floor')
      .replace(/\bbuilding\b/gi, 'Building')
      .replace(/\bblock\b/gi, 'Block')
      .replace(/\bwing\b/gi, 'Wing')
      .replace(/\bunit\b/gi, 'Unit');
    parts.push(loc);
  }
  
  // Add Sub-location (room number)
  if (parsed.subLocation) {
    let subLoc = parsed.subLocation
      .replace(/\brms\.?\s*/gi, 'Rms ') // Must come before rm to avoid partial replacement
      .replace(/\brm\.?\s*/gi, 'Rm ')
      .replace(/\brooms?\s*/gi, 'Room ')
      .replace(/\bbays?\s*/gi, 'Bay ')
      .replace(/\bbay\.?\s*/gi, 'Bay ')
      .replace(/\bbeds?\s*/gi, 'Bed ')
      .replace(/\bbed\.?\s*/gi, 'Bed ')
      .replace(/\bcare\s*/gi, 'Care ')
      .replace(/\s+/g, ' '); // Clean up any double spaces
    parts.push(subLoc.trim());
  }
  
  // If we couldn't parse anything meaningful, return cleaned original
  if (parts.length === 0) {
    return cleanAreaName(parsed.original);
  }
  
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Clean up area name - remove noise but keep structure
 */
function cleanAreaName(name: string): string {
  let cleaned = name
    // Remove common noise patterns - order matters!
    .replace(/\b\d+\s*[-–]?\s*yr\s*(curtain\s*)?(changeover|change\s*over|replacement)s?\b/gi, '')
    .replace(/\b\d+\s*[-–]?\s*year\s*(curtain\s*)?(changeover|change\s*over|replacement)s?\b/gi, '')
    .replace(/\b(curtain\s*)?(changeover|change\s*over|replacement)s?\b/gi, '')
    .replace(/\bcurtains?\b/gi, '')
    .replace(/\bPO\s*\d+\b/gi, '')
    .replace(/\bP\d{6,}\b/gi, '')
    .replace(/\bCE\d+\b/gi, '')
    .replace(/\b\d{2}\/\d{2}\/\d{2,4}\b/g, '') // Dates
    .replace(/\bacceptance\s*email\b/gi, '')
    .replace(/\bemail\b/gi, '')
    .replace(/\bnew\b/gi, '')
    .replace(/\bbalance\s*of\s*(curtains?)?\b/gi, '')
    .replace(/\breplacements?\b/gi, '')
    .replace(/\bscreen\b/gi, '')
    .replace(/\bhw\b/gi, '') // HW = Hardware?
    .replace(/\b2yr\b/gi, '') // 2yr without hyphen
    .replace(/\bchange\b/gi, '') // standalone change
    // Clean up punctuation and whitespace
    .replace(/[,;:]+/g, ' ')
    .replace(/\s*[-–]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // If nothing left after cleaning, return original cleaned of just whitespace
  if (!cleaned || cleaned.length < 2) {
    return name.trim();
  }
  
  // Capitalize properly
  return cleaned
    .split(' ')
    .filter(word => word.length > 0)
    .map(word => {
      // Keep abbreviations uppercase
      if (/^[A-Z]{2,}$/.test(word)) return word;
      // Capitalize first letter
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
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
  purchases: Array<{ id: number; rawAreaText: string | null; hospitalId: number; hospitalName?: string }>,
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
    const suggestion = findBestAreaSuggestion(
      purchase.rawAreaText, 
      hospitalAreas,
      purchase.hospitalName || ''
    );
    suggestions.set(purchase.id, suggestion);
  }
  
  return suggestions;
}
