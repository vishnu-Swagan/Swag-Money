import { IntegrationDirectory } from '../../components/directory'
import { SiteFooter, SiteNav } from '../../components/nav'

export default function IntegrationsPage() {
  return (
    <>
      <SiteNav current="integrations" />
      <main id="content" className="wrap page-pad">
        <p className="kicker">Directory</p>
        <h1>Every tool, with the status we can defend.</h1>
        <p className="dek">
          Working means the impression loop ran against the local API. Beta means the adapter compiles and its config or selectors are unit-tested, and the host product was not executed here. Scaffold means the file exists and the host will not load it yet.
        </p>
        <IntegrationDirectory />
      </main>
      <SiteFooter />
    </>
  )
}
