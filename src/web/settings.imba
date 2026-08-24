import {trafficPeriods} from './context.imba'
import {intl, language as currentLanguage, languages, setLanguage, t} from './i18n.imba'

const clock = {
	offset: do(name)
		try
			const part = new Intl.DateTimeFormat('en-US', {timeZone: name, timeZoneName: 'longOffset'}).formatToParts(new Date).find do(item) item.type == 'timeZoneName'
			const value = part..value or 'GMT'
			return 'UTC' if value == 'GMT'
			const match = value.match(/^GMT([+-])(\d{2}):(\d{2})$/)
			return value.replace('GMT', 'UTC') unless match
			const hours = Number(match[2])
			match[3] == '00' ? "UTC{match[1]}{hours}" : "UTC{match[1]}{hours}:{match[3]}"
		catch
			'UTC'
	label: do(name)
		"{clock.offset(name)} · {name.replace(/_/g, ' ')}"
}

const channels = [
	{id: 'stable', label: 'settings.update.channel.stable'}
	{id: 'candidate', label: 'settings.update.channel.candidate'}
]

const preview = new URLSearchParams(window.location.search).get('preview')

tag outpost-settings-select
	value = ''
	items = []
	change = null
	searchable = false
	disabled = false
	open = false
	above = false
	query = ''
	placeholder = 'Найти'

	get selected
		items.find(do(item) item.id == value) or items[0] or {id: '', label: '—'}

	get visible
		const term = query.trim!.toLowerCase!
		return items unless term
		items.filter do(item) "{t(item.label)} {item.id}".toLowerCase!.includes(term)

	def toggle
		return if disabled
		open = !open
		query = ''
		if open
			above = false
			imba.commit!
			window.requestAnimationFrame do
				align!
				if searchable
					const input = self.querySelector('.search input')
					input.focus! if input

	def align
		return unless open
		const trigger = self.querySelector('.trigger')
		const menu = self.querySelector('.menu')
		return unless trigger and menu
		const rect = trigger.getBoundingClientRect!
		const room = window.innerHeight - rect.bottom
		above = room < menu.offsetHeight + 12 and rect.top > room
		imba.commit!

	def close
		open = false
		query = ''

	def choose item
		close!
		change(item.id) if change and item.id != value

	def search
		imba.commit!
		window.requestAnimationFrame do align!

	<self .open=open .above=above>
		if open
			<global @click.outside=close @keydown.esc=close @resize=align>
		<button.trigger type="button" disabled=disabled @click.stop=toggle aria-haspopup="listbox" aria-expanded=open>
			<span dir=(selected.ltr ? 'ltr' : null)> t(selected.label)
			<outpost-icon name="caret-down">
		if open
			<div.menu role="listbox" ease>
				if searchable
					<label.search>
						<outpost-icon name="magnifying-glass">
						<input type="search" bind=query @input=search dir="auto" placeholder=t(placeholder) aria-label=t(placeholder) @click.stop>
				<div.options>
					if visible.length
						for item in visible
							<button.option type="button" role="option" aria-selected=(item.id == value) .active=(item.id == value) @click.stop=(do choose(item))>
								<span dir=(item.ltr ? 'ltr' : null)> t(item.label)
								if item.id == value
									<outpost-icon name="check">
					else
						<p.empty> t('Ничего не найдено')

	css self
		d:block pos:relative miw:0
		&.open zi:90
		.trigger w:100% h:42px d:grid gtc:minmax(0, 1fr) 14px ai:center g:8px p:0 12px bd:1px solid var(--outpost-line) rd:9px bgc:var(--outpost-white) c:var(--outpost-text) ta:left fs:13px fw:550 cur:pointer tween:border-color 150ms ease, box-shadow 150ms ease, background-color 150ms ease
		.trigger bc@hover:var(--outpost-brand) bgc@hover:var(--outpost-soft)
		.trigger@disabled cur:default o:.62
		.trigger@disabled bc@hover:var(--outpost-line) bgc@hover:var(--outpost-white)
		.trigger > span of:hidden text-overflow:ellipsis white-space:nowrap
		.trigger > outpost-icon c:var(--outpost-muted) fs:13px tween:transform 150ms ease
		&.open .trigger bc:var(--outpost-brand) bxs:0 0 0 2px var(--outpost-auth-start)
		&.open .trigger > outpost-icon transform:rotate(180deg)
		.menu pos:absolute t:calc(100% + 6px) l:0 zi:80 w:100% miw:250px p:6px bd:1px solid var(--outpost-line) rd:11px bgc:var(--outpost-white) bxs:0 16px 36px black/15 ease:180ms cubic-bezier(.22,1,.36,1) o@off:0 y@off:-6px scale@off:.98 transform-origin:top left box-sizing:border-box
		&.above .menu t:auto b:calc(100% + 6px) y@off:6px transform-origin:bottom left
		.search h:38px d:grid gtc:18px minmax(0,1fr) ai:center g:7px px:9px mb:5px bd:1px solid var(--outpost-line) rd:8px bgc:var(--outpost-white) c:var(--outpost-muted)
		.search outpost-icon fs:15px
		.search input w:100% miw:0 p:0 bd:0 ol:none bgc:transparent c:var(--outpost-text) fs:12px
		.options mah:244px ofy:auto d:grid g:2px
		.option w:100% mih:38px d:grid gtc:minmax(0,1fr) 16px ai:center g:8px p:7px 9px bd:0 rd:7px bgc:var(--outpost-white) c:var(--outpost-text) ta:left fs:12px cur:pointer
		.option bgc@hover:var(--outpost-soft)
		.option.active bgc:var(--outpost-auth-start) c:var(--outpost-brand)
		.option span of:hidden text-overflow:ellipsis white-space:nowrap
		.option outpost-icon fs:14px
		.empty p:12px 8px c:var(--outpost-muted) fs:11px ta:center

tag outpost-settings
	store = null
	busy = null
	zones = []
	draft = {period: '30d', language: 'en', timezone: 'UTC', channel: 'stable'}

	def mount
		draft = {
			period: store.trafficPeriod
			language: owner.language or 'en'
			timezone: owner.timezone or 'UTC'
			channel: settings.system.updateChannel or 'stable'
		}
		const supported = Intl['supportedValuesOf'] ? Intl['supportedValuesOf']('timeZone') : ['UTC']
		const values = [draft.timezone]
		for value in supported when value != draft.timezone
			values.push(value)
		zones = values.map do(value) {id: value, label: clock.label(value), ltr: true}
		imba.commit!

	get owner do store.data.auth.owner
	get settings do store.data.settings or {interface: {}, system: {}}
	get update
		const value = store.data.system.updates or {status: 'idle', available: false, current: store.data.system.version}
		return {...value, status: 'current', available: false, ready: false, latest: value.current} if preview == 'current'
		value
	get tls do store.data.system.tls
	get operation do (store.data.operations or []).find do(item) item.kind == 'update.apply'
	get applying? do operation and ['queued', 'running'].includes(operation.status)
	get outcome? do operation and ['completed', 'failed'].includes(operation.status) and (!update.checkedAt or operation.updated_at >= update.checkedAt)
	get failed? do outcome? and operation.status == 'failed'
	get completed? do outcome? and operation.status == 'completed'
	get preparing? do busy == 'update' or update.status == 'preparing'
	get working? do preparing? or applying?
	get rulesets do store.data.system.rulesets or {status: 'idle', activeVersion: null, checkedAt: null, lastError: null}
	get catalog
		return t('settings.rulesets.version', {version: rulesets.activeVersion}) if rulesets.activeVersion
		t('settings.rulesets.missing')
	get detail
		return rulesets.lastError if rulesets.lastError
		return t('settings.rulesets.never') unless rulesets.checkedAt
		t('settings.rulesets.checked', {date: new Intl.DateTimeFormat(intl!, {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(rulesets.checkedAt))})

	get summary
		return t(operation.message) if applying? and operation.message and operation.message.startsWith('operation.update_')
		return t('settings.update.installing', {version: update.latest}) if applying?
		return t('settings.update.preparing') if preparing?
		return update.error if update.status == 'failed' and update.error
		return operation.error or t('settings.update.failed') if failed?
		return t('settings.update.completed') if completed?
		return t('settings.update.available', {version: update.latest}) if update.available
		return t('settings.update.current') if update.status == 'current'
		t('settings.update.unchecked')
	get install do "{t('settings.update.install')} {update.latest}"

	def expiry
		return tls.error or t('Не удалось проверить сертификат') unless tls.expiresAt
		t('settings.certificate.until', {date: new Intl.DateTimeFormat(intl!, {day: 'numeric', month: 'long', year: 'numeric'}).format(new Date(tls.expiresAt))})

	def upgrade
		return unless update.available
		busy = 'update'
		store.error = null
		store.data.system.updates = {...update, status: 'preparing', ready: false, error: null}
		try
			const prepared = await store.api('POST', '/api/v1/updates/prepare')
			store.data.system.updates = prepared
			store.selected = {payload: prepared.payload, notes: prepared.notes or []}
			store.confirmation = await store.api('POST', '/api/v1/operations/preview', {action: 'update.apply', payload: prepared.payload})
			store.open('confirm')
		catch issue
			store.data.system.updates = {...update, status: 'failed', ready: false, error: issue.message}
		finally
			busy = null
			imba.commit!

	def check
		busy = 'check'
		try
			store.data.system.updates = await store.api('POST', '/api/v1/updates/check')
		finally
			busy = null
			imba.commit!

	def sync
		busy = 'rulesets'
		store.error = null
		try
			store.data.system.rulesets = await store.api('POST', '/api/v1/rulesets/refresh')
		catch issue
			store.error = issue.message
		finally
			busy = null
			imba.commit!

	def backup
		store.open('backup')

	def period value
		draft.period = value
		busy = 'period'
		try
			await store.period(value)
		finally
			busy = null
			imba.commit!

	def language value
		const previous = currentLanguage!
		draft.language = value
		setLanguage(value)
		store.title!
		busy = 'language'
		try
			await store.mutate('PATCH', '/api/v1/me', {language: value})
		catch issue
			setLanguage(previous)
			draft.language = previous
			throw issue
		finally
			busy = null
			imba.commit!

	def timezone value
		draft.timezone = value
		busy = 'timezone'
		try
			await store.mutate('PATCH', '/api/v1/me', {timezone: value})
		finally
			busy = null
			imba.commit!

	def channel value
		draft.channel = value
		busy = 'channel'
		try
			await store.mutate('PATCH', '/api/v1/settings', {system: {updateChannel: value}})
		finally
			busy = null
			imba.commit!

	<self>
		<header.settings-header>
			<small> t('Параметры')
			<h1> t('Настройки панели')
			<p> t('Подключение, интерфейс и обслуживание')
		<div.settings-layout>
			<section.outpost-card.system-strip>
				<div.system-item.certificate .warning=(tls.status != 'valid')>
					<span.system-mark><outpost-icon name=(tls.status == 'valid' ? 'shield-check' : 'shield-warning')>
					<div.system-copy>
						<small> t('TLS-сертификат')
						<strong> tls.status == 'valid' ? t('Действителен') : t('Требуется внимание')
						<span> expiry!
				<div.system-item.address>
					<span.system-mark><outpost-icon name="globe-simple">
					<div.system-copy>
						<small> t('Адрес панели')
						<div.system-value>
							<strong title=store.data.system.domain> store.data.system.domain
						<span> "IPv4 {store.data.system.address or '—'} · HTTPS · TCP 443"
				<div.system-item.version>
					<span.system-mark>
						<outpost-icon name="squares-four">
						if update.available
							<span.notice aria-hidden="true">
					<div.system-copy>
						<small> t('Версия панели')
						<div.system-value>
							<strong> store.data.system.version
							unless update.available or working?
								<button.system-action type="button" disabled=busy @click=check>
									<outpost-icon name="arrows-clockwise" .checking=(busy == 'check')>
									<span> t('settings.update.check')
						if update.available and !working?
							<button.system-action.install type="button" disabled=busy @click=upgrade aria-label=install title=install>
								<span> install
						else
							<span> summary
			<div.content-grid>
				<section.outpost-card.settings-card>
					<h2> t('Параметры интерфейса')
					<div.setting-row>
						<span.setting-mark><outpost-icon name="chart-line-up">
						<div.setting-copy>
							<strong> t('Период по умолчанию')
							<small> t('Используется при открытии данных о трафике')
						<outpost-settings-select value=draft.period items=trafficPeriods disabled=busy change=(do(value) period(value))>
					<div.setting-row>
						<span.setting-mark><outpost-icon name="translate">
						<div.setting-copy>
							<strong> t('Язык интерфейса')
							<small> t('Язык панели управления')
						<outpost-settings-select value=draft.language items=languages disabled=busy change=(do(value) language(value))>
					<div.setting-row>
						<span.setting-mark><outpost-icon name="clock">
						<div.setting-copy>
							<strong> t('Часовой пояс')
							<small> t('Время в журнале и календарных периодах')
						<outpost-settings-select value=draft.timezone items=zones searchable=true disabled=busy placeholder=t('Найти город или UTC') change=(do(value) timezone(value))>
					<div.setting-row>
						<span.setting-mark><outpost-icon name="arrows-clockwise">
						<div.setting-copy>
							<strong> t('settings.update.channel')
							<small> t('settings.update.channel_hint')
						<outpost-settings-select value=draft.channel items=channels disabled=busy change=(do(value) channel(value))>
					<div.setting-row.rulesets-row>
						<span.setting-mark><outpost-icon name="database">
						<div.setting-copy>
							<strong> t('settings.rulesets.title')
							<small> t('settings.rulesets.hint')
						<div.ruleset-control>
							<div.ruleset-status>
								<strong> catalog
								<small .error=!!rulesets.lastError> detail
							<button.outpost-button.small type="button" disabled=busy @click=sync aria-label=t('settings.rulesets.refresh')>
								<outpost-icon name="arrows-clockwise" .checking=(busy == 'rulesets')>
								if busy == 'rulesets'
									<span> t('settings.rulesets.updating')
								else
									<span> t('settings.rulesets.refresh')
					<p.autosave>
						<outpost-icon name="check-circle">
						<span> t('Изменения сохраняются автоматически')
				<section.outpost-card.transfer-card>
					<header>
						<span.transfer-mark><outpost-icon name="cloud-arrow-up">
						<div.transfer-copy>
							<h2> t('Перенос данных')
							<small> t('backup.card.subtitle')
					<button.outpost-button.small type="button" @click=backup>
						<outpost-icon name="download-simple">
						<span> t('backup.action')
					<section.transfer-guide>
						<h3> t('transfer.title')
						<ol.transfer-steps>
							<li>
								<span> '1'
								<div.step-copy>
									<strong> t('transfer.step.install')
									<small> t('transfer.step.install_hint')
							<li>
								<span> '2'
								<div.step-copy>
									<strong> t('transfer.step.domain')
									<small.domain-hint>
										<span> t('transfer.step.domain_hint_before')
										<button.dns-record type="button" aria-label=t('transfer.address_value', {domain: store.data.system.domain})>
											<span> t('transfer.address')
											<span.address-tooltip.technical role="tooltip"> store.data.system.domain
										<span> t('transfer.step.domain_hint_after')
							<li>
								<span> '3'
								<div.step-copy>
									<strong> t('transfer.step.restore')
									<small> t('transfer.step.restore_hint')
						<div.transfer-result>
							<outpost-icon name="check-circle">
							<span> t('transfer.links')

	css self
		maw:1100px mx:auto c:var(--outpost-text)
		.settings-header small d:block mb:14px c:var(--outpost-brand) fs:12px fw:750 ls:.1em tt:uppercase
		.settings-header h1 c:var(--outpost-navy) fs:36px lh:1.2 ls:-.02em
		.settings-header p mt:12px c:var(--outpost-muted) fs:18px
		.settings-layout d:grid g:18px mt:24px
		.system-strip d:grid gtc:minmax(0,.75fr) minmax(0,1.4fr) minmax(260px,.85fr) px:18px
		.system-item mih:112px d:grid gtc:42px minmax(0,1fr) ai:center g:13px px:18px
		.system-item + .system-item border-left:1px solid var(--outpost-line)
		.system-item.address px:26px
		.system-mark s:42px d:grid ja:center rd:10px bgc:var(--outpost-success-soft) c:var(--outpost-success) fs:20px
		.system-item.warning .system-mark bgc:color-mix(in srgb, var(--outpost-warning) 10%, var(--outpost-white)) c:var(--outpost-warning)
		.system-item.address .system-mark, .system-item.version .system-mark bgc:var(--outpost-auth-start) c:var(--outpost-brand)
		.version .system-mark pos:relative
		.version .system-mark .notice pos:absolute t:-3px r:-3px s:10px rd:full bd:2px solid var(--outpost-white) bgc:var(--outpost-danger)
		.system-copy miw:0
		.system-copy > small, .system-copy > strong, .system-copy > span d:block
		.system-copy > small c:var(--outpost-muted) fs:10px
		.system-copy > strong mt:3px c:var(--outpost-navy) fs:14px fw:700
		.system-copy > span mt:3px c:var(--outpost-muted) fs:11px lh:1.35 of:hidden text-overflow:ellipsis white-space:nowrap
		.certificate .system-copy > strong c:var(--outpost-success)
		.warning .system-copy > strong c:var(--outpost-warning)
		.system-value miw:0 d:flex ai:center g:7px mt:3px
		.system-value strong miw:0 of:hidden text-overflow:ellipsis white-space:nowrap c:var(--outpost-navy) fs:15px fw:700
		.address .system-value strong c:var(--outpost-brand)
		.system-action fl:0 0 auto d:inline-flex ai:center g:5px p:1px 0 bd:0 bgc:transparent c:var(--outpost-brand) fs:11px fw:650 lh:1.2 white-space:nowrap
		.system-action c@hover:var(--outpost-brand-dark)
		.system-action@hover span td:underline
		.system-action outpost-icon s:12px d:inline-grid ja:center fs:12px
		.system-action outpost-icon.checking animation:spin 1s linear infinite
		.system-copy > .install mt:3px
		.content-grid d:grid gtc:minmax(0,2.15fr) minmax(260px,.85fr) ai:stretch g:18px
		.settings-card px:24px
		.settings-card > h2 pt:22px pb:14px c:var(--outpost-navy) fs:17px fw:750
		.setting-row mih:88px d:grid gtc:44px minmax(0,1fr) minmax(230px,300px) ai:center g:16px border-top:1px solid var(--outpost-line)
		.setting-mark s:42px d:grid ja:center rd:11px bgc:var(--outpost-auth-start) c:var(--outpost-brand) fs:20px
		.setting-copy strong, .setting-copy small d:block
		.setting-copy strong fs:14px fw:700
		.setting-copy small mt:4px c:var(--outpost-muted) fs:11px lh:1.4
		.ruleset-control miw:230px d:grid gtc:minmax(0,1fr) auto ai:center g:12px
		.ruleset-status miw:0
		.ruleset-status strong, .ruleset-status small d:block
		.ruleset-status strong c:var(--outpost-navy) fs:12px fw:700 of:hidden text-overflow:ellipsis white-space:nowrap
		.ruleset-status small mt:3px c:var(--outpost-muted) fs:10px lh:1.35 of:hidden text-overflow:ellipsis white-space:nowrap
		.ruleset-status small.error c:var(--outpost-danger)
		.ruleset-control .outpost-button h:38px px:12px white-space:nowrap
		.ruleset-control outpost-icon.checking animation:spin 1s linear infinite
		.autosave d:flex ai:center g:7px mih:46px border-top:1px solid var(--outpost-line) c:var(--outpost-muted) fs:11px
		.autosave outpost-icon c:var(--outpost-success) fs:15px
		.transfer-card d:flex fld:column p:24px bgc:color-mix(in srgb, var(--outpost-success) 3%, var(--outpost-white))
		.transfer-card header d:grid gtc:42px minmax(0,1fr) ai:start g:13px
		.transfer-card h2 c:var(--outpost-navy) fs:17px fw:750
		.transfer-mark s:42px d:grid ja:center rd:10px bgc:var(--outpost-success-soft) c:var(--outpost-success) fs:20px
		.transfer-copy small d:block mt:4px c:var(--outpost-muted) fs:10px lh:1.4
		.transfer-card > .outpost-button w:100% h:40px mt:16px px:12px fs:12px
		.transfer-guide fl:1 d:flex fld:column mt:18px pt:16px border-top:1px solid var(--outpost-line)
		.transfer-guide h3 c:var(--outpost-navy) fs:13px fw:750 lh:1.4
		.transfer-steps d:grid g:0 mt:7px p:0 list-style:none
		.transfer-steps li d:grid gtc:26px minmax(0,1fr) ai:start g:9px py:8px border-bottom:1px solid var(--outpost-line)
		.transfer-steps li@last-child border-bottom:0
		.transfer-steps li > span s:26px d:grid ja:center rd:full bgc:var(--outpost-auth-start) c:var(--outpost-brand) fs:10px fw:750
		.step-copy miw:0 pt:1px
		.step-copy > strong, .step-copy > small d:block
		.step-copy > strong c:var(--outpost-text) fs:11px fw:700 lh:1.35
		.step-copy > small mt:3px c:var(--outpost-muted) fs:9px fw:500 lh:1.4
		.step-copy > small.domain-hint d:block
		.dns-record pos:relative d:inline-flex mx:3px p:0 bd:0 border-bottom:1px dotted var(--outpost-brand) bgc:transparent c:var(--outpost-brand) ff:inherit fs:inherit fw:inherit lh:inherit cur:help
		.dns-record@hover c:var(--outpost-brand-dark)
		.dns-record@focus-visible ol:2px solid var(--outpost-brand-soft) olo:2px rd:3px
		.address-tooltip pos:absolute b:calc(100% + 7px) l:0 zi:10 w:max-content maw:220px p:6px 8px rd:6px bgc:var(--outpost-navy) c:white fs:9px fw:600 lh:1.3 white-space:normal overflow-wrap:anywhere o:0 pe:none transform:translateY(3px) tween:opacity 140ms ease, transform 140ms ease
		.dns-record@hover .address-tooltip, .dns-record@focus-visible .address-tooltip o:1 transform:translateY(0)
		.transfer-result d:grid gtc:24px minmax(0,1fr) ai:center g:8px mt:auto p:10px rd:9px bgc:var(--outpost-success-soft) c:var(--outpost-text) fs:10px fw:650 lh:1.4
		.transfer-result outpost-icon s:24px d:grid ja:center rd:full bgc:white c:var(--outpost-success) fs:15px
		@media(max-width: 1280px)
			.system-strip gtc:1fr px:18px
			.system-item px:0
			.system-item + .system-item border-left:0 border-top:1px solid var(--outpost-line)
			.content-grid gtc:1fr
		@media(max-width: 900px)
			.content-grid gtc:minmax(0,2.15fr) minmax(260px,.85fr)
		@media(max-width: 820px)
			.system-strip gtc:1fr px:18px
			.system-item px:0
			.system-item + .system-item border-left:0 border-top:1px solid var(--outpost-line)
			.content-grid gtc:1fr
		@media(max-width: 680px)
			.settings-header h1 fs:31px
			.settings-header p fs:16px
			.settings-card px:18px
			.setting-row gtc:42px minmax(0,1fr); py:16px
			.setting-row outpost-settings-select, .ruleset-control grid-column:2
			.ruleset-control miw:0
			.transfer-card p:20px 18px
