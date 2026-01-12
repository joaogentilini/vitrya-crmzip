# Vitrya CRM

## Overview

Vitrya CRM is a customer relationship management application built with Next.js 16 and Supabase. The application provides lead management functionality with a Kanban board interface for visualizing and managing leads through different pipeline stages. Users can create leads, move them between stages via drag-and-drop, and mark them as won or lost.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: Next.js 16 with App Router
- **UI Pattern**: React Server Components for data fetching, Client Components for interactivity
- **Styling**: Tailwind CSS v4 with CSS custom properties for theming (light/dark mode auto-detection)
- **Design System**: Custom component library in `components/ui/` with consistent styling tokens
- **Drag-and-Drop**: @dnd-kit library suite (core, sortable, utilities) for Kanban board interactions
- **Fonts**: Geist font family loaded via next/font

### Design System Components
Located in `components/ui/`:
- **Button**: Primary, secondary, ghost, outline, destructive, link variants with loading states
- **Input**: Form input with label, hint, error state, and accessibility support (aria-describedby)
- **Select**: Styled select dropdown with label and error handling
- **Card**: Container component with Header, Title, Description, Content, Footer sub-components
- **Badge**: Status badges with success, warning, destructive, secondary variants
- **Skeleton**: Loading placeholder components (Skeleton, CardSkeleton, TableRowSkeleton, PageSkeleton, KanbanSkeleton)
- **EmptyState**: Zero-state display with icon presets, title, description, and action/CTA
- **InlineError**: Error state with retry button for data loading failures
- **Toast**: Toast notification system with ToastProvider context (success, error, warning, info)

### App Shell Layout
Located in `components/layout/AppShell.tsx`:
- Responsive sidebar navigation with mobile hamburger menu (Escape to close)
- Header with branding, page title breadcrumb, "Novo Lead" primary action button, and user dropdown menu
- Navigation items with active/parent-active states: Leads list, Kanban board
- User menu with avatar initial, email display, and sign-out action
- Full keyboard navigation support with focus-visible styles
- Used by authenticated pages via `LeadsAppShell` wrapper

### Backend Architecture
- **API Pattern**: Mix of Server Actions (`'use server'`) and Route Handlers (`/api/*`)
- **Server Actions**: Used for lead creation (`createLeadAction`), lead movement (`moveLeadToStageAction`), and status updates (`setLeadFinalStatusAction`)
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

## Project Structure

```
app/
  page.tsx              # Login page with form accessibility
  layout.tsx            # Root layout with ToastProvider
  globals.css           # Design tokens, animations, and Tailwind v4 theme
  leads/
    page.tsx            # Leads list page with AppShell
    CreateLeadForm.tsx  # Lead creation form with validation
    LeadsAppShell.tsx   # App shell wrapper for leads pages
    ClientDate.tsx      # Hydration-safe date component
    kanban/
      page.tsx          # Kanban board page with AppShell
      KanbanBoard.tsx   # Drag-and-drop Kanban component
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

### UI Libraries
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`: Drag-and-drop functionality for Kanban board

## Recent Changes (January 2026)

### Sprint 1: UX Consistency + Premium Design
- **App Shell Refinements**: Enhanced header with page title breadcrumb, "Novo Lead" primary action button, user avatar dropdown menu with sign-out
- **Sidebar Improvements**: Clear active/parent-active states, mobile-responsive with Escape key to close, full keyboard navigation
- **State System**: Added PageSkeleton, KanbanSkeleton, InlineError components; improved EmptyState with icon presets
- **Forms UX**: Added hint text to Input component, client-side validation with inline errors, loading state on submit buttons
- **Accessibility**: Enhanced focus-visible styles across all interactive elements, ARIA attributes (aria-expanded, aria-current, aria-describedby)
- **Typography/Spacing**: Consistent tracking-tight on headings, improved responsive padding, smooth scroll behavior
- **CSS Enhancements**: Added animations (fade-in, slide-in), selection styling, prefers-reduced-motion support, autofill styling

### Previous Changes
- **Design System Implementation**: CSS tokens, component library, AppShell layout, Toast notifications
- **Health Endpoint**: `/api/health` returning JSON `{ status: 'ok', timestamp }` for monitoring
- **Optimistic UI Updates**: Lead movements in Kanban board update instantly with automatic rollback
- **Auth Fixes**: Auth callback route, password reset flow, hydration-safe date formatting
