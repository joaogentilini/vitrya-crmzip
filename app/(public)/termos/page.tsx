import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Termos de Uso | Vitrya Imóveis',
  description: 'Termos de Uso da Vitrya Imóveis.',
  alternates: {
    canonical: '/termos',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export const revalidate = 86400
export const dynamic = 'force-static'

const TERMS_TEXT = `TERMOS DE USO  VITRYA IMÓVEIS
Última atualização: 2026-02-19

Estes Termos regulam o uso do site e serviços da Vitrya Imóveis, incluindo a vitrine pública e, quando aplicável, o acesso ao CRM por corretores/usuários autorizados.

1. Aceitação
Ao acessar ou usar nossos serviços, você concorda com estes Termos e com a Política de Privacidade.

2. Vitrine pública (visitantes e interessados)
A vitrine apresenta informações de imóveis com finalidade informativa/comercial. Apesar de buscarmos manter dados atualizados, informações podem mudar sem aviso (preço, disponibilidade, características). A confirmação deve ser feita com um corretor autorizado.

3. Contato e atendimento
Ao preencher formulários ou entrar em contato, você declara que os dados fornecidos são verdadeiros e autoriza que a Vitrya retorne por canais informados (telefone, WhatsApp, e-mail), conforme a Política de Privacidade.

4. Conteúdo de imóveis
- O conteúdo (descrições, fotos, vídeos, localização aproximada/exata) pode ser fornecido por proprietários, corretores e parceiros.
- A Vitrya pode revisar, ajustar, recusar ou remover anúncios por critérios internos, conformidade legal, qualidade e segurança.
- Documentos e autorizações de anúncio podem ser exigidos no CRM antes de publicação.

5. Regras de uso (proibições)
Você concorda em não:
- tentar invadir, burlar, explorar vulnerabilidades ou realizar scraping abusivo;
- copiar, revender ou explorar comercialmente o conteúdo sem autorização;
- publicar conteúdo ilegal, difamatório ou que viole direitos de terceiros.

6. Área do corretor / CRM
O CRM é restrito a usuários autorizados.
- O usuário é responsável por manter credenciais seguras.
- A Vitrya pode suspender acesso em caso de uso indevido, violação destes Termos ou risco à segurança.
- Registros e alterações podem ser auditados.

7. Mapas, geolocalização e proximidades
- O sistema pode usar recursos de mapas (ex.: Google Maps) para marcar localizações e listar pontos de interesse próximos.
- Proximidades podem refletir dados de terceiros e não garantem disponibilidade, qualidade ou funcionamento de estabelecimentos.
- Em dispositivos móveis, a localização do dispositivo só será usada mediante permissão do usuário.

8. Propriedade intelectual
Marcas, identidade visual, layout, códigos, banco de dados e materiais pertencem à Vitrya ou licenciantes. Não é permitido uso sem autorização.

9. Limitação de responsabilidade
Na extensão permitida por lei, a Vitrya não se responsabiliza por:
- decisões tomadas com base nas informações do site sem validação;
- indisponibilidades temporárias do serviço;
- ações de terceiros, portais, provedores e serviços externos.

10. Alterações e encerramento
Podemos alterar estes Termos e/ou encerrar funcionalidades, sempre que necessário. A versão vigente ficará em /termos.

11. Lei aplicável e foro
Aplica-se a legislação brasileira. Fica eleito o foro da comarca da sede da Vitrya (ajustável) para dirimir eventuais conflitos, salvo normas específicas.`

export default function TermosPage() {
  return (
    <main className="pv-main">
      <div className="pv-container">
        <article className="pv-glass pv-legal">
          <pre className="pv-legal-pre">{TERMS_TEXT}</pre>
        </article>
      </div>
    </main>
  )
}
