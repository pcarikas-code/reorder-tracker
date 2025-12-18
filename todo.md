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
