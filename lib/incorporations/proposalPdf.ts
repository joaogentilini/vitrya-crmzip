type ProposalPdfInput = {
  proposalId: string
  incorporationName: string
  developerName: string | null
  unitCode: string
  brokerName: string | null
  clientName: string
  clientEmail: string | null
  clientPhone: string | null
  offerValue: number
  downPayment: number | null
  financingType: string | null
  paymentTerms: string | null
  proposalText: string | null
  createdAtIso: string
}

function asciiText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
}

function compact(value: string | null | undefined): string {
  return String(value || '').trim()
}

function money(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(value)
}

function datePtBr(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function wrapLine(input: string, max = 90): string[] {
  const text = asciiText(compact(input))
  if (!text) return []
  if (text.length <= max) return [text]

  const parts: string[] = []
  let cursor = text
  while (cursor.length > max) {
    let splitAt = cursor.lastIndexOf(' ', max)
    if (splitAt < max * 0.45) splitAt = max
    parts.push(cursor.slice(0, splitAt).trim())
    cursor = cursor.slice(splitAt).trim()
  }
  if (cursor) parts.push(cursor)
  return parts
}

function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function buildSimplePdfBuffer(lines: string[]): Buffer {
  const maxLines = 52
  const rendered = lines.slice(0, maxLines)
  if (lines.length > maxLines) {
    rendered[maxLines - 1] = `${rendered[maxLines - 1]} ...`
  }

  const contentLines = ['BT', '/F1 11 Tf', '48 800 Td']
  rendered.forEach((line, index) => {
    if (index > 0) contentLines.push('0 -14 Td')
    contentLines.push(`(${escapePdfText(asciiText(line))}) Tj`)
  })
  contentLines.push('ET')

  const streamContent = `${contentLines.join('\n')}\n`
  const objects: string[] = []
  objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj')
  objects.push('2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj')
  objects.push(
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >> endobj'
  )
  objects.push(`4 0 obj << /Length ${Buffer.byteLength(streamContent, 'utf8')} >> stream\n${streamContent}endstream endobj`)
  objects.push('5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj')

  let body = '%PDF-1.4\n'
  const offsets: number[] = [0]
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body, 'utf8'))
    body += `${object}\n`
  }
  const xrefOffset = Buffer.byteLength(body, 'utf8')
  body += `xref\n0 ${objects.length + 1}\n`
  body += '0000000000 65535 f \n'
  for (let index = 1; index <= objects.length; index += 1) {
    body += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return Buffer.from(body, 'utf8')
}

export function buildIncorporationProposalPdf(input: ProposalPdfInput): Buffer {
  const lines: string[] = [
    'VITRYA CRM - PROPOSTA PARA INCORPORADORA',
    `ID proposta: ${input.proposalId}`,
    `Gerada em: ${datePtBr(input.createdAtIso)}`,
    '',
    `Empreendimento: ${compact(input.incorporationName) || '-'}`,
    `Construtora: ${compact(input.developerName) || '-'}`,
    `Unidade: ${compact(input.unitCode) || '-'}`,
    '',
    `Corretor responsável: ${compact(input.brokerName) || '-'}`,
    `Cliente: ${compact(input.clientName) || '-'}`,
    `E-mail cliente: ${compact(input.clientEmail) || '-'}`,
    `Telefone cliente: ${compact(input.clientPhone) || '-'}`,
    '',
    `Valor ofertado: ${money(input.offerValue)}`,
    `Entrada: ${money(input.downPayment)}`,
    `Forma de pagamento: ${compact(input.financingType) || '-'}`,
    '',
    'Condicoes de pagamento:',
    ...wrapLine(input.paymentTerms || '-'),
    '',
    'Observacoes da proposta:',
    ...wrapLine(input.proposalText || '-'),
  ]

  return buildSimplePdfBuffer(lines)
}

export type { ProposalPdfInput }
