import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Política de Privacidade | Vitrya Imóveis',
  description: 'Política de Privacidade da Vitrya Imóveis.',
  alternates: {
    canonical: '/privacidade',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export const revalidate = 86400
export const dynamic = 'force-static'

const PRIVACY_TEXT = `POLÍTICA DE PRIVACIDADE  VITRYA IMÓVEIS
Última atualização: 2026-02-19

A Vitrya Imóveis (Vitrya, nós) respeita a sua privacidade e está comprometida com a proteção dos seus dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018  LGPD). Esta Política explica como coletamos, usamos e protegemos dados em nossos canais, incluindo vitrine pública, CRM e o aplicativo do corretor (quando disponível).

1. Quem somos (Controlador)
Vitrya Imóveis  Controladora dos dados pessoais tratados nesta plataforma.
Contato de privacidade: vitrya.imoveis@gmail.com
Site: vitryaimoveis.com.br

2. Quais dados coletamos
Podemos coletar:
- Dados de contato: nome, telefone, e-mail, cidade/UF.
- Dados de interesse imobiliário: tipo de imóvel, faixa de preço, bairros de interesse, intenção (comprar/alugar/investir), histórico de contato.
- Dados de navegação: páginas acessadas, cliques, endereço IP, identificadores de dispositivo/navegador, cookies.
- Localização:
  - No CRM/app do corretor: localização do imóvel (pin no mapa) e, se autorizado, localização aproximada do dispositivo do corretor para facilitar o cadastro.
- Dados de imóveis e proprietários (no CRM): informações do imóvel e documentos/autorizações de anúncio, quando aplicável.

Observação: a Vitrya busca não expor dados sensíveis do proprietário na vitrine pública. Informações internas ficam restritas ao CRM com controles de acesso.

3. Para que usamos os dados (finalidades)
Usamos seus dados para:
- Atender solicitações de contato e interesse em imóveis.
- Operar o CRM e a vitrine (cadastro, aprovação e publicação de imóveis).
- Melhorar a experiência do usuário (ex.: busca, filtros, desempenho do site).
- Prevenir fraudes e garantir segurança.
- Cumprir obrigações legais/regulatórias.
- Enviar comunicações relacionadas ao seu atendimento (ex.: retorno de contato, agendamento, propostas), quando aplicável.

4. Bases legais (LGPD)
Tratamos dados com base em:
- Execução de contrato e procedimentos preliminares (atender solicitações, intermediação imobiliária).
- Legítimo interesse (melhoria do serviço, segurança, prevenção a fraudes, métricas).
- Consentimento (quando exigido, ex.: cookies não essenciais, localização do dispositivo).
- Cumprimento de obrigação legal/regulatória.

5. Compartilhamento de dados
Podemos compartilhar dados com:
- Corretores e colaboradores autorizados da Vitrya (para atendimento).
- Provedores de tecnologia (hospedagem, banco de dados, envio de e-mails, analytics), sob contrato e com medidas de segurança.
- Google Maps Platform (para exibição de mapas, geocodificação e proximidades), quando usado no cadastro e na vitrine.
- Portais imobiliários/parceiros: somente quando você autorizar/publicar e conforme as configurações do imóvel.

Não vendemos seus dados.

6. Cookies e tecnologias de rastreamento
Podemos usar cookies para:
- Funcionalidade essencial do site.
- Medição e melhoria de desempenho.
- Personalização e análise (quando habilitado).

Você pode gerenciar cookies no seu navegador. Se implementarmos um banner de consentimento, você poderá ajustar preferências por lá.

7. Segurança
Adotamos medidas técnicas e organizacionais para proteger os dados, incluindo controle de acesso, segregação entre ambiente público e CRM, registros e políticas de segurança.

8. Retenção e descarte
Mantemos dados pelo tempo necessário para cumprir finalidades desta Política, obrigações legais e defesa em eventuais demandas. Dados podem ser anonimizados quando possível.

9. Direitos do titular (LGPD)
Você pode solicitar:
- Confirmação e acesso aos dados
- Correção
- Anonimização, bloqueio ou eliminação (quando aplicável)
- Portabilidade (quando aplicável)
- Informação sobre compartilhamento
- Revogação de consentimento (quando aplicável)

Solicitações: vitrya.imoveis@gmail.com

10. Transferência internacional
Alguns provedores podem tratar dados fora do Brasil. Nesses casos, adotamos salvaguardas contratuais e medidas de proteção compatíveis com a LGPD.

11. Atualizações desta Política
Podemos atualizar esta Política periodicamente. A versão vigente ficará disponível em /privacidade.`

export default function PrivacidadePage() {
  return (
    <main className="pv-main">
      <div className="pv-container">
        <article className="pv-glass pv-legal">
          <pre className="pv-legal-pre">{PRIVACY_TEXT}</pre>
        </article>
      </div>
    </main>
  )
}
