import { TOOLS } from '@swag-money/shared'
import Link from 'next/link'
import { CopyCommand } from '../../components/copy-command'
import { SiteFooter, SiteNav } from '../../components/nav'

export default function InstallPage() {
  return (
    <>
      <SiteNav current="install" />
      <main id="content" className="wrap page-pad">
        <p className="kicker">Install</p>
        <h1>One command. Official settings only.</h1>
        <p className="dek">
          The installer looks for config directories you already have and writes the documented keys for those tools.
          It does not patch another vendor&apos;s extension, and it does not weaken a content security policy.
        </p>
        <CopyCommand command="pnpm swag-money" />
        <p className="tiny">
          From this repository that runs <span className="mono">tsx packages/installer/src/cli.ts</span>.
          After the package is published, the same entry point is <span className="mono">npx swag-money</span>.
          Add <span className="mono">apply</span> to write config: <span className="mono">pnpm swag-money apply</span>.
        </p>
        <section className="band">
          <h2>Then, per tool</h2>
          <table>
            <thead>
              <tr>
                <th>Tool</th>
                <th>Status</th>
                <th>What install does</th>
              </tr>
            </thead>
            <tbody>
              {TOOLS.map((tool) => (
                <tr key={tool.id}>
                  <td><Link href={`/install/${tool.id}`}>{tool.name}</Link></td>
                  <td><span className={`badge ${tool.status}`}>{tool.status}</span></td>
                  <td>{tool.install}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
