# Vitrya CRM - Post-ETAPA 2 Review Report

**Date:** January 2026  
**Reviewer:** Senior Tech Lead  
**Scope:** ETAPA 2 (Leads list + lead details + edit modal)

---

## 1. Executive Summary

### What is Solid
- **Architecture**: Clean separation between Server Components (data fetching) and Client Components (interactivity)
- **Design System**: Well-structured UI component library in `components/ui/` with consistent styling tokens
- **State Management**: Proper use of `useTransition` for pending states and `revalidatePath()` for cache invalidation
- **Responsiveness**: Leads list has proper desktop (table) and mobile (cards) layouts
- **Accessibility**: Focus-visible styles, ARIA attributes, keyboard navigation support
- **Type Safety**: TypeScript used throughout with proper type definitions

### What is Risky
- **Code Duplication**: Status badge rendering and finalize handlers duplicated across 3+ files
- **Dead Code**: Unused server action `setLeadFinalStatusAction.ts` duplicates API route logic
- **Type Redundancy**: `LeadRow`, `PipelineRow`, `StageRow` types redefined in multiple components
- **Error Handling**: Inconsistent error normalization patterns across files

---

## 2. Architecture Map

### Routes
```
/                           # Login page
/leads                      # Leads list (search, filters, sorting, quick actions)
/leads/[id]                 # Lead details 360° view
/leads/kanban               # Kanban board with drag-and-drop
/auth/callback              # Supabase auth callback
/auth/reset                 # Password reset
/auth/auth-code-error       # Auth error display
/api/leads/finalize         # REST endpoint for lead finalization
/api/health                 # Health check
```

### Key Components
```
LeadsList.tsx               # Client: Search, filters, table/cards, quick actions
LeadDetailsClient.tsx       # Client: 360° view, timeline, actions
EditLeadModal.tsx           # Client: Edit lead form
KanbanBoard.tsx             # Client: Drag-and-drop board
CreateLeadForm.tsx          # Client: New lead creation
AppShell.tsx                # Layout: Navigation, header, user menu
```

### Data Flow
```
Server Component (page.tsx)
    └── Fetch data via Supabase server client
    └── Pass props to Client Component
            └── User interactions trigger:
                ├── Server Actions (createLeadAction, updateLeadAction, moveLeadToStageAction)
                └── API Routes (/api/leads/finalize)
                    └── revalidatePath() invalidates cache
                    └── router.refresh() re-renders page
```

---

## 3. Duplication Findings

### UI Duplication

| Pattern | Files | Lines |
|---------|-------|-------|
| `getStatusBadge()` | `LeadsList.tsx`, `LeadDetailsClient.tsx` | ~10 each |
| Status badge switch/case | `KanbanBoard.tsx` (inline in LeadCard) | ~5 |
| Select styling classes | Multiple files | Repeated inline |

### Logic Duplication

| Pattern | Files |
|---------|-------|
| `handleFinalize()` fetch logic | `LeadsList.tsx:150-168`, `LeadDetailsClient.tsx:100-118`, `KanbanBoard.tsx:260-278` |
| Error normalization `err instanceof Error ? err.message : '...'` | 6+ locations |
| `confirm()` dialog text | 3 locations |

### Dead Code

| File | Reason |
|------|--------|
| `app/leads/actions/setLeadFinalStatusAction.ts` | Never imported; duplicates `/api/leads/finalize` logic |

---

## 4. Potential Bugs / Edge Cases

### Auth
- ✅ Server actions verify `supabase.auth.getUser()` before mutations
- ⚠️ Client-side API calls to `/api/leads/finalize` don't handle 401 specifically

### Errors
- ⚠️ Error messages mixed Portuguese/technical (e.g., `leadErr.message` exposed to UI)
- ⚠️ `lead_stage_changes` table query catches `42P01` (table not exists) silently

### Hydration
- ✅ `ClientDate` component prevents hydration mismatch with `mounted` state
- ✅ `KanbanBoard.LeadCard` has similar `mounted` pattern for dates

### Null Data
- ⚠️ `pipeline?.name || '—'` pattern used but some places use empty string fallback
- ✅ Edit modal handles pipelines without stages with warning message

---

## 5. Performance Notes

### Render
- ✅ `useMemo` used for filtering/sorting leads
- ✅ `useCallback` used for event handlers
- ⚠️ `stageMap` and `pipelineMap` recreated per render in some components

### Data Fetching
- ✅ Server Components fetch data at request time (`force-dynamic`)
- ⚠️ Timeline fetches stage changes client-side (could be server-side)
- ⚠️ Dynamic imports (`import('./kanban/actions')`) on every action call

### Unnecessary Re-renders
- ⚠️ `KanbanBoard` `localLeads` state triggers full board re-render on any change
- ✅ `useTransition` properly used to keep UI responsive during mutations

---

## 6. Security Notes

### Environment Variables
- ✅ `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are public (correct)
- ✅ Server client uses cookie-based auth
- ✅ No secrets exposed in client code

### Client/Server Boundaries
- ✅ Server actions marked with `'use server'`
- ✅ Supabase RLS should protect data (assumed configured in Supabase)
- ⚠️ API route `/api/leads/finalize` doesn't explicitly check user ownership

---

## 7. Recommendations

### P0 (Critical - Fix Now)
1. **Remove dead code**: Delete `app/leads/actions/setLeadFinalStatusAction.ts`
2. **Consolidate status helpers**: Create `lib/leads.ts` with shared `getStatusBadge()` and types

### P1 (High - Fix Soon)
3. **Extract shared types**: Create `lib/types/leads.ts` for `LeadRow`, `PipelineRow`, `StageRow`
4. **Consolidate error handling**: Create `lib/errors.ts` with `normalizeError()` helper
5. **Add user ownership check**: API route should verify lead belongs to user

### P2 (Medium - Technical Debt)
6. **Remove duplicate confirm dialogs**: Create `confirmFinalize()` helper
7. **Move timeline fetch to server**: Reduce client-side waterfall
8. **Optimize dynamic imports**: Cache imported modules or use static imports

---

## 8. Test Checklist

### Leads List (`/leads`)
- [ ] 1. Search by lead name filters correctly
- [ ] 2. Pipeline filter updates stage dropdown options
- [ ] 3. Status filter (open/won/lost) works
- [ ] 4. Sorting (recent/name/stage) applies correctly
- [ ] 5. "Limpar" button resets all filters
- [ ] 6. Quick action: Move stage dropdown updates lead
- [ ] 7. Quick action: Mark won/lost finalizes lead

### Lead Details (`/leads/[id]`)
- [ ] 8. Header shows title, status badge, pipeline/stage
- [ ] 9. Timeline shows creation event and stage changes
- [ ] 10. Edit button opens modal with pre-filled data
- [ ] 11. Move stage buttons update lead stage
- [ ] 12. Mark won/lost buttons finalize lead

---

## Appendix: Files Changed (Safe Cleanup)

1. **Deleted**: `app/leads/actions/setLeadFinalStatusAction.ts` (dead code - 83 lines)
2. **Deleted**: `app/leads/actions/` directory (empty after cleanup)
3. **Created**: `lib/leads.tsx` (shared types and helpers)
   - `LeadRow`, `PipelineRow`, `StageRow`, `StageChange` types
   - `getStatusBadge()` - consolidated badge rendering
   - `normalizeError()` - consistent error handling
   - `getConfirmFinalizeMessage()`, `getFinalizeSuccessMessage()` - i18n-ready strings
4. **Updated**: `app/leads/LeadsList.tsx`
   - Removed local type definitions (~20 lines)
   - Removed duplicate `getStatusBadge()` (~10 lines)
   - Imports shared helpers from `@/lib/leads`
5. **Updated**: `app/leads/[id]/LeadDetailsClient.tsx`
   - Removed local type definitions (~30 lines)
   - Removed duplicate `getStatusBadge()` (~10 lines)
   - Imports shared helpers from `@/lib/leads`
6. **Updated**: `app/leads/[id]/EditLeadModal.tsx`
   - Removed local type definitions (~20 lines)
   - Imports shared types and `normalizeError()` from `@/lib/leads`
7. **Updated**: `app/leads/kanban/KanbanBoard.tsx`
   - Imports shared helpers from `@/lib/leads`
   - Uses `normalizeError()`, `getConfirmFinalizeMessage()`, `getFinalizeSuccessMessage()`

**Lines reduced**: ~100+ lines of duplicated code consolidated into shared library
