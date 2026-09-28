'use client'

import { COUNTRIES, TOOLS, countryName, formatUsd, validateBuyPayload } from '@swag-money/shared'
import { useActionState, useMemo, useState } from 'react'
import { checkoutBlocks, type FormState } from '../app/actions'

const LINE = 'Northwind - ephemeral CI for every pull request'

export function BuyForm({
  signedIn,
  role,
}: {
  signedIn: boolean
  role?: string
}) {
  const [state, action, pending] = useActionState(checkoutBlocks, null as FormState)
  const [text, setText] = useState(LINE)
  const [destinationUrl, setDestinationUrl] = useState('https://northwind.example/ci')
  const [companyName, setCompanyName] = useState('Northwind')
  const [bid, setBid] = useState('2.00')
  const [blocks, setBlocks] = useState('1')
  const [placement, setPlacement] = useState('terminal')
  const [tool, setTool] = useState('claude-code')
  const [pace, setPace] = useState('medium')
  const [audience, setAudience] = useState('everywhere')
  const [countries, setCountries] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [icon, setIcon] = useState('')
  const [iconError, setIconError] = useState('')
  const [ack, setAck] = useState(false)
  const sellable = TOOLS.filter((item) => item.sellable)
  const preview = useMemo(
    () =>
      validateBuyPayload({
        text,
        destinationUrl,
        companyName,
        brandIconDataUrl: icon,
        blocks: Number(blocks),
        bid,
        placement,
        tool,
        pace,
        audience,
        countries,
        acknowledgeDelivery: true,
      }),
    [text, destinationUrl, companyName, icon, blocks, bid, placement, tool, pace, audience, countries],
  )
  const errors = state?.errors ?? {}
  const matches = COUNTRIES.filter((country) => {
    const hay = `${country.name} ${country.code}`.toLowerCase()
    return hay.includes(query.trim().toLowerCase()) && !countries.includes(country.code)
  }).slice(0, 8)

  function onIcon(file: File | undefined) {
    setIconError('')
    setIcon('')
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setIconError('Icon must be a PNG, JPG, or WebP file.')
      return
    }
    if (file.size > 64 * 1024) {
      setIconError('Icon must be 64 KB or smaller.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : ''
      const checked = validateBuyPayload({
        text,
        destinationUrl,
        companyName,
        brandIconDataUrl: value,
        blocks: 1,
        bid: '2.00',
        placement: 'terminal',
        pace: 'medium',
        audience: 'everywhere',
        acknowledgeDelivery: true,
      })
      if (!checked.ok && checked.errors.brandIcon) {
        setIconError(checked.errors.brandIcon)
        return
      }
      setIcon(value)
    }
    reader.readAsDataURL(file)
  }

  if (signedIn && role === 'developer') {
    return <p className="banner">This account earns. Sign out, then use an advertiser email to buy a block.</p>
  }

  return (
    <form className="panel buy-layout" action={action}>
      <div>
        {!signedIn ? (
          <>
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoComplete="email" placeholder="you@company.com" aria-invalid={errors.email ? true : undefined} />
            <FieldError message={errors.email} />
          </>
        ) : (
          <p className="tiny">This buy is attached to the signed-in advertiser.</p>
        )}
        <label htmlFor="text">Ad line</label>
        <input
          id="text"
          name="text"
          required
          minLength={3}
          maxLength={60}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Northwind - ephemeral CI for every pull request"
          aria-invalid={errors.text ? true : undefined}
        />
        <p className="tiny">{text.trim().length}/60. Brand-first lines tend to be the ones people finish reading.</p>
        <FieldError message={errors.text} />
        <label htmlFor="destinationUrl">Destination URL</label>
        <input
          id="destinationUrl"
          name="destinationUrl"
          type="url"
          required
          maxLength={500}
          value={destinationUrl}
          onChange={(event) => setDestinationUrl(event.target.value)}
          placeholder="https://example.com/docs"
          aria-invalid={errors.destinationUrl ? true : undefined}
        />
        <p className="tiny">https only, 500 characters or fewer. It stays on the server. It is not inside the signed line.</p>
        <FieldError message={errors.destinationUrl} />
        <label htmlFor="companyName">Company or brand</label>
        <input
          id="companyName"
          name="companyName"
          required
          maxLength={120}
          value={companyName}
          onChange={(event) => setCompanyName(event.target.value)}
          aria-invalid={errors.companyName ? true : undefined}
        />
        <p className="tiny">Up to 120 characters on the invoice. The signed brand is the first 40.</p>
        <FieldError message={errors.companyName} />
        <label htmlFor="brandIconFile">Brand icon</label>
        <input id="brandIconFile" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => onIcon(event.target.files?.[0])} />
        <input type="hidden" name="brandIcon" value={icon} />
        <p className="tiny">PNG, JPG, or WebP. 64 KB or less. Optional.</p>
        <FieldError message={iconError || errors.brandIcon} />
        <label className="check-row">
          <input type="checkbox" name="emailInvoice" value="yes" />
          Email me a tax invoice
        </label>
        <p className="tiny">Noted on the order. This build does not send mail.</p>
        <div className="grid-2">
          <div>
            <label htmlFor="bid">Bid per 1,000 impressions (USD)</label>
            <input id="bid" name="bid" required inputMode="decimal" value={bid} onChange={(event) => setBid(event.target.value)} aria-invalid={errors.bid ? true : undefined} />
            <FieldError message={errors.bid} />
          </div>
          <div>
            <label htmlFor="blocks">Blocks</label>
            <input id="blocks" name="blocks" type="number" min={1} max={100} required value={blocks} onChange={(event) => setBlocks(event.target.value)} aria-invalid={errors.blocks ? true : undefined} />
            <FieldError message={errors.blocks} />
          </div>
        </div>
        <fieldset>
          <legend>Surface</legend>
          {[
            ['terminal', 'Terminal'],
            ['editor', 'Editor'],
            ['browser', 'Browser'],
            ['tool', 'A specific tool'],
          ].map(([value, label]) => (
            <label key={value} className="check-row">
              <input type="radio" name="placement" value={value} checked={placement === value} onChange={() => setPlacement(value)} />
              {label}
            </label>
          ))}
          <FieldError message={errors.placement} />
          {placement === 'tool' ? (
            <>
              <label htmlFor="tool">Tool</label>
              <select id="tool" name="tool" value={tool} onChange={(event) => setTool(event.target.value)}>
                {sellable.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.status})
                  </option>
                ))}
              </select>
              <p className="tiny">Beta and scaffold tools can be bought. They do not deliver until that adapter runs.</p>
            </>
          ) : (
            <input type="hidden" name="tool" value="" />
          )}
        </fieldset>
        <fieldset>
          <legend>Delivery speed</legend>
          <p className="tiny">Slow, medium, or fast. This does not change the price.</p>
          {['slow', 'medium', 'fast'].map((value) => (
            <label key={value} className="check-row">
              <input type="radio" name="pace" value={value} checked={pace === value} onChange={() => setPace(value)} />
              {value}
            </label>
          ))}
          <FieldError message={errors.pace} />
        </fieldset>
        <fieldset>
          <legend>Audience</legend>
          <label className="check-row">
            <input type="radio" name="audience" value="everywhere" checked={audience === 'everywhere'} onChange={() => setAudience('everywhere')} />
            Everywhere
          </label>
          <label className="check-row">
            <input type="radio" name="audience" value="countries" checked={audience === 'countries'} onChange={() => setAudience('countries')} />
            Selected countries (+$0.75 per 1,000)
          </label>
          {audience === 'countries' ? (
            <div className="picker">
              <label htmlFor="country-search">Search countries</label>
              <input id="country-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="India, IN, United…" />
              <div className="checks">
                {countries.map((code) => (
                  <button key={code} type="button" className="button secondary" onClick={() => setCountries(countries.filter((item) => item !== code))}>
                    {countryName(code)} ×
                  </button>
                ))}
              </div>
              <div className="picker-list">
                {matches.map((country) => (
                  <button
                    key={country.code}
                    type="button"
                    disabled={countries.length >= 20}
                    onClick={() => setCountries([...countries, country.code])}
                  >
                    {country.name}
                  </button>
                ))}
              </div>
              {countries.map((code) => (
                <input key={code} type="hidden" name="countries" value={code} />
              ))}
              <FieldError message={errors.countries} />
            </div>
          ) : null}
          <FieldError message={errors.audience} />
        </fieldset>
        <label className="check-row">
          <input
            type="checkbox"
            name="acknowledgeDelivery"
            value="yes"
            checked={ack}
            onChange={(event) => setAck(event.target.checked)}
            aria-invalid={errors.acknowledgeDelivery ? true : undefined}
          />
          I understand this campaign can take a long time to deliver, and it can stall while higher bids are ahead of it.
        </label>
        <FieldError message={errors.acknowledgeDelivery} />
        <p className="tiny">You never pay more than the total shown. If a block delivers extra verified impressions, those are free.</p>
        <FieldError message={errors.form} />
        <button className="button" type="submit" disabled={pending}>
          {pending ? 'Recording the mock charge…' : 'Check out with a mock card'}
        </button>
      </div>
      <aside className="buy-side" aria-live="polite">
        <h2>Live preview</h2>
        <p className="tiny">What a viewer sees. One signed line.</p>
        <div className="ad-preview">
          {icon ? <img src={icon} alt="" width={28} height={28} /> : null}
          <span>✶ {text.trim() || 'Your line shows up here'}</span>
        </div>
        <h2>Estimated total</h2>
        {preview.ok ? (
          <>
            <p className="total">{formatUsd(preview.value.quote.totalCents)}</p>
            <p className="tiny">
              {formatUsd(preview.value.quote.budgetCents)} bid
              {preview.value.quote.countrySurchargeCents > 0 ? ` + ${formatUsd(preview.value.quote.countrySurchargeCents)} country surcharge` : ''}
              . Pace is not in this number.
            </p>
            <h2>Delivery forecast</h2>
            <p><strong>{preview.value.forecast.headline}</strong></p>
            <p className="tiny">{preview.value.forecast.detail}</p>
          </>
        ) : (
          <p className="tiny">Fix the highlighted fields to see a total. No estimate is invented from an invalid bid.</p>
        )}
      </aside>
    </form>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="field-error">{message}</p>
}
