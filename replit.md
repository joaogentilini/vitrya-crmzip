# Vitrya CRM

## Overview

Vitrya CRM is a customer relationship management application built with Next.js 16 and Supabase. The application provides lead management functionality with a Kanban board interface for visualizing and managing leads through different pipeline stages. Users can create leads, move them between stages via drag-and-drop, and mark them as won or lost.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: Next.js 16 with App Router
- **UI Pattern**: React Server Components for data fetching, Client Components for interactivity
- **Styling**: Tailwind CSS v4 with CSS variables for theming (light/dark mode support)
- **Drag-and-Drop**: @dnd-kit library suite (core, sortable, utilities) for Kanban board interactions
- **Fonts**: Geist font family loaded via next/font

### Backend Architecture
- **API Pattern**: Mix of Server Actions (`'use server'`) and Route Handlers (`/api/*`)
- **Server Actions**: Used for lead creation (`createLeadAction`), lead movement (`moveLeadToStageAction`), and status updates (`setLeadFinalStatusAction`)
- **Route Handlers**: REST endpoint at `/api/leads/finalize` for finalizing leads
- **Data Fetching**: Server Components fetch data directly using Supabase client, with `force-dynamic` and `revalidate = 0` for real-time data

### State Management
- **Server State**: Managed via Server Components with `revalidatePath()` for cache invalidation
- **Client State**: React `useState` for form inputs and UI state, `useTransition` for pending states
- **Auth State**: Supabase auth listeners with `onAuthStateChange` for session management

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

### UX Improvements
- **Optimistic UI Updates**: Lead movements in Kanban board update instantly with automatic rollback on server failure
- **DragOverlay**: Visual feedback showing the lead card being dragged
- **Ganhar/Perder Buttons**: Fixed button clicks inside draggable cards by stopping pointer event propagation

### Authentication Fixes
- **Auth Callback Route**: Added `/auth/callback` route handler for Supabase code exchange (fixes SSR auth mismatch)
- **Password Reset Flow**: Added `/auth/reset` page for password recovery

### Hydration Fixes
- **Date Formatting**: Server renders ISO dates, client renders locale-formatted dates after mount to prevent hydration mismatches

### Configuration
- **next.config.ts**: Configured `serverActions.allowedOrigins` for Replit deployment hosts