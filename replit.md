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

### Data Model
- **Core Entities**: Pipelines, Pipeline Stages, Leads, Lead Stage Changes, Lead Audit Logs, Profiles, Tasks.
- **Lead Lifecycle**: Supports creation, status changes (open, won, lost), and detailed activity logging.
- **Task Management**: Tasks linked to leads with types, due dates, and assignment capabilities.

### Key Features
- **Lead Management**: Create, view, edit leads; Kanban board with drag-and-drop.
- **Task System**: Create, complete, reschedule, and cancel tasks associated with leads. Overdue and no-action indicators.
- **Timeline**: Detailed audit trail of lead activities and stage changes.
- **Automations**: Rules for auto-creating tasks based on lead events (e.g., creation, inactivity, stage movement), with anti-duplication and audit logging.
- **Dashboard**: Executive metrics, lead overview, and upcoming tasks.
- **Agenda**: Task calendar with daily/weekly views and direct task actions.
- **User Interface**: Comprehensive design system with accessible and responsive components.

## External Dependencies
- **Supabase**:
    - **Authentication**: Email/password authentication.
    - **Database**: PostgreSQL database.
    - **Client Libraries**: `@supabase/supabase-js`, `@supabase/ssr`.
    - **Environment Variables**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **UI Libraries**:
    - `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`: For drag-and-drop functionality in the Kanban board.