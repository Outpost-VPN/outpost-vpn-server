import {trafficPeriods} from './context.imba'

const languages = [
	{id: 'ru', label: 'Русский'}
]

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

tag outpost-settings-select
	value = ''
	items = []
	change = null
	searchable = false
	disabled = false
	open = false
	query = ''
	placeholder = 'Найти'

	get selected
		items.find(do(item) item.id == value) or items[0] or {id: '', label: '—'}

	get visible
		const term = query.trim!.toLowerCase!
		return items unless term
		items.filter do(item) "{item.label} {item.id}".toLowerCase!.includes(term)

	def toggle
		return if disabled
		open = !open
		query = ''
		if open and searchable
			window.requestAnimationFrame do
				const input = self.querySelector('.search input')
				input.focus! if input

	def close
		open = false
		query = ''

	def choose item
		close!
		change(item.id) if change and item.id != value

	def search
		imba.commit!

	<self .open=open>
		if open
			<global @click.outside=close @keydown.esc=close>
		<button.trigger type="button" disabled=disabled @click.stop=toggle aria-haspopup="listbox" aria-expanded=open>
			<span> selected.label
			<outpost-icon name="caret-down">
		if open
			<div.menu role="listbox" ease>
				if searchable
					<label.search>
						<outpost-icon name="magnifying-glass">
						<input type="search" bind=query @input=search placeholder=placeholder aria-label=placeholder @click.stop>
				<div.options>
					if visible.length
						for item in visible
							<button.option type="button" role="option" aria-selected=(item.id == value) .active=(item.id == value) @click.stop=(do choose(item))>
								<span> item.label
								if item.id == value
									<outpost-icon name="check">
					else
						<p.empty> 'Ничего не найдено'

	css self
		d:block pos:relative miw:0
		.trigger w:100% h:42px d:grid gtc:minmax(0, 1fr) 14px ai:center g:8px p:0 12px bd:1px solid var(--outpost-line) rd:9px bgc:var(--outpost-white) c:var(--outpost-text) ta:left fs:13px fw:550 cur:pointer tween:border-color 150ms ease, box-shadow 150ms ease, background-color 150ms ease
		.trigger bc@hover:var(--outpost-brand) bgc@hover:var(--outpost-soft)
		.trigger@disabled cur:default o:.62
		.trigger@disabled bc@hover:var(--outpost-line) bgc@hover:var(--outpost-white)
		.trigger > span of:hidden text-overflow:ellipsis white-space:nowrap
		.trigger > outpost-icon c:var(--outpost-muted) fs:13px tween:transform 150ms ease
		&.open .trigger bc:var(--outpost-brand) bxs:0 0 0 2px var(--outpost-auth-start)
		&.open .trigger > outpost-icon transform:rotate(180deg)
		.menu pos:absolute t:calc(100% + 6px) l:0 zi:80 w:100% miw:250px p:6px bd:1px solid var(--outpost-line) rd:11px bgc:var(--outpost-white) bxs:0 16px 36px black/15 ease:180ms cubic-bezier(.22,1,.36,1) o@off:0 y@off:-6px scale@off:.98 transform-origin:top left box-sizing:border-box
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
	draft = {period: '30d', language: 'ru', timezone: 'UTC'}

	def mount
		draft = {
			period: store.trafficPeriod
			language: settings.interface.language or 'ru'
			timezone: owner.timezone or 'UTC'
		}
		const supported = Intl['supportedValuesOf'] ? Intl['supportedValuesOf']('timeZone') : ['UTC']
		const values = [draft.timezone]
		for value in supported when value != draft.timezone
			values.push(value)
		zones = values.map do(value) {id: value, label: clock.label(value)}
		imba.commit!

	get owner do store.data.auth.owner
	get settings do store.data.settings or {interface: {}, system: {}}
	get update do store.data.system.updates or {available: false, current: store.data.system.version}
	get tls do store.data.system.tls

	def expiry
		return tls.error or 'Не удалось проверить сертификат' unless tls.expiresAt
		"До {new Intl.DateTimeFormat('ru-RU', {day: 'numeric', month: 'long', year: 'numeric'}).format(new Date(tls.expiresAt)).replace(/\s*г\.$/, '')}"

	def upgrade
		return unless update.available
		const bundle = "/var/lib/outpost/incoming/outpost-{update.latest}-linux-amd64.tar.gz"
		const payload = {version: update.latest, bundle: bundle, signature: "{bundle}.minisig"}
		store.selected = {payload: payload}
		store.confirmation = await store.api('POST', '/api/v1/operations/preview', {action: 'update.apply', payload: payload})
		store.open('confirm')

	def backup
		store.open('backup')

	def restore
		store.open('restore')

	def period value
		draft.period = value
		busy = 'period'
		try
			await store.period(value)
		finally
			busy = null
			imba.commit!

	def language value
		draft.language = value
		busy = 'language'
		try
			const next = {...settings.interface, language: value}
			await store.mutate('PATCH', '/api/v1/settings', {interface: next})
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

	<self>
		<header.settings-header>
			<small> 'Параметры'
			<h1> 'Настройки панели'
			<p> 'Подключение, интерфейс и обслуживание'
		<div.settings-layout>
			<section.outpost-card.system-strip>
				<div.system-item.certificate .warning=(tls.status != 'valid')>
					<span.system-mark><outpost-icon name=(tls.status == 'valid' ? 'shield-check' : 'shield-warning')>
					<div.system-copy>
						<small> 'TLS-сертификат'
						<strong> tls.status == 'valid' ? 'Действителен' : 'Требуется внимание'
						<span> expiry!
				<div.system-item.address>
					<span.system-mark><outpost-icon name="globe-simple">
					<div.system-copy>
						<small> 'Адрес панели'
						<div.system-value>
							<strong title=store.data.system.domain> store.data.system.domain
						<span> "IPv4 {store.data.system.address or '—'} · HTTPS · TCP 443"
				<div.system-item.version>
					<span.system-mark><outpost-icon name="squares-four">
					<div.system-copy>
						<small> 'Версия панели'
						<div.system-value>
							<strong> store.data.system.version
							if update.available
								<button.system-action type="button" @click=upgrade aria-label="Обновить до {update.latest}" title="Обновить до {update.latest}"> 'Обновить'
						<span> update.available ? "Доступна версия {update.latest}" : 'Установлена актуальная версия'
			<div.content-grid>
				<section.outpost-card.settings-card>
					<h2> 'Параметры интерфейса'
					<div.setting-row>
						<span.setting-mark><outpost-icon name="chart-line-up">
						<div.setting-copy>
							<strong> 'Период по умолчанию'
							<small> 'Используется при открытии данных о трафике'
						<outpost-settings-select value=draft.period items=trafficPeriods disabled=busy change=(do(value) period(value))>
					<div.setting-row>
						<span.setting-mark><outpost-icon name="translate">
						<div.setting-copy>
							<strong> 'Язык интерфейса'
							<small> 'Язык панели управления'
						<outpost-settings-select value=draft.language items=languages disabled=busy change=(do(value) language(value))>
					<div.setting-row>
						<span.setting-mark><outpost-icon name="clock">
						<div.setting-copy>
							<strong> 'Часовой пояс'
							<small> 'Время в журнале и календарных периодах'
						<outpost-settings-select value=draft.timezone items=zones searchable=true disabled=busy placeholder="Найти город или UTC" change=(do(value) timezone(value))>
					<p.autosave>
						<outpost-icon name="check-circle">
						<span> 'Изменения сохраняются автоматически'
				<section.outpost-card.transfer-card>
					<header>
						<span.transfer-mark><outpost-icon name="cloud-arrow-up">
						<h2> 'Перенос данных'
					<p> 'Выгрузите резервную копию или восстановите панель из сохранённых данных.'
					<div.transfer-actions>
						<button.outpost-button.secondary.small type="button" @click=backup>
							<outpost-icon name="download-simple">
							<span> 'Выгрузить данные'
						<button.outpost-button.secondary.small type="button" @click=restore>
							<outpost-icon name="upload-simple">
							<span> 'Загрузить данные'
					<p.transfer-note>
						<outpost-icon name="info">
						<span> 'Рекомендуется регулярное резервное копирование.'

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
		.system-action fl:0 0 auto p:1px 0 bd:0 bgc:transparent c:var(--outpost-brand) fs:11px fw:650 lh:1.2 white-space:nowrap
		.system-action c@hover:var(--outpost-brand-dark) td@hover:underline
		.content-grid d:grid gtc:minmax(0,2.15fr) minmax(260px,.85fr) ai:stretch g:18px
		.settings-card px:24px of:hidden
		.settings-card > h2 pt:22px pb:14px c:var(--outpost-navy) fs:17px fw:750
		.setting-row mih:88px d:grid gtc:44px minmax(0,1fr) minmax(230px,300px) ai:center g:16px border-top:1px solid var(--outpost-line)
		.setting-mark s:42px d:grid ja:center rd:11px bgc:var(--outpost-auth-start) c:var(--outpost-brand) fs:20px
		.setting-copy strong, .setting-copy small d:block
		.setting-copy strong fs:14px fw:700
		.setting-copy small mt:4px c:var(--outpost-muted) fs:11px lh:1.4
		.autosave d:flex ai:center g:7px mih:46px border-top:1px solid var(--outpost-line) c:var(--outpost-muted) fs:11px
		.autosave outpost-icon c:var(--outpost-success) fs:15px
		.transfer-card d:flex fld:column p:24px bgc:color-mix(in srgb, var(--outpost-success) 3%, var(--outpost-white))
		.transfer-card header d:grid gtc:42px minmax(0,1fr) ai:center g:13px
		.transfer-card h2 c:var(--outpost-navy) fs:17px fw:750
		.transfer-mark s:42px d:grid ja:center rd:10px bgc:var(--outpost-success-soft) c:var(--outpost-success) fs:20px
		.transfer-card > p mt:22px c:var(--outpost-muted) fs:12px lh:1.55
		.transfer-actions d:grid g:10px mt:24px
		.transfer-actions .outpost-button w:100% h:40px px:12px fs:12px
		.transfer-note d:grid gtc:16px minmax(0,1fr) ai:start g:8px mt:auto pt:24px c:var(--outpost-muted) fs:10px lh:1.45
		.transfer-note outpost-icon mt:1px fs:14px
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
			.setting-row outpost-settings-select grid-column:2
			.transfer-card p:20px 18px
