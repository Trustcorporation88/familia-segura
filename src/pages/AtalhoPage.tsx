import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check, Copy, KeyRound, Smartphone, Trash2 } from 'lucide-react'
import { Button, Card, PageHeader } from '../components/ui'
import { useToast } from '../context/ToastContext'
import { createLocationToken, locationTokenStatus, revokeLocationToken } from '../lib/api'
import { SUPABASE_KEY, SUPABASE_URL } from '../lib/supabase'
import { timeAgo } from '../lib/format'

const ENDPOINT = `${SUPABASE_URL}/rest/v1/rpc/report_location`

/** Linha com valor + botão Copiar (o atalho é montado no próprio iPhone). */
function CopyField({ label, value, id, copied, onCopy }: { label: string; value: string; id: string; copied: string | null; onCopy: (id: string, v: string) => void }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-800">{value}</code>
        <button
          onClick={() => onCopy(id, value)}
          aria-label={`Copiar ${label}`}
          className="flex shrink-0 items-center gap-1 rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"
        >
          {copied === id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied === id ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  )
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{n}</span>
      <div className="min-w-0 flex-1 text-sm text-slate-700">{children}</div>
    </li>
  )
}

export default function AtalhoPage() {
  const toast = useToast()
  const [status, setStatus] = useState<{ createdAt: string; lastUsedAt: string | null } | null | undefined>(undefined)
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  async function refresh() {
    try {
      setStatus(await locationTokenStatus())
    } catch {
      setStatus(null)
    }
  }

  useEffect(() => {
    void refresh()
    // Atualiza o "último envio" enquanto a pessoa testa o atalho.
    const t = window.setInterval(() => void refresh(), 15_000)
    return () => window.clearInterval(t)
  }, [])

  async function generate() {
    if (status && !confirm('Gerar uma chave nova faz o atalho antigo parar de funcionar. Você vai precisar trocar a chave no atalho. Continuar?')) return
    setBusy(true)
    try {
      setToken(await createLocationToken())
      await refresh()
    } catch {
      toast.show({ kind: 'danger', title: 'Não foi possível gerar a chave' })
    } finally {
      setBusy(false)
    }
  }

  async function revoke() {
    if (!confirm('Desligar o atalho? Ele para de enviar sua localização até você gerar uma chave nova.')) return
    try {
      await revokeLocationToken()
      setToken(null)
      await refresh()
      toast.show({ kind: 'info', title: 'Atalho desligado' })
    } catch {
      toast.show({ kind: 'danger', title: 'Não foi possível desligar' })
    }
  }

  async function copy(id: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(id)
      window.setTimeout(() => setCopied(null), 2000)
    } catch {
      toast.show({ kind: 'danger', title: 'Não deu para copiar', body: 'Segure o dedo sobre o texto e copie manualmente.' })
    }
  }

  return (
    <>
      <PageHeader
        title="Atalho do iPhone"
        subtitle="Localização atualizada sem abrir o site"
        action={
          <Link to="/ajustes" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        }
      />
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <Card>
          <div className="flex gap-3">
            <Smartphone className="h-6 w-6 shrink-0 text-brand-600" />
            <p className="text-sm text-slate-700">
              O iPhone não deixa sites usarem o GPS com a tela bloqueada. O app <b>Atalhos</b>, que já vem no iPhone, consegue: ele envia sua
              localização sozinho quando você abre o WhatsApp, chega ou sai de casa, liga o carregador ou em horários que você escolher.
              Faça isto <b>no iPhone</b>, uma vez só.
            </p>
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-brand-600" />
            <h2 className="font-semibold text-slate-900">1. Sua chave</h2>
          </div>
          {status === undefined ? (
            <p className="text-sm text-slate-500">Carregando…</p>
          ) : status ? (
            <p className="text-sm text-slate-600">
              Atalho ativo. Último envio: <b>{status.lastUsedAt ? timeAgo(status.lastUsedAt) : 'ainda nenhum'}</b>.
            </p>
          ) : (
            <p className="text-sm text-slate-600">Você ainda não tem uma chave. Gere uma para montar o atalho.</p>
          )}
          {token ? (
            <div className="space-y-3 rounded-2xl bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-900">Copie agora: a chave só aparece esta vez. Se perder, gere outra.</p>
              <CopyField label="Chave (p_token)" value={token} id="token" copied={copied} onCopy={copy} />
            </div>
          ) : (
            <Button onClick={generate} loading={busy} full>
              {status ? 'Gerar chave nova' : 'Gerar minha chave'}
            </Button>
          )}
          {status && (
            <button onClick={revoke} className="flex items-center gap-1 text-sm font-semibold text-red-600 hover:underline">
              <Trash2 className="h-4 w-4" /> Desligar atalho
            </button>
          )}
        </Card>

        <Card className="space-y-3">
          <h2 className="font-semibold text-slate-900">2. Endereço e chave do app</h2>
          <CopyField label="URL" value={ENDPOINT} id="url" copied={copied} onCopy={copy} />
          <CopyField label="Cabeçalho apikey" value={SUPABASE_KEY} id="apikey" copied={copied} onCopy={copy} />
        </Card>

        <Card className="space-y-3">
          <h2 className="font-semibold text-slate-900">3. Criar o atalho (app Atalhos)</h2>
          <ol className="space-y-3">
            <Step n={1}>Abra o app <b>Atalhos</b> → aba <b>Atalhos</b> → <b>+</b>. Toque no nome no topo e chame de <b>Família Segura</b>.</Step>
            <Step n={2}>Toque em <b>Adicionar Ação</b>, busque <b>Obter Localização Atual</b> e adicione.</Step>
            <Step n={3}>Adicione a ação <b>Obter Nível da Bateria</b>.</Step>
            <Step n={4}>
              Adicione a ação <b>Obter Conteúdo da URL</b>. No campo URL, cole a <b>URL</b> copiada acima. Toque na setinha <b>›</b> para ver
              mais opções:
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li><b>Método</b>: POST</li>
                <li><b>Cabeçalhos</b> → Adicionar Novo Cabeçalho → chave <code>apikey</code>, valor: cole o <b>cabeçalho apikey</b>.</li>
                <li><b>Corpo da Solicitação</b>: JSON. Adicione 4 campos:
                  <ul className="mt-1 list-[circle] space-y-1 pl-5">
                    <li><b>Texto</b> · chave <code>p_token</code> · valor: cole a sua <b>chave</b>.</li>
                    <li><b>Número</b> · chave <code>p_lat</code> · valor: toque em Variáveis → <b>Localização Atual</b>, toque nela e escolha <b>Latitude</b>.</li>
                    <li><b>Número</b> · chave <code>p_lng</code> · valor: <b>Localização Atual</b> → <b>Longitude</b>.</li>
                    <li><b>Número</b> · chave <code>p_battery</code> · valor: <b>Nível da Bateria</b>.</li>
                  </ul>
                </li>
              </ul>
            </Step>
            <Step n={5}>
              Toque em <b>▶</b> para testar. Na primeira vez, permita a localização (<b>Permitir Sempre</b>) e o acesso à internet. A resposta
              deve ser <b>"ok"</b>, e o <b>Último envio</b> acima muda para "agora" em até 15 s.
            </Step>
          </ol>
        </Card>

        <Card className="space-y-3">
          <h2 className="font-semibold text-slate-900">4. Automações (para enviar sozinho)</h2>
          <p className="text-sm text-slate-600">
            No app Atalhos → aba <b>Automação</b> → <b>+</b> (Nova Automação). Para cada uma: escolha o gatilho, marque{' '}
            <b>Executar Imediatamente</b>, desligue <b>Notificar ao Executar</b> se aparecer, toque em <b>Avançar</b> e escolha o atalho{' '}
            <b>Família Segura</b>.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li><b>App</b> → WhatsApp (e Instagram, se quiser) → <b>É Aberto</b>. É o que mais atualiza.</li>
            <li><b>Chegada</b> e <b>Saída</b> → casa, trabalho, escola.</li>
            <li><b>Carregador</b> → <b>Está Conectado</b> e <b>Está Desconectado</b>.</li>
            <li><b>Hora do Dia</b> → algumas horas (ex.: 7h, 9h, 12h, 15h, 18h, 21h), uma automação para cada.</li>
          </ul>
          <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
            Ajustes do iPhone → Privacidade e Segurança → Serviços de Localização → <b>Atalhos</b>: <b>Sempre</b> e <b>Localização Precisa</b>{' '}
            ligada. No Modo de Pouca Energia o iPhone pode pular algumas automações.
          </p>
        </Card>
      </div>
    </>
  )
}
