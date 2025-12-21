# Project TODO

- [x] Connect to Synchub SQL Azure database to pull sales order data
- [x] Parse and extract hospital areas from CustomerRef field using fuzzy matching
- [x] Manual confirmation workflow for mapping area name variations
- [x] Dashboard screen showing hospital areas with reorder status (overdue, due soon, on track)
- [x] Stock forecast screen displaying expected inventory needs by product type, size, and color
- [x] Store area name mappings and confirmed reorder associations in database
- [x] Calculate reorder due dates based on last purchase date plus 2 years
- [x] Display product breakdown showing quantities needed per hospital and area
- [x] Search and filter functionality for hospitals and areas
- [x] Export capabilities for reorder alerts and stock forecasts
- [x] Email notifications when hospital areas become overdue or approaching reorder date
- [x] LLM-assisted area name matching suggestions
- [x] Filter to only report on Sporicidal Curtains product group (sc-, smtc-, sld-)

## Bug Fixes
- [x] Fix sync.status query returning undefined instead of null when no sync exists
- [x] Fix sync mutation timeout/HTML error response issue (added batching for order lines and purchase lines)
- [x] Further optimize sync to prevent gateway timeout (added batch functions)
- [x] Convert sync to background job to avoid gateway timeout
- [x] Fix background sync silently failing - syncs stuck in running status (added logging)
- [x] Fix home page reorders.statuses query timeout (optimized N+1 queries)
- [x] Implement incremental sync with date filters (LastModifiedOn)
- [x] Add chunked processing for orders (fetchSalesOrdersInChunks)
- [x] Add retry logic for failed batches (3 retries with 2s delay)
- [x] Optimize SalesOrderLines query to filter at SQL level (ProductCode sc-/smtc-/sld-, IsDeleted=0) - reduces from 3769 to 1745 lines
- [ ] Fix sync.status query timeout during background sync (gateway timeout)
- [x] Fix sync Step 5 - batch pending match creation instead of one-by-one
- [x] Fix purchase lines not being saved to database (GUID case sensitivity issue)

## Improvements
- [x] Improve area extraction logic to strip PO numbers, filter person names, filter non-area entries
- [x] Show hospital context on Pending Matches screen (hospital name, order number, date, customer ref)
- [x] Fix "Get AI Suggestion" button not working in Match Area dialog (handle empty areas case)
- [x] Fix "Confirm Match" button disabled in Match Area dialog (added message + New Area button)
- [x] Fix New Area dialog opening on top of Match to Area dialog (already handled by condition)
- [x] Show original CustomerRef in both Match to Area and New Area dialogs
- [x] Combine Match to Area and New Area dialogs into single Resolve Match dialog with tabs
- [x] Filter area dropdown in Resolve Match dialog to only show areas from current hospital
- [x] Add "Confirm Match" and "Confirm & Next" buttons to Resolve Match dialog
- [x] Order pending matches by hospital name, then by area text
- [x] Order Reorder Status by days (smallest/most overdue first)
- [x] Fix "Match not found" error when using Confirm & Next (use next item from current list)
- [x] Exclude orders without Endurocide products from sync (don't create purchase records for non-curtain orders)
- [x] Add cleanup script to remove orphan purchases (no product lines) and their pending matches
- [x] Add live progress indicator to sync status card showing current step and errors
- [x] Add cancel sync button with graceful stop
- [x] Optimize batch upsert operations to use true bulk inserts (hospitals, purchases, purchase lines)
- [x] Add progress indicator for data cleanup
- [x] Optimize cleanup to use bulk deletes (500 records per query)
- [x] Fix duplicate pending matches - added unique constraint on unleashOrderGuid and cleaned up duplicates
- [x] Auto-refresh cleanup preview after sync completes
- [x] Add "Skip & Next" button to Resolve Match dialog
- [x] Add "Exclude" feature to flag and hide unwanted orders (without deleting)
- [x] Make Resolve Match dialog bigger
- [x] Add excluded orders section to Area Management with re-include option
- [x] Add Enter keyboard shortcut for Confirm & Next in Resolve Match dialog
- [x] Sort area dropdown alphabetically in Resolve Match dialog
- [x] Improve AI suggestion to match against existing areas for the specific hospital only, with better prompt
- [x] Add ability to edit area name in Area Management
- [x] Add view/manage linked purchases for each area (unlink to send back to pending matches)
- [x] Add merge areas feature to combine duplicate areas
- [x] Redesign Stock Forecast to use table/list format organized by SKU code
- [x] Fix AI suggestion matching - improved prompt to match partial strings like PACU to Kenepuru PACU
- [x] Add simple string matching fallback before AI call (faster, more reliable)
- [x] Fix matching to prefer exact area name matches over partial contains
- [x] Fix alias checkbox text to update when different area is selected
- [x] Add auto-suggest on dialog open
- [x] Fix missing key prop error in Stock Forecast TableBody
- [x] Remove all alias functionality from the application
- [x] Simplify Resolve Match dialog - single autocomplete input for area name
- [x] Remove AI suggestion functionality (getLlmSuggestion endpoint and UI)
- [x] Filter existing areas as user types in autocomplete
- [x] Auto-create new area when no match exists
- [x] Fix suggestions dropdown overlapping dialog footer buttons
- [x] Increase height of Resolve Match dialog
- [x] Add keyboard navigation for suggestions dropdown (arrow keys + Enter)
- [x] Add hover tooltip on area cards to show linked purchases
- [x] Add original reference (customerRef) to area hover tooltip
- [x] Update Reorder Status categories: Due Soon (0-90), Near Soon (90-180), Far Soon (180-360)
- [x] Remove "No Purchase" category from Reorder Status
- [x] Add area naming convention guide to Resolve Match dialog
- [x] Add area naming convention guide to Area Management page
- [x] Add purchase history hover tooltip to Area column on Reorder Status page
- [x] Create Hospital Management page showing all purchases with area filtering
- [x] Add total curtains column to Hospital Management page (exclude services)
- [x] Add Match/Edit button to Hospital Management table rows
- [x] Make hospital selector searchable/filterable as user types
- [x] Add link on hospital name in Reorder Status to open Hospital Management
- [x] Fix Pending Matches to show ALL unmatched orders, not just from last sync
- [x] Add Exclude button next to Resolve on Pending Matches page
- [x] Add excluded purchases section in Hospital Management page
- [x] Add invoiceDate column to purchases table (keep orderDate as Sales Order Date)
- [x] Update sync to capture both Sales Order Date and Invoice Date from Unleashed
- [x] Use Invoice Date for reorder calculations instead of Sales Order Date
- [x] Add "On Order" status for orders with Sales Order Date but no Invoice Date
- [x] Update UI to show both dates where relevant

- [x] Add Exclude button to Hospital Management (after Edit button)
- [x] Reorder Pending Matches buttons: Exclude before Resolve
- [x] Center Curtains and Action columns in Hospital Management table
- [x] Show area status in Hospital Management: matched area name, Unmatched, or Excluded
- [x] Add filter for area status (Matched, Unmatched, Excluded) in Hospital Management
- [x] Remove separate Excluded Purchases card from Hospital Management
- [x] Fix duplicate key error in Hospital Management table (purchases appearing in both regular and excluded lists)
- [x] Fix Hospital Management to not show excluded purchases in regular list (filter them out properly)
- [x] Add unique constraint for area name per hospital (prevent duplicates)
- [x] Add area merge functionality to combine duplicate areas
- [x] Fix existing duplicate areas in database
- [x] Fix: Matching in Hospital Management should update/remove pending matches
- [x] Check data consistency: sales orders should only have one hospital (verified OK)
- [x] Check data consistency: areas should only belong to one hospital (verified OK - same names across hospitals is expected)
- [x] Fix inconsistency: order showing in Pending Matches but already matched in Hospital Management
- [x] Fix duplicate pending match records (368 purchases have duplicates)
- [x] Add unique constraint on pendingMatches.purchaseId to prevent future duplicates
- [x] Fix race condition in getPendingMatches causing duplicate key errors (use onDuplicateKeyUpdate)

## Code Review Findings (Dec 20, 2025)

### Issues Found and Fixed
- [x] Fix race condition in getPendingMatches causing duplicate key errors (use onDuplicateKeyUpdate)

### Issues Found - Need Fixing
- [x] unlinkPurchaseFromArea creates pending match without onDuplicateKeyUpdate (potential duplicate key error)
- [x] getStockForecasts uses orderDate instead of invoiceDate for reorder calculations (inconsistent with getAreaReorderStatuses)
- [x] getPurchasesByHospitalWithArea missing invoiceDate field (needed for Hospital Management display)
- [x] Hospital Management page doesn't show invoice date column
- [ ] Missing error handling in excludeMatch mutation (should handle case where match not found gracefully)

### Optimization Opportunities
- [ ] getAreaReorderStatuses fetches all purchases then filters - could use SQL GROUP BY for better performance
- [ ] getStockForecasts fetches all purchases and lines - could be optimized with SQL aggregation
- [ ] Hospital Management page fetches excludedPurchases for all hospitals - should filter by hospital in query

### Code Quality Issues
- [ ] Type casting with (match as any) in Matches.tsx - should use proper types
- [ ] Type casting with (selectedMatch as any) in Matches.tsx - should use proper types
- [ ] Unused rejectMatch mutation in Matches.tsx (never called)

### Test Fixes
- [x] Updated reorder.test.ts to include all valid status values (on_order, overdue, due_soon, near_soon, far_soon)
- [x] Fixed parseCustomerRef to handle "2025 Reorder" suffix pattern
- [x] Added lounge/transit/reception/waiting to area keyword patterns

## Bug Report (Dec 20, 2025)
- [x] Fix: On Order status should only apply when Sales Order is placed 18+ months after last invoice (to exclude spares/additions)
- [x] Reorder status cards and table: Overdue → On Order → Due Soon → Near Soon → Far Soon
- [x] Display SO-U number for On Order items for manual verification
- [x] Change "Invoice Date" column header to "Last Invoice"
- [x] Change "Reorder Due" column header to "Next Due"
- [x] Investigate data inconsistencies between Pending Matches and Reorder Status across full dataset
- [x] Fix: Add isExcluded filter when building onOrderByArea and lastDeliveredByArea maps
- [x] Fix: SO-U-00000935 shows as Unmatched in Hospital Management but doesn't appear in Pending Matches
- [x] Added repairOrphanedPendingMatches function to reset confirmed matches where purchase areaId is still NULL
- [x] Repaired 54 orphaned pending matches
- [x] Trace Pending Matches data derivation logic - simplified to direct purchase query

## Data Structure Simplification (Dec 20, 2025)
- [x] Remove pending_matches table dependency
- [x] Replace getPendingMatches with getUnmatchedPurchases (simple query: areaId IS NULL AND isExcluded = false)
- [x] Simplify matches router - remove pending match status management (use purchaseId directly)
- [x] Update Pending Matches UI to use simplified data
- [x] Ensure consistency between Pending Matches and Hospital Management
- [x] Verified: 205 unmatched purchases showing correctly in both views

## Bug Report (Dec 20, 2025) - Continued
- [ ] Fix: SO-U-00000586, SO-U-00000572, SO-U-00000555, SO-U-00000521 show as unmatched in Hospital Management but don't appear in Pending Matches

## Bug Fixes (Dec 21, 2025)
- [x] Make all dropdowns filterable by typing (type to filter) - Added Combobox component to Home, Hospitals, Forecast, Areas pages
- [ ] Fix Hospital Management curtain count to only include curtain products (not all items)
- [ ] Make SO-U numbers clickable links to Unleashed portal
- [x] Remove obsolete "creating pending matches" step from sync process (now uses direct purchase query)

## Critical Data Integrity Issues (Dec 21, 2025)
- [x] Fix SO-U-00000892 showing 90 curtains instead of 18 (root cause: missing unique constraint on purchaseLines)
- [x] Fix Stock Forecast showing duplicate entries (same hospital/area appearing multiple times)
- [x] Full review of data structure to ensure it matches Unleashed
- [x] Added unique constraint on purchaseLines (purchaseId, unleashProductGuid) to prevent duplicate lines
- [x] Cleaned up existing duplicate purchase lines in database
- [x] Review and fix all queries that calculate curtain counts
- [x] Fix unique constraint on purchaseLines - use unleashLineGuid (SalesOrderLine GUID) not ProductGuid (allows multiple lines with same product)
- [x] Make SO-U order numbers clickable to link to Unleashed portal (Hospital Management, Pending Matches, Area Management)
- [x] Fix clickable links on Reorder Status page (added unleashOrderGuid to AreaReorderStatus)
- [x] Fix OrderLink URL - changed to use OrderNumber with au.unleashedsoftware.com domain (was using GUID with go.unleashedsoftware.com)
- [x] Fix On Order status logic - now uses OrderStatus instead of missing invoiceDate
- [x] Include all Unleashed open order statuses: Placed, Backordered, Parked, 0 To Order, 1 On Order, 2 Ready to Send, 3 To Install, 4 To Invoice
- [x] Add graceful error message when renaming area to a name that already exists for the same hospital
- [x] Fix sync issue - preserve existing areaId using COALESCE, removed auto-matching logic
- [x] Implement suggested area matching for Pending Matches (match existing areas first, then suggest new area name)
- [x] Update suggestion logic to format new area names according to naming convention (Where → What → Location → Sub-location)
- [x] Fix fuzzy matching: "Minor Care Zone" should match "Wellington Minor Care Zone" not "Wellington Gastro"
- [x] Fix naming convention: Where = facility name (Children's Hospital), What = service (Piko Ward), Location = level/building (Level 4), Sub-location = room
