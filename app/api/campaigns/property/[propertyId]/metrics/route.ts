import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ propertyId: string }> }
) {
  try {
    const { propertyId } = await params

    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }: any) =>
                (cookieStore as any).set(name, value, options)
              )
            } catch {
              // Server Component: ignore
            }
          },
        },
      }
    )

    const { data: tasks, error } = await supabase
      .from('property_campaign_tasks')
      .select('due_date, done_at')
      .eq('property_id', propertyId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    let tasksTotal = 0
    let doneTotal = 0
    let pending = 0
    let overdue = 0
    let dueToday = 0
    let dueWeek = 0

    const today = new Date()
    const todayYMD = today.toISOString().slice(0, 10)
    const weekEnd = new Date(today)
    weekEnd.setDate(today.getDate() + 7)
    const weekEndYMD = weekEnd.toISOString().slice(0, 10)

    for (const task of tasks ?? []) {
      tasksTotal++
      if (task.done_at) {
        doneTotal++
      } else {
        pending++
        const dueYMD = task.due_date.slice(0, 10)
        if (dueYMD < todayYMD) overdue++
        else if (dueYMD === todayYMD) dueToday++
        else if (dueYMD <= weekEndYMD) dueWeek++
      }
    }

    return NextResponse.json({
      tasksTotal,
      doneTotal,
      pending,
      overdue,
      dueToday,
      dueWeek,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}