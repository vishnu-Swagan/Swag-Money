import { SiteFooter, SiteNav } from '../../components/nav'

export default function ApiDocsPage() {
  return (
    <>
      <SiteNav current="api" />
      <main id="content" className="wrap page-pad prose">
        <p className="kicker">Advertiser API</p>
        <h1>Keys, blocks, stats.</h1>
        <p>
          Send <span className="mono">Authorization: Bearer sm_test_…</span>. Create the key while signed in to the site.
          The full secret is returned once. Later listings show the prefix only. A machine-readable outline is at <span className="mono">/v1/advertiser/openapi.json</span>.
        </p>
        <h2>Create a key</h2>
        <pre className="code">{`curl -s -X POST http://127.0.0.1:8787/v1/advertiser/api-keys \\
  -H "authorization: Bearer $SESSION" \\
  -H "content-type: application/json" \\
  -d '{"label":"ci"}'`}</pre>
        <h2>Buy a block</h2>
        <pre className="code">{`curl -s -X POST http://127.0.0.1:8787/v1/advertiser/v1/checkout \\
  -H "authorization: Bearer $SWAG_KEY" \\
  -H "content-type: application/json" \\
  -d '{
    "name": "Northwind block",
    "advertiserName": "Northwind",
    "text": "Northwind CI: ephemeral environments for every PR",
    "destinationUrl": "https://northwind.example/ci",
    "blocks": 1,
    "bidPerBlockCents": 200,
    "surfaces": ["claude-code"],
    "placement": "terminal",
    "countries": ["IN"]
  }'`}</pre>
        <p>The response mode is <span className="mono">mock</span>. No card is charged. <span className="mono">countries</span> may be empty. Placement is <span className="mono">terminal</span>, <span className="mono">editor</span>, <span className="mono">browser</span>, or <span className="mono">any</span>.</p>
        <h2>Read delivery</h2>
        <pre className="code">{`curl -s http://127.0.0.1:8787/v1/advertiser/v1/campaigns -H "authorization: Bearer $SWAG_KEY"
curl -s http://127.0.0.1:8787/v1/advertiser/v1/stats -H "authorization: Bearer $SWAG_KEY"`}</pre>
        <h2>Public ledger</h2>
        <pre className="code">{`curl -s http://127.0.0.1:8787/v1/public/stats`}</pre>
        <p>That object is counted from impressions and ledger rows. The homepage renders it and shows nothing if the API is down.</p>
        <h2>Auth for people</h2>
        <pre className="code">{`curl -s -X POST http://127.0.0.1:8787/v1/auth/signup -H 'content-type: application/json' \\
  -d '{"email":"you@example.com","name":"You","password":"at-least-8","role":"developer"}'
curl -s -X POST http://127.0.0.1:8787/v1/auth/login -H 'content-type: application/json' \\
  -d '{"email":"you@example.com","password":"at-least-8"}'`}</pre>
      </main>
      <SiteFooter />
    </>
  )
}
