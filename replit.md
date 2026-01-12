# Vitrya CRM

## Overview

Vitrya CRM is a customer relationship management application built with Next.js 16 and Supabase. The application provides lead management functionality with a Kanban board interface for visualizing and managing leads through different pipeline stages. Users can create leads, move them between stages via drag-and-drop, and mark them as won or lost.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: Next.js 16 with App Router
- **UI Pattern**: React Server Components for data fetching, Client Components for interactivity
- **Styling**: Tailwind CSS v4 with CSS custom properties for Vitrya brand theming
- **Design System**: Custom component library in `components/ui/` with Vitrya design tokens
- **Drag-and-Drop**: @dnd-kit library suite (core, sortable, utilities) for Kanban board interactions
- **Fonts**: Inter for UI text, loaded via next/font from Google Fonts

### Vitrya Brand Color Palette
- **Mirage (#171A21)**: Sidebar background, dark headers
- **Cobalt (#294487)**: Secondary buttons, highlights
- **Off-White (#FAFAFA)**: Main content background
- **Pumpkin Orange (#FF681F)**: Primary CTAs, active states, focus rings
- **Deep Teal (#17BEBB)**: Info badges, hover states

### Design System Components
Located in `components/ui/`:
- **Button**: Primary (Pumpkin Orange), secondary (Cobalt), ghost, outline, destructive, link variants with loading states
- **Input**: Form input with label, hint, error state, and accessibility support (aria-describedby)
- **Textarea**: Multi-line text input with label, hint, error state
- **Select**: Styled select dropdown with label and error handling
- **Card**: Container component with Header, Title, Description, Content, Footer sub-components
- **Badge**: Status badges with success, warning, destructive, info (Deep Teal), secondary variants
- **Skeleton**: Loading placeholder components (Skeleton, CardSkeleton, TableRowSkeleton, PageSkeleton, KanbanSkeleton)
- **EmptyState**: Zero-state display with icon presets, title, description, and action/CTA
- **InlineError**: Error state with retry button for data loading failures
- **Toast**: Toast notification system with ToastProvider context (success, error, warning, info)

### App Shell Layout
Located in `components/layout/AppShell.tsx`:
- Fixed dark sidebar (Mirage #171A21) with Vitrya branding and logo
- Light content area (Off-White #FAFAFA) with max-width 1280px, centered
- Responsive sidebar navigation with mobile hamburger menu (Escape to close)
- Header with page title, "Novo Lead" primary action button (Pumpkin Orange), and user dropdown menu
- Navigation items with active states using Pumpkin Orange highlight
- User menu with avatar initial (Cobalt background), email display, and sign-out action
- No horizontal scroll, only vertical scroll
- Full keyboard navigation support with focus-visible styles (Pumpkin Orange ring)

### Backend Architecture
- **API Pattern**: Mix of Server Actions (`'use server'`) and Route Handlers (`/api/*`)
- **Server Actions**: Used for lead creation (`createLeadAction`), lead update (`updateLeadAction`), lead movement (`moveLeadToStageAction`)
- **Route Handlers**: REST endpoints at `/api/leads/finalize` for finalizing leads, `/api/health` for health checks
- **Data Fetching**: Server Components fetch data directly using Supabase client, with `force-dynamic` and `revalidate = 0` for real-time data

### State Management
- **Server State**: Managed via Server Components with `revalidatePath()` for cache invalidation
- **Client State**: React `useState` for form inputs and UI state, `useTransition` for pending states
- **Auth State**: Supabase auth listeners with `onAuthStateChange` for session management
- **Toast State**: Context-based toast notifications via `ToastProvider`

### Authentication & Authorization
- **Provider**: Supabase Auth with email/password authentication
- **Client-side**: Browser client created via `@supabase/ssr` `createBrowserClient`
- **Server-side**: Server client created via `@supabase/ssr` `createServerClient` with cookie handling
- **User Context**: User ID extracted from session for data ownership (created_by, assigned_to fields)

### Data Model
The application uses a pipeline-based lead management system:
- **Pipelines**: Top-level containers for organizing sales processes
- **Pipeline Stages**: Ordered stages within each pipeline (by position)
- **Leads**: Individual opportunities with title, status (open/won/lost), pipeline assignment, and stage assignment
- **Lead Stage Changes**: Audit log of stage movements with from/to stage and timestamp

## Project Structure

```
app/
  page.tsx              # Login page with form accessibility
  layout.tsx            # Root layout with ToastProvider
  globals.css           # Design tokens, animations, and Tailwind v4 theme
  leads/
    page.tsx            # Leads list page with search, filters, sorting
    LeadsList.tsx       # Client component with table/card layout
    CreateLeadForm.tsx  # Lead creation form with validation
    LeadsAppShell.tsx   # App shell wrapper for leads pages
    ClientDate.tsx      # Hydration-safe date component
    actions.ts          # Server actions: createLeadAction, updateLeadAction
    [id]/
      page.tsx          # Lead details 360° page
      LeadDetailsClient.tsx  # Details view with timeline, cards, actions
      LeadTimeline.tsx  # Premium timeline with lead_audit_logs and actor resolution
      EditLeadModal.tsx # Edit lead modal with validation
      TaskCard.tsx      # Next action card with tasks display and actions
      CreateTaskModal.tsx  # Task creation modal with form
    tasks/
      actions.ts        # Server actions for task CRUD operations
    kanban/
      page.tsx          # Kanban board page with AppShell
      KanbanBoard.tsx   # Drag-and-drop Kanban component
      actions.ts        # moveLeadToStageAction
  auth/
    callback/           # Supabase auth callback
    reset/              # Password reset page
    auth-code-error/    # Auth error display
  api/
    health/             # Health check endpoint
    leads/finalize/     # Lead finalization endpoint

components/
  ui/                   # Design system components
    Button.tsx          # Button with variants and loading state
    Input.tsx           # Input with label, hint, error, accessibility
    Textarea.tsx        # Textarea with label, hint, error
    Select.tsx          # Select dropdown with label and error
    Card.tsx            # Card container with sub-components
    Badge.tsx           # Status badges
    Skeleton.tsx        # Loading skeletons (Page, Kanban, Card, TableRow)
    EmptyState.tsx      # Empty state with icon presets
    InlineError.tsx     # Error state with retry button
    Toast.tsx           # Toast notification system
    index.ts            # Component exports
  layout/
    AppShell.tsx        # Main navigation layout with user menu

lib/
  supabaseClient.ts     # Browser Supabase client
  supabaseServer.ts     # Server Supabase client
  leads.tsx             # Shared lead types and helpers (getStatusBadge, normalizeError)
```

## External Dependencies

### Supabase (Backend-as-a-Service)
- **Authentication**: Email/password auth via Supabase Auth
- **Database**: PostgreSQL database hosted on Supabase
- **Client Libraries**: `@supabase/supabase-js` and `@supabase/ssr` for browser and server-side access
- **Environment Variables Required**:
  - `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anonymous/public key

### Database Tables (Supabase/PostgreSQL)
- `leads`: id, title, status, pipeline_id, stage_id, created_by, assigned_to, created_at
- `pipelines`: id, name, created_at
- `pipeline_stages`: id, pipeline_id, name, position
- `lead_stage_changes`: id, lead_id, pipeline_id, from_stage_id, to_stage_id, created_at
- `lead_audit_logs`: id, lead_id, actor_id, action, before, after, created_at (audit trail)
- `profiles`: id, name, full_name, email (user profiles for actor resolution)
- `tasks`: id, lead_id, type, description, due_at, reminder_at, done_at, cancelled_at, assigned_to, created_by, created_at (next actions)

### UI Libraries
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`: Drag-and-drop functionality for Kanban board

## Recent Changes (January 2026)

### Vitrya Design System Implementation (January 2026)
- **Brand Colors**: Mirage (#171A21), Cobalt (#294487), Off-White (#FAFAFA), Pumpkin Orange (#FF681F), Deep Teal (#17BEBB)
- **Typography**: Inter font for modern SaaS appearance
- **Sidebar**: Dark fixed sidebar with Vitrya branding, Pumpkin Orange active states
- **Content Area**: Light Off-White background, max-width 1280px, centered
- **Buttons**: Primary (Pumpkin Orange), Secondary (Cobalt), Destructive variants
- **Layout**: SaaS-style with fixed sidebar, no horizontal scroll

### ETAPA 4: Tasks/Next Action (January 2026)
- **Tasks Table**: New `tasks` table with type, description, due_at, reminder_at, done/cancelled timestamps
- **SQL Migration**: Migration file at `supabase/migrations/20260112_create_tasks_table.sql` (requires manual execution)
- **Server Actions**: `createTaskAction`, `completeTaskAction`, `rescheduleTaskAction`, `cancelTaskAction` in `app/leads/tasks/actions.ts`
- **TaskCard Component**: Displays open tasks with complete/reschedule/cancel actions, create new task modal
- **CreateTaskModal**: Task creation form with type selection, description, due date, optional reminder, admin assignment
- **Task Indicators**: LeadsList and KanbanBoard show "Atrasado" badge for overdue tasks, "Sem ação" for leads without open tasks
- **Timeline Integration**: Task events (create/done/reschedule/cancel) displayed with human-readable summaries
- **Admin Role Check**: Admins can assign tasks to other users via dropdown with profiles

### ETAPA 3: Explicit Move Stage Logging (January 2026)
- **Explicit move_stage Action**: When dragging leads in Kanban, explicitly registers `action='move_stage'` in `lead_audit_logs`
- **Enhanced moveLeadToStageAction**: Now accepts `fromStageId` parameter and inserts audit log with before/after stage_id
- **Deduplication Logic**: Timeline filters redundant 'update' events when `move_stage` exists within 5-second window
- **RLS Compliant**: All audit log inserts happen server-side via `createClient()` respecting Row Level Security
- **All Surfaces Updated**: LeadsList, KanbanBoard, and LeadDetailsClient all pass fromStageId for proper logging

### ETAPA 2.5: Timeline Enhancement (January 2026)
- **LeadTimeline Component**: Premium vertical timeline with audit log integration
- **Audit Logs Integration**: Fetches from `lead_audit_logs` for complete history (create/update/delete/move_stage)
- **Actor Resolution**: Resolves actor names from `profiles` table (name, full_name, or email)
- **Event Summarization**: Human-readable summaries (stage changes, status changes, title changes)
- **Clickable Titles**: Lead titles link to detail page in both list and Kanban views
- **Code Consolidation**: Shared types and helpers in `lib/leads.tsx`

### ETAPA 2: Leads Professional
- **Leads List PRO**: Search input, pipeline/stage/status filters, sorting (recent/name/stage), responsive table/cards
- **Quick Actions**: View details link, move stage dropdown, mark won/lost buttons on each lead row/card
- **Lead Details 360°**: New route `/leads/[id]` with header, status badge, pipeline/stage info
- **Timeline**: Shows lead creation and stage changes from `lead_stage_changes` table
- **Edit Modal**: Title validation, pipeline/stage selection, loading states, toast feedback
- **Cards Layout**: Contact, Interest/Origin, Notes, Next action placeholder cards
- **Server Actions**: Added `updateLeadAction` for editing leads

### ETAPA 1: Base Premium UX/UI
- **App Shell**: Header with page title, "Novo Lead" button, user menu; sidebar with active states
- **Design Tokens**: CSS variables for colors, typography, animations
- **UI Components**: Button, Input, Textarea, Select, Card, Badge, Skeleton, Toast, EmptyState, InlineError
- **State System**: PageSkeleton, KanbanSkeleton, InlineError with retry
- **Accessibility**: Focus-visible styles, keyboard navigation, ARIA attributes
