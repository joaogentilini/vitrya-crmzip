interface KPIDashboardProps {
  stats: {
    newLeads: number
    openConversations: number
    pendingMessages: number
    closedDeals: number
  }
}

export function KPIDashboard({ stats }: KPIDashboardProps) {
  const kpiItems = [
    {
      label: 'Novos Leads',
      value: stats.newLeads,
      icon: '👥',
      color: 'bg-blue-50 border-blue-200',
    },
    {
      label: 'Conversas Abertas',
      value: stats.openConversations,
      icon: '💬',
      color: 'bg-green-50 border-green-200',
    },
    {
      label: 'Mensagens Pendentes',
      value: stats.pendingMessages,
      icon: '📧',
      color: 'bg-yellow-50 border-yellow-200',
    },
    {
      label: 'Propostas Aprovadas',
      value: stats.closedDeals,
      icon: '✅',
      color: 'bg-purple-50 border-purple-200',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {kpiItems.map((item) => (
        <div
          key={item.label}
          className={`rounded-lg border ${item.color} p-4`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-[var(--muted-foreground)]">{item.label}</p>
              <p className="mt-2 text-2xl font-bold text-[var(--foreground)]">{item.value}</p>
            </div>
            <div className="text-3xl opacity-50">{item.icon}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
