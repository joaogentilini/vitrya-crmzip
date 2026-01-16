# Vitrya CRM

## Overview
Vitrya CRM is a customer relationship management application built with Next.js 16 and Supabase, designed for lead management with a Kanban board interface. It allows users to visualize and manage leads through various pipeline stages, including creation, drag-and-drop stage movement, and marking leads as won or lost. The project aims to provide a robust and intuitive platform for sales process optimization, incorporating features like task management, executive dashboards, and automated lead nurturing.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
### Frontend
- **Framework**: Next.js 16 (App Router)
- **UI Pattern**: React Server Components for data fetching, Client Components for interactivity.
- **Styling**: Tailwind CSS v4 with custom CSS properties for Vitrya brand theming.
- **Design System**: Custom component library (`components/ui/`) with Vitrya design tokens and a brand color palette (Mirage, Cobalt, Off-White, Pumpkin Orange, Deep Teal).
- **Drag-and-Drop**: `@dnd-kit` for Kanban board interactions.
- **Fonts**: Inter, loaded via `next/font`.
- **App Shell**: Fixed dark sidebar, light content area, responsive navigation, and full keyboard navigation support.

### Backend
- **API Pattern**: Mix of Server Actions (`'use server'`) for lead operations and Route Handlers (`/api/*`) for specific endpoints (e.g., lead finalization, health checks, automations).
- **Data Fetching**: Server Components directly use Supabase client with `force-dynamic` and `revalidate = 0` for real-time data.
- **State Management**: Server state via Server Components with `revalidatePath()`; client state via React `useState`, `useTransition`; auth state via Supabase auth listeners; toast notifications via `ToastProvider`.

### Authentication & Authorization
- **Provider**: Supabase Auth (email/password).
- **Client/Server Integration**: `@supabase/ssr` for both browser and server-side client creation with cookie handling.
- **User Context**: User ID from session for data ownership.
- **Role System**: Three roles (admin, gestor, corretor) with cascading permissions.
- **First User Bootstrap**: First authenticated user automatically becomes admin via ensureUserProfile.
- **Route Protection**: Inactive users blocked at /blocked page; role-based access to settings.

### User Management
- **Profiles Table**: id, role, full_name, email, is_active, created_at, updated_at.
- **Roles**: admin (full access), gestor (manage users/leads), corretor (own leads only).
- **Lead Ownership**: owner_user_id field on leads; RLS filters by role; admin/gestor can reassign.
- **API Routes**: /api/admin/users using service role key for privileged operations (create user, change role, reset password).
- **Admin UI**: /settings/users page for user management (admin/gestor only).

### Data Model
- **Core Entities**: Pipelines, Pipeline Stages, Leads, Lead Stage Changes, Lead Audit Logs, Lead Notes, Profiles, Tasks, Lead Catalogs (Types, Interests, Sources), People, Clients.
- **Lead Fields**: title, client_name, phone_raw, phone_e164 (E.164 normalized), email, lead_type_id, lead_interest_id, lead_source_id, budget_range, notes, person_id, client_id, is_converted, converted_at.
- **Lead Lifecycle**: Supports creation, status changes (open, won, lost), conversion to client, and detailed activity logging.
- **Phone Validation**: Brazilian phone normalization to E.164 format (+55XXXXXXXXXXX); unique constraint on phone_e164 prevents duplicate leads.
- **Task Management**: Tasks linked to leads with types, due dates, and assignment capabilities.
- **Lead Notes**: Notes attached to leads (lead_notes table); RLS respects lead ownership; notes appear in timeline as 'Nota adicionada'.
- **Lead to Client Conversion**: Leads can be converted to clients via POST /api/leads/[leadId]/convert. Creates/links person record, creates/updates client record, marks lead as converted with audit log.

### Catalog System
- **Tables**: lead_types, lead_interests, lead_sources - each with id, name, position, is_active, timestamps.
- **Management**: Admin page at /settings/catalogs with tabs for Types, Interesses, and Origens. Toggle active/inactive, reorder, add/edit items.
- **RLS**: Everyone can read catalogs, only admins can modify.

### Key Features
- **Lead Management**: Create, view, edit leads with full client profile (name, phone, email, type, interest, source, notes); Kanban board with drag-and-drop; phone duplicate prevention.
- **Catalog Management**: Admin interface for managing lead types, interests, and sources at /settings/catalogs.
- **Task System**: Create, complete, reschedule, and cancel tasks associated with leads. Overdue and no-action indicators.
- **Timeline**: Detailed audit trail of lead activities, stage changes, and notes added.
- **Automations**: Rules for auto-creating tasks based on lead events (e.g., creation, inactivity, stage movement), with anti-duplication and audit logging.
- **Dashboard**: Executive metrics, lead overview, and upcoming tasks.
- **Agenda**: Task calendar with daily/weekly views and direct task actions.
- **User Interface**: Comprehensive design system with accessible and responsive components.

## Important Files
- `lib/phone.ts` - Brazilian phone normalization to E.164 format
- `lib/catalogs.ts` - Catalog CRUD operations (lead types, interests, sources)
- `lib/automations.ts` - Automation rules and task creation
- `lib/auth.ts` - Authentication helpers including ensureUserProfile and getCurrentUserProfile
- `lib/authHelpers.ts` - Role check utilities (isAdmin, isAdminOrGestor, hasRole)
- `app/leads/actions.ts` - Server actions for lead CRUD, phone duplicate checking, and owner reassignment
- `app/leads/[id]/EditLeadModal.tsx` - Full lead editing modal with all catalog fields
- `app/leads/LeadsList.tsx` - Lead list with catalog labels display
- `app/api/admin/users/` - API routes for user management (create, update, reset password)
- `app/settings/users/` - User management page with create user modal
- `app/settings/catalogs/` - Admin catalog management page
- `app/blocked/page.tsx` - Page shown to inactive users
- `docs/migrations/20260114_0307_leads_schema_rls_audit.sql` - Migration for leads table schema, RLS policies, and audit trigger
- `docs/migrations/20260115_lead_notes.sql` - Migration for lead_notes table with RLS policies
- `docs/migrations/20260115_add_email_column.sql` - Migration to add email column to leads table
- `app/leads/[id]/LeadNotes.tsx` - Lead notes UI component with add/delete functionality
- `app/api/leads/[leadId]/notes/route.ts` - API for fetching and creating notes
- `app/api/lead-notes/[id]/route.ts` - API for deleting notes
- `docs/migrations/20260116_lead_to_client_conversion.sql` - Migration for people, clients tables and lead conversion fields
- `docs/migrations/20260116_fix_recursive_triggers.sql` - Fix for "stack depth limit exceeded" error in catalog triggers
- `app/api/leads/[leadId]/convert/route.ts` - API for converting leads to clients (uses owner_user_id, not owner_id)
- `app/leads/[id]/ConvertLeadModal.tsx` - Modal for lead to client conversion
- `app/perfil/page.tsx` - User profile editing page

## External Dependencies
- **Supabase**:
    - **Authentication**: Email/password authentication.
    - **Database**: PostgreSQL database.
    - **Client Libraries**: `@supabase/supabase-js`, `@supabase/ssr`.
    - **Environment Variables**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **UI Libraries**:
    - `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`: For drag-and-drop functionality in the Kanban board.