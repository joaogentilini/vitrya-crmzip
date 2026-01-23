'use client'

import { useState, useEffect } from 'react'
import { SettingsAppShell } from '@/components/SettingsAppShell'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'

interface DoctorResult {
  ok: boolean
  checked_at?: string
  missing_tables?: string[]
  missing_columns?: Array<{ table: string; column: string }>
  missing_triggers?: string[]
  rls_disabled?: string[]
  notes?: string[]
  error?: string
  details?: string
  requestId?: string
}

interface DoctorClientProps {
  userEmail?: string
}

export function DoctorClient({ userEmail }: DoctorClientProps) {
  const [result, setResult] = useState<DoctorResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const runCheck = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const resp = await fetch('/api/admin/doctor')
      const data = await resp.json()
      
      if (!resp.ok) {
        setError(data.error || 'Erro ao executar diagnóstico')
        setResult(data)
      } else {
        setResult(data)
      }
    } catch (err) {
      setError('Erro de conexão com o servidor')
      console.error('[DoctorClient] Error:', err)
    } finally {
      setLoading(false)
    }
  }
  
  useEffect(() => {
    runCheck()
  }, [])
  
  const StatusIcon = ({ ok }: { ok: boolean }) => (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${
      ok ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'
    }`}>
      {ok ? (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
    </span>
  )
  
  return (
    <SettingsAppShell userEmail={userEmail} pageTitle="Doctor Check">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
              Doctor Check
            </h1>
            <p className="text-sm text-[var(--muted-foreground)]">
              Diagnóstico de integridade do banco de dados
            </p>
          </div>
          <Button onClick={runCheck} disabled={loading}>
            {loading ? 'Verificando...' : 'Executar Novamente'}
          </Button>
        </div>
        
        {error && (
          <Card className="border-red-500/50">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <StatusIcon ok={false} />
                <div>
                  <p className="font-medium text-red-500">{error}</p>
                  {result?.details && (
                    <p className="text-sm text-[var(--muted-foreground)] mt-1">
                      {result.details}
                    </p>
                  )}
                  {result?.requestId && (
                    <p className="text-xs text-[var(--muted-foreground)] mt-2">
                      Request ID: {result.requestId}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        
        {result && !error && (
          <>
            <Card className={result.ok ? 'border-green-500/50' : 'border-yellow-500/50'}>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <StatusIcon ok={result.ok} />
                  <span className={result.ok ? 'text-green-500' : 'text-yellow-500'}>
                    {result.ok ? 'Sistema OK' : 'Problemas Detectados'}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[var(--muted-foreground)]">
                  Verificado em: {result.checked_at ? new Date(result.checked_at).toLocaleString('pt-BR') : 'N/A'}
                </p>
                {result.requestId && (
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">
                    Request ID: {result.requestId}
                  </p>
                )}
              </CardContent>
            </Card>
            
            {(result.missing_tables?.length ?? 0) > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Tabelas Faltando</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    {result.missing_tables?.map(t => (
                      <li key={t} className="text-red-500">{t}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
            
            {(result.missing_columns?.length ?? 0) > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Colunas Faltando</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    {result.missing_columns?.map((c, i) => (
                      <li key={i} className="text-red-500">
                        {c.table}.{c.column}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
            
            {(result.missing_triggers?.length ?? 0) > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Triggers Faltando</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    {result.missing_triggers?.map(t => (
                      <li key={t} className="text-yellow-500">{t}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
            
            {(result.rls_disabled?.length ?? 0) > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">RLS Desabilitado</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    {result.rls_disabled?.map(t => (
                      <li key={t} className="text-yellow-500">{t}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
            
            {(result.notes?.length ?? 0) > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Notas</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    {result.notes?.map((n, i) => (
                      <li key={i} className="text-[var(--muted-foreground)]">{n}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
            
            <Card>
              <CardHeader>
                <CardTitle className="text-base">JSON Completo</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-[var(--muted)] p-4 rounded-lg overflow-x-auto text-xs">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </>
        )}
        
        {loading && !result && (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]"></div>
              <p className="mt-4 text-[var(--muted-foreground)]">Executando diagnóstico...</p>
            </CardContent>
          </Card>
        )}
      </div>
    </SettingsAppShell>
  )
}
