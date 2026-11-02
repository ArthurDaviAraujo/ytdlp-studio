/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react'
import { BadgeCheck, Heart, MessageSquare, Pin, ThumbsUp } from 'lucide-react'
import type { YtComment } from '../../../shared/types'
import { Badge, Button, Empty, Select, Spinner } from './ui'
import { compact, epoch, num } from '../lib/format'
import { t } from '../../../shared/i18n'

function Comment({ c, replies }: { c: YtComment; replies?: YtComment[] }) {
  return (
    <div className="flex gap-3">
      {c.author_thumbnail ? (
        <img src={c.author_thumbnail} alt="" className="h-9 w-9 shrink-0 rounded-full bg-panel-3" />
      ) : (
        <div className="h-9 w-9 shrink-0 rounded-full bg-panel-3" />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={c.author_is_uploader ? 'rounded bg-panel-3 px-1.5 py-0.5 font-medium' : 'font-medium'}>{c.author}</span>
          {c.author_is_verified && <BadgeCheck className="h-3.5 w-3.5 text-muted" />}
          <span className="text-muted" title={c.timestamp ? epoch(c.timestamp) : undefined}>
            {c._time_text ?? (c.timestamp ? epoch(c.timestamp) : '')}
          </span>
          {c.is_pinned && (
            <Badge>
              <Pin className="h-3 w-3" />{t(' Fixado')}
            </Badge>
          )}
          {c.is_favorited && (
            <Badge tone="accent">
              <Heart className="h-3 w-3" />{t(' Curtido pelo criador')}
            </Badge>
          )}
        </div>
        <div className="selectable text-sm leading-relaxed whitespace-pre-wrap">{c.text}</div>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <ThumbsUp className="h-3.5 w-3.5" /> {compact(c.like_count ?? 0)}
        </div>
        {replies && replies.length > 0 && (
          <div className="mt-3 space-y-4 border-l border-line pl-4">
            {replies.map((r) => (
              <Comment key={r.id} c={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function CommentsTab({ info }: { info: any }) {
  const [max, setMax] = useState(100)
  const [sort, setSort] = useState<'top' | 'new'>('top')
  const [loading, setLoading] = useState(false)
  const [comments, setComments] = useState<YtComment[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    const r = await window.api.getComments(info.webpage_url, max, sort)
    setLoading(false)
    if (r.ok) setComments(r.comments)
    else setError(r.error)
  }

  const threads = useMemo(() => {
    if (!comments) return []
    const replies = new Map<string, YtComment[]>()
    for (const c of comments) if (c.parent && c.parent !== 'root') replies.set(c.parent, [...(replies.get(c.parent) ?? []), c])
    return comments.filter((c) => !c.parent || c.parent === 'root').map((c) => ({ c, replies: replies.get(c.id) ?? [] }))
  }, [comments])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel p-3">
        <MessageSquare className="h-4 w-4 text-muted" />
        <span className="text-sm">
          {info.comment_count != null ? t('{n} comentários no total.', { n: num(info.comment_count) }) : t('Comentários')}{t(' Buscar:')}
        </span>
        <div className="w-32">
          <Select value={max} onChange={(e) => setMax(Number(e.target.value))}>
            {[20, 50, 100, 200, 500, 1000].map((n) => (
              <option key={n} value={n}>
                {n}{t(' comentários')}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select value={sort} onChange={(e) => setSort(e.target.value as 'top' | 'new')}>
            <option value="top">{t('Mais relevantes')}</option>
            <option value="new">{t('Mais recentes')}</option>
          </Select>
        </div>
        <Button variant="primary" onClick={load} disabled={loading} icon={loading ? <Spinner /> : null}>
          {loading ? t('Buscando…') : comments ? t('Buscar de novo') : t('Carregar comentários')}
        </Button>
        <span className="text-xs text-muted">{t('Pode levar alguns segundos. Para salvar junto com o vídeo, ative “Salvar comentários” nas opções.')}</span>
      </div>
      {error && <div className="rounded-xl border border-err/30 bg-err/10 p-3 text-sm whitespace-pre-wrap text-err">{error}</div>}
      {comments && !comments.length && <Empty title={t('Nenhum comentário retornado')} />}
      {threads.length > 0 && (
        <div className="space-y-5 rounded-xl border border-line bg-panel p-5">
          <div className="text-xs text-muted">{comments!.length}{t(' carregados')}</div>
          {threads.map(({ c, replies }) => (
            <Comment key={c.id} c={c} replies={replies} />
          ))}
        </div>
      )}
    </div>
  )
}
