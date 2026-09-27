import { TOOLS, toolById } from '@swag-money/shared'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CopyCommand } from '../../../components/copy-command'
import { SiteFooter, SiteNav } from '../../../components/nav'

export function generateStaticParams() {
  return TOOLS.map((tool) => ({ tool: tool.id }))
}

export default async function ToolInstallPage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool: id } = await params
  const tool = toolById(id)
  if (!tool) notFound()
  return (
    <>
      <SiteNav current="install" />
      <main id="content" className="wrap page-pad prose">
        <p className="kicker">{tool.placement} · {tool.status}</p>
        <h1>{tool.name}</h1>
        <p>{tool.mechanism}</p>
        <p>{tool.install}</p>
        <CopyCommand command="pnpm swag-money" />
        <p>
          Auction surface <span className="mono">{tool.surface}</span>.
          {tool.sellable ? ' Advertisers can target it.' : ' This row shares the Claude Code surface and is not sold separately, because panel rendering is unverified and we will not patch the extension.'}
        </p>
        <p><Link href="/install">All install steps</Link> · <Link href="/integrations">Directory</Link></p>
      </main>
      <SiteFooter />
    </>
  )
}
