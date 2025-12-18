// Test parseCustomerRef function
const testRefs = [
  'PO-22933 - Spares - Oct 2023',
  'LKC265019 - ICU Windows Rm 1, 4, 5 & 6',
  'IN070625 - PACU - 2 yr Replacements',
  '235287 & 235299 - Outpatients Procedure Rms',
  '290138 ICU',
  'NCR 528 290 - Medical Ward',
  '1578153 - Waikato PACU Lvl 3 - 2 yr replacements - Due Feb 2026',
  '357956 - ED X-Ray',
  'PO 280065 - Admissions',
  'PO9112 - Whangarei Endoscopy 2-yr changeover - Oct',
  '252487 - Medical Inpatients Unit - Due Aug 2025'
];

// Improved parseCustomerRef for testing
function parseCustomerRef(customerRef) {
  if (!customerRef) return null;
  
  let text = customerRef.trim();
  
  // Remove common PO/reference number prefixes
  const prefixPatterns = [
    /^(PO[-\s]?\d+|PIN\d+|LKC\s?\d+|RT\s?\d+|FA\s?\d+|M\d{4,}|G\d{4,}|WN\d+|GR\d+|BS\d+|NH\d+|NCR\s?\d+|MT\d+|SEO\d+|IN\d+|RW\s?\d+\*?\d*[A-Z]?)\s*[-:]?\s*/i,
    /^\d{5,}\s*[-:]?\s*/,
    /^\d+\s*&\s*\d+\s*[-:]?\s*/,
  ];
  
  for (const pattern of prefixPatterns) {
    text = text.replace(pattern, '');
  }
  
  // Protect compound words with hyphens before splitting
  text = text.replace(/X-Ray/gi, 'X_RAY_TEMP');
  text = text.replace(/Pre-op/gi, 'PRE_OP_TEMP');
  text = text.replace(/Post-op/gi, 'POST_OP_TEMP');
  text = text.replace(/Day-stay/gi, 'DAY_STAY_TEMP');
  text = text.replace(/(\d)-yr/gi, '$1_YR_TEMP');
  
  // Split by common delimiters and find the meaningful area name part
  const parts = text.split(/\s*[-–]\s*/);
  
  // Find the best part that looks like an area name
  const suffixPatterns = /^(2\s*y(ea)?r?|\d_YR_TEMP|reorder|replacement|changeover|install|due|oct|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|\d{4}|D)$/i;
  const numberOnlyPattern = /^[\d\s&]+$/;
  
  let bestPart = '';
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed || trimmed.length < 2) continue;
    if (numberOnlyPattern.test(trimmed)) continue;
    if (suffixPatterns.test(trimmed)) continue;
    
    if (!bestPart) {
      bestPart = trimmed;
    } else {
      const hasAreaKeyword = /ward|unit|icu|pacu|theatre|clinic|room|rm|bed|floor|level|lvl|endoscopy|dialysis|radiology|recovery|surgery|surgical|medical|med|ortho|stroke|children|maternity|emergency|ed|er|day\s*stay|pre-?op|post-?op|ccu|nicu|mapu|atu|ssu|ssr|ctu|outpatient|inpatient|x-?ray|procedure|admission/i;
      if (hasAreaKeyword.test(trimmed)) {
        bestPart = trimmed;
      }
    }
  }
  
  text = bestPart || parts[0]?.trim() || text;
  
  // Restore protected compound words
  text = text.replace(/X_RAY_TEMP/gi, 'X-Ray');
  text = text.replace(/PRE_OP_TEMP/gi, 'Pre-op');
  text = text.replace(/POST_OP_TEMP/gi, 'Post-op');
  text = text.replace(/DAY_STAY_TEMP/gi, 'Day-stay');
  text = text.replace(/(\d)_YR_TEMP/gi, '$1-yr');
  
  // Filter out non-area entries
  const nonAreaPatterns = [
    /spares?/i,
    /^hooks?$/i,
    /^glides?$/i,
    /^curtain\s*(hooks?|recycle|track)/i,
    /^recycl/i,
    /^extra\s*(curtains?)?$/i,
    /^misc/i,
    /^sample/i,
    /^test/i,
    /^credit/i,
    /^refund/i,
    /^cancelled/i,
    /^void/i,
    /^replacement$/i,
    /^changeover$/i,
  ];
  
  for (const pattern of nonAreaPatterns) {
    if (pattern.test(text)) {
      return null;
    }
  }
  
  // Filter out person names
  const personNamePattern = /^[A-Z][a-z]+\s+[A-Z][a-z]+$/;
  const areaKeywords = /ward|unit|room|rm|icu|theatre|clinic|bay|level|floor|dept|department|ed|pacu|nicu|dialysis|radiology|lab|pharmacy|reception|admin|store|kitchen|laundry|office|corridor|lobby|entrance|waiting|emergency/i;
  
  if (personNamePattern.test(text) && !areaKeywords.test(text)) {
    return null;
  }
  
  // Clean up common suffixes
  text = text.replace(/\s*\d-yr\s*(changeover|replacement|install)?s?$/i, '').trim();
  text = text.replace(/\s*2\s*y(ea)?r?\s*(replace(ment)?s?|changeover|install)?$/i, '').trim();
  text = text.replace(/\s*reorder$/i, '').trim();
  
  // Final cleanup
  text = text.trim();
  if (text.length < 2) return null;
  
  return text;
}

console.log('Testing parseCustomerRef:');
testRefs.forEach(ref => {
  const result = parseCustomerRef(ref);
  console.log(`  "${ref}" => ${result ? `"${result}"` : 'null (filtered)'}`);
});
