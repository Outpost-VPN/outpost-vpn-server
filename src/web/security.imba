import {avatarUrl} from './avatar-picker.imba'

const authn = {
	decode: do(options)
		const copy = {...options}
		copy.challenge = decode(copy.challenge)
		if copy.user
			copy.user = {...copy.user, id: decode(copy.user.id)}
		if copy.excludeCredentials
			copy.excludeCredentials = copy.excludeCredentials.map(do(item) {...item, id: decode(item.id)})
		copy
	json: do(credential)
		const response = credential.response
		{
			id: credential.id
			rawId: encode(credential.rawId)
			type: credential.type
			clientExtensionResults: credential.getClientExtensionResults!
			authenticatorAttachment: credential.authenticatorAttachment
			response: {
				clientDataJSON: encode(response.clientDataJSON)
				attestationObject: encode(response.attestationObject)
				transports: response.getTransports ? response.getTransports! : []
			}
		}
}

const calendar = do(value)
	new Intl.DateTimeFormat('ru-RU', {day: 'numeric', month: 'long', year: 'numeric'}).format(value)

const periods = [
	{id: 'today', label: 'Сегодня'}
	{id: '24h', label: 'Последние 24 часа'}
	{id: 'week', label: 'Текущая неделя'}
	{id: '7d', label: 'Последние 7 дней'}
	{id: 'month', label: 'Текущий месяц'}
	{id: '30d', label: 'Последние 30 дней'}
	{id: 'year', label: 'Текущий год'}
	{id: '365d', label: 'Последние 365 дней'}
]

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

tag matreshka-profile-select
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
			<matreshka-icon name="caret-down">
		if open
			<div.menu role="listbox" ease>
				if searchable
					<label.search>
						<matreshka-icon name="magnifying-glass">
						<input type="search" bind=query @input=search placeholder=placeholder aria-label=placeholder @click.stop>
				<div.options>
					if visible.length
						for item in visible
							<button.option type="button" role="option" aria-selected=(item.id == value) .active=(item.id == value) @click.stop=(do choose(item))>
								<span> item.label
								if item.id == value
									<matreshka-icon name="check">
					else
						<p.empty> 'Ничего не найдено'

	css self
		d:block pos:relative miw:0
		.trigger w:100% h:38px d:grid gtc:minmax(0, 1fr) 14px ai:center g:8px p:0 10px bd:1px solid var(--matreshka-line) rd:8px bgc:var(--matreshka-white) c:var(--matreshka-text) ta:left fs:12px fw:550 cur:pointer tween:border-color 150ms ease, box-shadow 150ms ease, background-color 150ms ease
		.trigger bd-c@hover:var(--matreshka-brand) bgc@hover:var(--matreshka-soft)
		.trigger@disabled cur:default o:.62
		.trigger@disabled bd-c@hover:var(--matreshka-line) bgc@hover:var(--matreshka-white)
		.trigger > span of:hidden text-overflow:ellipsis white-space:nowrap
		.trigger > matreshka-icon c:var(--matreshka-muted) fs:13px tween:transform 150ms ease
		&.open .trigger bd-c:var(--matreshka-brand) bxs:0 0 0 2px var(--matreshka-auth-start)
		&.open .trigger > matreshka-icon transform:rotate(180deg)
		.menu pos:absolute t:calc(100% + 6px) l:0 zi:80 w:100% miw:250px p:6px bd:1px solid var(--matreshka-line) rd:11px bgc:var(--matreshka-white) bxs:0 16px 36px black/15 ease:180ms cubic-bezier(.22,1,.36,1) o@off:0 y@off:-6px scale@off:.98 transform-origin:top left box-sizing:border-box
		.search h:38px d:grid gtc:18px minmax(0,1fr) ai:center g:7px px:9px mb:5px bd:1px solid var(--matreshka-line) rd:8px bgc:var(--matreshka-white) c:var(--matreshka-muted)
		.search matreshka-icon fs:15px
		.search input w:100% miw:0 p:0 bd:0 ol:none bgc:transparent c:var(--matreshka-text) fs:12px
		.options mah:244px ofy:auto d:grid g:2px
		.option w:100% mih:38px d:grid gtc:minmax(0,1fr) 16px ai:center g:8px p:7px 9px bd:0 rd:7px bgc:var(--matreshka-white) c:var(--matreshka-text) ta:left fs:12px cur:pointer
		.option bgc@hover:var(--matreshka-soft)
		.option.active bgc:var(--matreshka-auth-start) c:var(--matreshka-brand)
		.option span of:hidden text-overflow:ellipsis white-space:nowrap
		.option matreshka-icon fs:14px
		.empty p:12px 8px c:var(--matreshka-muted) fs:11px ta:center

tag matreshka-profile
	store = null
	busy = null
	notice = null
	editing = false
	chooser = false
	dismissed = []
	zones = []
	form = {name: '', period: '30d', language: 'ru', timezone: 'Europe/Moscow'}

	def mount
		form = {
			name: owner.name
			period: store.trafficPeriod
			language: settings.interface.language or 'ru'
			timezone: owner.timezone or 'Europe/Moscow'
		}
		const supported = Intl['supportedValuesOf'] ? Intl['supportedValuesOf']('timeZone') : ['UTC', 'Europe/Moscow']
		const values = [form.timezone]
		for value in supported when value != form.timezone
			values.push(value)
		zones = values.map do(value) {id: value, label: clock.label(value)}
		store.secure!

	get owner do store.data.auth.owner
	get settings do store.data.settings or {interface: {}, system: {}}
	get current do settings.interface.ownerAvatar or 'avatar-current'
	get raw do store.security or {passkeys: [], sessions: [], tokens: []}

	get passkeys
		const items = if raw.passkeys.length or !store.data.auth.demo then raw.passkeys else [
			{id: 'demo-touch', label: 'MacBook Pro', browser: 'Safari', backedUp: true, createdAt: new Date(Date.now! - 5 * 86400000).toISOString!, lastUsedAt: new Date(Date.now! - 38 * 60000).toISOString!, demo: true}
			{id: 'demo-phone', label: 'iPhone', browser: 'iOS', backedUp: true, createdAt: new Date(Date.now! - 14 * 86400000).toISOString!, lastUsedAt: new Date(Date.now! - 12 * 3600000).toISOString!, demo: true}
		]
		items.filter do(item) !dismissed.includes(item.id)

	get sessions
		const items = if raw.sessions.length or !store.data.auth.demo then raw.sessions else [
			{id: 'demo-current', current: true, userAgent: 'Safari Mac', createdAt: new Date(Date.now! - 12 * 86400000).toISOString!, lastSeenAt: new Date!.toISOString!, demo: true}
			{id: 'demo-phone-session', current: false, userAgent: 'Safari iPhone', createdAt: new Date(Date.now! - 9 * 86400000).toISOString!, lastSeenAt: new Date(Date.now! - 12 * 3600000).toISOString!, demo: true}
			{id: 'demo-tablet-session', current: false, userAgent: 'Safari iPad', createdAt: new Date(Date.now! - 7 * 86400000).toISOString!, lastSeenAt: new Date(Date.now! - 31 * 3600000).toISOString!, demo: true}
		]
		items.filter do(item) !dismissed.includes(item.id)

	get tokens
		const items = if raw.tokens.length or !store.data.auth.demo then raw.tokens else [
			{id: 'demo-codex-8K2F', name: 'Codex MCP', scopes: ['status:read', 'people:read', 'routes:write'], created_at: new Date(Date.now! - 10 * 86400000).toISOString!, last_used_at: new Date(Date.now! - 2 * 3600000).toISOString!, demo: true}
			{id: 'demo-monitor-3M7A', name: 'Мониторинг', scopes: ['status:read', 'traffic:read'], created_at: new Date(Date.now! - 18 * 86400000).toISOString!, last_used_at: new Date(Date.now! - 26 * 3600000).toISOString!, demo: true}
		]
		items.filter do(item) !dismissed.includes(item.id)

	def avatar value = current
		avatarUrl(value)

	def stamp value
		return 'никогда' unless value
		const date = new Date(value)
		const today = new Date
		const time = new Intl.DateTimeFormat('ru-RU', {hour: '2-digit', minute: '2-digit'}).format(date)
		return "сегодня, {time}" if date.toDateString! == today.toDateString!
		const yesterday = new Date(today.getTime! - 86400000)
		return "вчера, {time}" if date.toDateString! == yesterday.toDateString!
		new Intl.DateTimeFormat('ru-RU', {day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'}).format(date)

	def credential item
		const name = item.label or (item.backedUp ? 'Связка ключей' : 'Passkey')
		const platform = item.browser or (item.deviceType == 'multiDevice' ? 'Синхронизирован' : 'Это устройство')
		{name: name, detail: "{platform} · добавлен {calendar(new Date(item.createdAt))}"}

	def client item
		const source = item.userAgent or ''
		const name = source.includes('iPad') ? 'iPad' : source.includes('iPhone') ? 'iPhone' : source.includes('Android') ? 'Android' : source.includes('Windows') ? 'Windows' : 'Этот Mac'
		const browser = source.includes('Firefox') ? 'Firefox' : source.includes('Chrome') ? 'Chrome' : 'Safari'
		{name: name, detail: "{browser} · {stamp(item.lastSeenAt)}"}

	def device item
		const source = "{item.label or ''} {item.browser or ''} {item.userAgent or ''}".toLowerCase!
		return 'tablet' if source.includes('ipad') or source.includes('tablet')
		return 'phone' if source.includes('iphone') or source.includes('android') or source.includes('mobile')
		return 'computer' if source.includes('mac') or source.includes('windows') or source.includes('linux') or source.includes('laptop')
		'other'

	def scope item
		item.scopes.some(do(value) value.endsWith(':write')) ? 'Управление' : 'Только чтение'

	def mask item
		const suffix = item.id.slice(-4).toUpperCase!
		"matreshka_••••••{suffix}"

	def edit
		form.name = owner.name
		editing = true
		imba.commit!
		window.requestAnimationFrame do
			const input = window.document.querySelector('matreshka-profile .owner-name input')
			input.focus! if input

	def cancel
		form.name = owner.name
		editing = false

	def rename
		return cancel! if !form.name.trim! or form.name.trim! == owner.name
		busy = 'name'
		try
			await store.mutate('PATCH', '/api/v1/me', {name: form.name.trim!})
			editing = false
		finally
			busy = null

	def traffic
		await store.period(form.period)

	def period value
		form.period = value
		traffic!

	def locale
		busy = 'locale'
		try
			const value = {...settings.interface, language: form.language}
			await store.mutate('PATCH', '/api/v1/settings', {interface: value})
		finally
			busy = null

	def language value
		form.language = value
		locale!

	def zone
		busy = 'zone'
		try
			await store.mutate('PATCH', '/api/v1/me', {timezone: form.timezone})
		finally
			busy = null

	def timezone value
		form.timezone = value
		zone!

	def choose value
		return if busy
		chooser = false
		return if value == current
		busy = 'avatar'
		try
			const payload = {...settings.interface, ownerAvatar: value}
			await store.mutate('PATCH', '/api/v1/settings', {interface: payload})
		finally
			busy = null

	def passkey
		return if busy
		busy = 'passkey'
		notice = null
		try
			const start = await store.api('POST', '/api/v1/auth/register/options', {name: owner.name, timezone: owner.timezone})
			const credential = await window.navigator.credentials.create({publicKey: authn.decode(start.options)})
			throw new Error('Создание passkey отменено') unless credential
			await store.api('POST', '/api/v1/auth/register/verify', {challengeId: start.challengeId, response: authn.json(credential)})
			await store.secure!
			notice = {kind: 'passkeys', text: 'Новый passkey добавлен'}
		catch issue
			notice = {kind: 'passkeys', text: issue.message}
		finally
			busy = null
			imba.commit!

	def finish
		return if busy or sessions.length < 2
		busy = 'sessions'
		try
			if store.data.auth.demo
				for item in sessions when !item.current
					dismissed.push(item.id)
			else
				await store.api('DELETE', '/api/v1/sessions')
				await store.secure!
			notice = {kind: 'sessions', text: 'Другие сеансы завершены'}
		finally
			busy = null
			imba.commit!

	def revoke kind, item
		return if busy or item.current or (kind == 'passkeys' and passkeys.length < 2)
		busy = item.id
		try
			if store.data.auth.demo or item.demo
				dismissed.push(item.id)
			else
				const url = kind == 'passkeys' ? "/api/v1/passkeys/{item.id}" : kind == 'sessions' ? "/api/v1/sessions/{item.id}" : "/api/v1/tokens/{item.id}"
				await store.api('DELETE', url)
				await store.secure!
		finally
			busy = null
			imba.commit!

	def logout
		await store.api('POST', '/api/v1/auth/logout', {})
		store.goto('/login')

	<self>
		<header.profile-header>
			<div>
				<small> 'Редактирование профиля'
				<h1> 'Профиль владельца'
				<p> 'Личные настройки, доступ и активные подключения'
			<button.matreshka-button.secondary.small.header-action type="button" @click=logout>
				<matreshka-icon name="sign-out">
				<span> 'Выйти'
		<div.profile-layout>
			<aside.matreshka-card.identity>
				<h2> 'Личные данные'
				<div.portrait>
					<img src=avatar() alt="">
					<button type="button" @click=(chooser = true) aria-label="Изменить аватар"><matreshka-icon name="camera">
				<form.owner-name @submit.prevent=rename>
					<label> 'Имя'
					<div>
						if editing
							<input bind=form.name maxlength="80">
							<button.save type="submit" disabled=(busy or !form.name.trim!) aria-label="Сохранить имя"><matreshka-icon name="check">
							<button type="button" @click=cancel aria-label="Отменить"><matreshka-icon name="x">
						else
							<strong.owner-value> owner.name
							<button type="button" @click=edit aria-label="Изменить имя"><matreshka-icon name="pencil-simple">
				<div.role>
					<span> 'Роль'
					<strong> 'Владелец'
					<small> 'Полный доступ к панели'
				<section.preferences>
					<h2> 'Предпочтения'
					<label> 'Период по умолчанию'
					<matreshka-profile-select value=form.period items=periods disabled=busy change=(do(value) period(value))>
					<label> 'Язык'
					<matreshka-profile-select value=form.language items=languages disabled=busy change=(do(value) language(value))>
					<label> 'Часовой пояс'
					<matreshka-profile-select value=form.timezone items=zones searchable=true disabled=busy placeholder="Найти город или UTC" change=(do(value) timezone(value))>
			<section.access-group>
				<div.subhead>
					<div>
						<h3> 'Passkeys'
						<p> 'Вход без пароля с доверенных устройств'
					<button.matreshka-button.secondary.small type="button" disabled=busy @click=passkey>
						<matreshka-icon name="plus">
						<span> busy == 'passkey' ? 'Добавляем…' : 'Добавить passkey'
				<div.rows>
					for item in passkeys
						<div.access-row key=item.id>
							<matreshka-device-glyph kind=device(item)>
							<div>
								<strong> credential(item).name
								<small> credential(item).detail
							<span.used> "Использован {stamp(item.lastUsedAt)}"
							<button.icon-button type="button" disabled=(busy or passkeys.length < 2) @click=(do revoke('passkeys', item)) aria-label="Отозвать passkey"><matreshka-icon name="trash">
				if notice and notice.kind == 'passkeys'
					<p.notice aria-live="polite"> notice.text
			<section.access-group>
				<div.subhead>
					<div>
						<h3> 'Активные сеансы'
						<p> 'Браузеры, в которых выполнен вход'
					<button.matreshka-button.secondary.small type="button" disabled=(busy or sessions.length < 2) @click=finish> busy == 'sessions' ? 'Завершаем…' : 'Завершить остальные'
				<div.rows>
					for item in sessions
						<div.access-row.session key=item.id>
							<matreshka-device-glyph kind=device(item)>
							<div>
								<strong> client(item).name
								<small> client(item).detail
							if item.current
								<span.current> 'Текущий'
							else
								<span.used> "Активен {stamp(item.lastSeenAt)}"
							<button.icon-button type="button" disabled=(busy or item.current) @click=(do revoke('sessions', item)) aria-label="Завершить сеанс"><matreshka-icon name="sign-out">
				if notice and notice.kind == 'sessions'
					<p.notice aria-live="polite"> notice.text
			<section.access-group.tokens>
				<div.subhead>
					<div>
						<h3> 'API / MCP'
						<p> 'Токены для интеграций и автоматизации'
					<button.matreshka-button.secondary.small type="button" @click=(do store.open('token'))>
						<matreshka-icon name="plus">
						<span> 'Создать токен'
				<div.token-head>
					<span>
					<span> 'Название и доступ'
					<span> 'Последнее использование'
					<span> 'Токен'
					<span>
				<div.token-rows>
					for item in tokens
						<div.token-row key=item.id>
							<span.token-icon><matreshka-icon name="brackets-curly">
							<div.token-copy>
								<strong> item.name
								<small> scope(item)
							<span.last> stamp(item.last_used_at or item.lastUsedAt)
							<code.mask> mask(item)
							<button.icon-button type="button" disabled=busy @click=(do revoke('tokens', item)) aria-label="Отозвать токен"><matreshka-icon name="trash">
					<p.token-note>
						<matreshka-icon name="lock-key">
						<span> 'Полное значение токена показывается только один раз'
		if chooser
			<global @keydown.esc=(chooser = false)>
				<div.avatar-backdrop @click.self=(chooser = false)>
					<section.avatar-picker>
						<header>
							<div>
								<h2> 'Выберите аватар'
								<p> 'Он будет виден только в панели управления'
							<button type="button" @click=(chooser = false) aria-label="Закрыть"><matreshka-icon name="x">
						<matreshka-avatar-picker value=current busy=busy change=(do(value) choose(value))>

	css self
		maw:1110px mx:auto c:var(--matreshka-text)
		.profile-header d:flex ai:start jc:space-between g:24px
		.profile-header small d:block mb:14px c:var(--matreshka-brand) fs:12px fw:750 ls:.1em tt:uppercase
		.profile-header h1 c:var(--matreshka-navy) fs:36px lh:1.2 ls:-.02em
		.profile-header p mt:12px c:var(--matreshka-muted) fs:18px
		.profile-layout d:grid gtc:290px minmax(0, 1fr) column-gap:24px row-gap:14px mt:24px ai:start
		.profile-layout > .identity grid-row:1 / span 3
		.profile-layout > .access-group grid-column:2 min-width:0
		.identity p:20px
		.identity h2 fs:18px
		.portrait pos:relative s:148px mx:auto mt:14px
		.portrait img s:148px d:block rd:full object-fit:cover bgc:var(--matreshka-auth-start)
		.portrait button pos:absolute r:-1px b:4px s:36px d:grid ja:center bd:2px solid white rd:full bgc:var(--matreshka-white) c:var(--matreshka-brand)
		.owner-name mt:18px
		.owner-name > label, .role > span, .preferences > label d:block c:var(--matreshka-muted) fs:11px
		.owner-name > div d:grid gtc:minmax(0, 1fr) auto auto ai:center border-bottom:1px solid var(--matreshka-line)
		.owner-name input, .owner-value h:38px miw:0 p:0 bd:0 ol:none bgc:transparent c:var(--matreshka-text) fs:14px fw:550
		.owner-value d:flex ai:center
		.owner-name button s:30px d:grid ja:center bd:0 rd:7px bgc:transparent c:var(--matreshka-text)
		.owner-name button.save c:var(--matreshka-success)
		.role mt:12px pb:16px border-bottom:1px solid var(--matreshka-line)
		.role strong, .role small d:block
		.role strong mt:5px fs:14px
		.role small mt:5px c:var(--matreshka-muted) fs:12px
		.preferences mt:14px
		.preferences h2 mb:12px fs:17px
		.preferences label mt:10px mb:5px
		.preferences matreshka-profile-select d:block
		.access-group p:12px rd:12px bgc:var(--matreshka-soft)
		.subhead d:flex ai:center jc:space-between g:18px px:2px
		.subhead h3 fs:15px
		.subhead p mt:4px c:var(--matreshka-muted) fs:12px
		.rows d:grid g:6px mt:10px
		.access-row mih:64px d:grid gtc:42px minmax(0, 1fr) 180px 34px ai:center g:12px px:10px rd:9px bgc:var(--matreshka-white)
		.access-row > matreshka-device-glyph s:38px
		.access-row strong, .access-row small d:block
		.access-row strong fs:13px
		.access-row small mt:3px c:var(--matreshka-muted) fs:11px
		.used c:var(--matreshka-muted) fs:11px ta:right
		.current justify-self:end px:8px py:3px rd:999px bgc:var(--matreshka-success-soft) c:var(--matreshka-success) fs:10px
		.icon-button s:32px d:grid ja:center p:0 bd:1px solid transparent rd:8px bgc:transparent c:var(--matreshka-muted)
		.icon-button .ph fs:16px
		.icon-button bgc@hover:var(--matreshka-soft) c@hover:var(--matreshka-brand)
		.notice mt:12px c:var(--matreshka-muted) fs:12px ta:center
		.token-head, .token-row w:100% d:grid gtc:42px minmax(0, 1fr) minmax(105px, .9fr) minmax(90px, .75fr) 32px ai:center g:10px box-sizing:border-box
		.token-head h:28px px:10px c:var(--matreshka-muted) fs:10px
		.token-rows d:grid g:6px
		.token-row mih:64px px:10px rd:9px bgc:var(--matreshka-white) fs:11px
		.token-icon s:38px d:grid ja:center rd:10px bgc:var(--matreshka-auth-start) c:var(--matreshka-brand) fs:19px
		.token-copy strong, .token-copy small d:block
		.token-copy strong fs:13px
		.token-copy small mt:3px c:var(--matreshka-muted) fs:11px
		.token-row span c:var(--matreshka-muted)
		.token-row .token-icon c:var(--matreshka-brand)
		.token-row code c:var(--matreshka-text) fs:11px
		.token-copy, .token-row strong, .token-row .last, .token-row .mask of:hidden text-overflow:ellipsis white-space:nowrap
		.token-note d:flex ai:center g:7px mt:8px px:2px c:var(--matreshka-muted) fs:11px
		.token-note matreshka-icon fs:15px
		.avatar-backdrop pos:fixed inset:0 zi:250 d:grid jai:center p:24px bgc:black/28 backdrop-filter:blur(5px)
		.avatar-picker w:min(780px, 100%) mah:calc(100vh - 48px) p:24px rd:16px bgc:var(--matreshka-white) bxs:0 24px 80px black/18 ofy:auto
		.avatar-picker header d:grid gtc:minmax(0, 1fr) 36px ai:start
		.avatar-picker header h2 fs:22px
		.avatar-picker header p mt:6px c:var(--matreshka-muted) fs:13px
		.avatar-picker header button s:36px d:grid ja:center bd:0 rd:9px bgc:var(--matreshka-soft) c:var(--matreshka-muted)
		matreshka-avatar-picker d:block mt:20px
		@media(max-width: 1080px)
			.profile-layout gtc:250px minmax(0, 1fr)
		@media(max-width: 820px)
			.profile-layout gtc:1fr
			.profile-layout > .identity grid-row:auto
			.profile-layout > .access-group grid-column:1
		@media(max-width: 620px)
			.profile-header h1 fs:31px
			.profile-header p fs:16px
			.profile-layout mt:20px
			.subhead ai:start fld:column
			.access-row gtc:42px minmax(0, 1fr) 32px
			.used d:none
			.current grid-column:2; justify-self:start
			.token-head d:none
			.token-row gtc:42px minmax(0, 1fr) 32px; py:10px
			.token-row .token-icon grid-column:1; grid-row:1 / span 4
			.token-row .token-copy, .token-row .last, .token-row .mask grid-column:2
			.token-row .icon-button grid-column:3; grid-row:1 / span 4

tag matreshka-security
	store = null
	busy = null
	notice = null

	def mount
		store.secure!

	get raw do store.security or {passkeys: [], sessions: [], tokens: []}

	get passkeys
		return raw.passkeys if raw.passkeys.length or !store.data.auth.demo
		[
			{id: 'demo-touch', backedUp: true, label: 'Touch ID на MacBook', demo: true}
			{id: 'demo-phone', backedUp: true, label: 'iPhone', demo: true}
		]

	get sessions
		return raw.sessions if raw.sessions.length or !store.data.auth.demo
		[
			{id: 'demo-current', current: true, lastSeenAt: new Date!.toISOString!, userAgent: 'Safari macOS', label: 'Safari · macOS · сейчас', demo: true}
			{id: 'demo-phone', current: false, lastSeenAt: new Date(Date.now! - 18 * 60000).toISOString!, userAgent: 'Safari iPhone', label: 'Safari · iPhone · 18 минут назад', demo: true}
		]

	get tokens
		return raw.tokens if raw.tokens.length or !store.data.auth.demo
		[
			{id: 'demo-codex', name: 'Codex на MacBook', scopes: ['status:read', 'people:read', 'routes:read'], demo: true}
		]

	get healthy?
		store.data.system.tls.status == 'valid' and store.data.system.services.every do(item) item.status == 'active'

	get expiry
		const value = store.data.system.tls.expiresAt
		value ? "до {calendar(new Date(value))}" : 'Обновится автоматически'

	get keydetail
		return 'Touch ID на MacBook · iPhone' if passkeys.some(do(item) item.demo)
		return 'Passkey ещё не добавлен' unless passkeys.length
		passkeys.every(do(item) item.backedUp) ? 'Синхронизированы через связку ключей' : 'Привязаны к этому устройству'

	def session item
		return item.label if item.label
		const source = item.userAgent or ''
		const browser = source.includes('Safari') ? 'Safari' : source.includes('Firefox') ? 'Firefox' : source.includes('Chrome') ? 'Chrome' : 'Браузер'
		const device = source.includes('iPhone') ? 'iPhone' : source.includes('Android') ? 'Android' : source.includes('Windows') ? 'Windows' : source.includes('Mac') ? 'macOS' : 'устройство'
		"{browser} · {device} · {item.current ? 'сейчас' : ago(item.lastSeenAt)}"

	def ago value
		const minutes = Math.max(1, Math.round((Date.now! - new Date(value).getTime!) / 60000))
		return "{minutes} минут назад" if minutes < 60
		"{Math.round(minutes / 60)} ч назад"

	def check
		return if busy
		busy = 'check'
		notice = null
		try
			await store.load!
			await store.secure!
			notice = 'Проверка завершена'
		finally
			busy = null
			imba.commit!

	def passkey
		return if busy
		busy = 'passkey'
		notice = null
		try
			if store.data.auth.demo
				notice = 'В рабочей панели откроется системное окно создания passkey'
				return
			const owner = store.data.auth.owner
			const start = await store.api('POST', '/api/v1/auth/register/options', {name: owner.name, timezone: owner.timezone})
			const credential = await window.navigator.credentials.create({publicKey: authn.decode(start.options)})
			throw new Error('Создание passkey отменено') unless credential
			await store.api('POST', '/api/v1/auth/register/verify', {challengeId: start.challengeId, response: authn.json(credential)})
			await store.secure!
			notice = 'Новый passkey добавлен'
		catch issue
			notice = issue.message
		finally
			busy = null
			imba.commit!

	def finish
		return if busy or sessions.length < 2
		busy = 'sessions'
		notice = null
		try
			if store.data.auth.demo
				store.security = {...raw, sessions: sessions.filter(do(item) item.current)}
			else
				await store.api('DELETE', '/api/v1/sessions')
				await store.secure!
			notice = 'Другие сессии завершены'
		finally
			busy = null
			imba.commit!

	def manage kind
		store.selected = {kind: kind, items: kind == 'passkeys' ? passkeys : tokens}
		store.open('security')

	<self>
		<matreshka-header large=true eyebrow="Система" title="Безопасность" subtitle="Вход, сертификат и доступ к управлению сервером">
		<div.security-grid>
			<div.security-main>
				<section.health aria-live="polite">
					<span.health-icon><matreshka-icon name=(healthy? ? 'shield-check' : 'shield-warning')>
					<div>
						<strong> healthy? ? 'Сервер защищён' : 'Требуется внимание'
						<p> healthy? ? 'Критических проблем не обнаружено' : 'Проверьте службы и TLS-сертификат'
					<button.action type="button" disabled=busy @click=check> busy == 'check' ? 'Проверяем…' : 'Проверить снова'
				<section.matreshka-card.access-card>
					<div.security-row.owner-row>
						<span.row-icon><matreshka-icon name="key">
						<div.row-copy>
							<h2> 'Вход владельца'
							<p.state>
								<matreshka-icon name="dot">
								<span> "{passkeys.length} passkey"
							<p.detail> keydetail
						<div.row-actions>
							<button.action type="button" disabled=busy @click=passkey> busy == 'passkey' ? 'Добавляем…' : 'Добавить passkey'
							<button.quiet type="button" @click=(do manage('passkeys'))> 'Управлять'
					<div.security-row.session-row>
						<span.row-icon><matreshka-icon name="monitor">
						<div.row-copy>
							<h2> 'Активные сеансы'
							<p.state>
								<matreshka-icon name="dot">
								<span> "{sessions.length} {sessions.length == 1 ? 'устройство' : 'устройства'}"
							for item in sessions.slice(0, 2)
								<p.detail> session(item)
						<div.row-actions>
							<button.action type="button" disabled=(busy or sessions.length < 2) @click=finish> busy == 'sessions' ? 'Завершаем…' : 'Завершить другие'
					<div.security-row.token-row>
						<span.row-icon><matreshka-icon name="brackets-curly">
						<div.row-copy>
							<h2> 'API и MCP'
							<p.state>
								<matreshka-icon name="dot">
								<span> "{tokens.length} {tokens.length == 1 ? 'активный токен' : 'активных токена'}"
							<p.detail> tokens[0] ? tokens[0].name : 'Токены ещё не созданы'
							if tokens.length
								<p.detail> 'Чтение · Люди · Маршруты'
						<div.row-actions>
							<button.action type="button" @click=(do store.open('token'))> 'Создать токен'
							<button.quiet type="button" @click=(do manage('tokens'))> 'Управлять'
				if notice
					<p.notice> notice
			<aside.security-side>
				<section.matreshka-card.side-card.tls-card>
					<h2> 'Домен и TLS'
					<div.side-row.first>
						<matreshka-icon name="globe">
						<span> store.data.system.domain
					<div.side-row>
						<matreshka-icon name="check-circle">
						<div>
							<strong> 'Сертификат действителен'
							<small> 'Обновится автоматически'
					<div.side-row>
						<matreshka-icon name="calendar-blank">
						<span> expiry
				<section.matreshka-card.side-card.protection-card>
					<h2> 'Защита сервера'
					<div.side-row.first>
						<matreshka-icon name="shield-check">
						<div>
							<strong> 'Межсетевой экран'
							<small.success> 'Включён'
					<div.side-row>
						<matreshka-icon name="tree-structure">
						<div>
							<strong> 'Публичные порты'
							<small> '22, 80, 443 TCP · 443 UDP'
					<div.side-row>
						<matreshka-icon name="user">
						<div>
							<strong> 'Доступ root-агента'
							<small.success> 'Ограничен'

	css self
		margin-top:-14px; margin-left:-4px; width:calc(100% + 20px)
		matreshka-header h1
			@important font-size:48px
			@important line-height:1.08
			@important letter-spacing:-.03em
		.security-grid d:grid gtc:minmax(0, 1fr) 306px; align-items:start; g:42px; mt:43px
		.security-main d:grid g:36px
		.health mih:92px d:grid gtc:90px minmax(0, 1fr) auto; ai:center; g:34px
		.health pr:40px
		.health-icon s:90px h:92px d:grid ja:center rd:18px bgc:#EBF7ED c:#1B9B42
		.health-icon .ph fs:48px
		.health strong d:block c:#17933A fs:22px lh:1.25
		.health p mt:8px c:#5D6C8D fs:16px
		.action, .quiet p:0 bd:0 bg:transparent c:#0756F1 fs:17px fw:600 white-space:nowrap
		.action@hover, .quiet@hover c:#0849BA
		.action o@disabled:.55
		.quiet c:#63708D fw:500
		.access-card mih:630px p:0 28px
		.security-row d:grid gtc:70px minmax(0, 1fr) auto; align-items:start; g:32px; pt:35px; pb:38px; border-top:1px solid var(--matreshka-line)
		.security-row:first-child border-top:0
		.owner-row mih:184px
		.session-row mih:228px
		.token-row mih:218px
		.row-icon s:68px d:grid ja:center rd:16px bgc:#EBF7ED c:#1B9B42
		.row-icon .ph fs:38px
		.row-copy h2 c:#071127 fs:22px lh:1.3
		.state, .detail d:flex ai:center g:8px c:#17213D fs:16px
		.state mt:10px
		.state .ph w:10px c:#20A64B fs:30px
		.detail mt:10px c:#5D6C8D lh:1.35
		.row-actions min-width:156px d:grid justify-items:end g:20px pt:12px
		.session-row .row-actions align-self:center; pt:0
		.notice m:-16px 0 18px c:#5D6C8D fs:13px ta:center
		.security-side d:grid g:28px
		.side-card p:30px 24px 16px
		.side-card h2 mb:2px c:#071127 fs:21px
		.side-row d:grid gtc:28px minmax(0, 1fr); ai:center; g:16px; border-top:1px solid var(--matreshka-line); c:#43557A fs:15px
		.side-row:first-of-type border-top:0
		.side-row.first border-top:0
		.side-row > .ph c:#25406E fs:25px
		.tls-card .side-row > .ph c:#1B9B42
		.side-row strong, .side-row small d:block
		.side-row strong c:#17213D fw:500
		.side-row small mt:8px c:#63708D fs:14px lh:1.4
		.side-row small.success c:#159447
		.tls-card .side-row mih:88px
		.protection-card .side-row mih:106px
		@media(max-width: 1120px)
			.security-grid gtc:1fr; g:28px
			.security-side gtc:repeat(2, minmax(0, 1fr))
			.tls-card, .protection-card mih:0
		@media(max-width: 760px)
			margin-top:0; margin-left:0; width:100%
			matreshka-header h1
				@important font-size:36px
			.health gtc:66px 1fr; g:18px
			.health-icon s:66px
			.health .action grid-column:2; justify-self:start
			.access-card p:0 20px
			.security-row gtc:54px minmax(0, 1fr); g:18px; p:28px 0
			.row-icon s:54px
			.row-icon .ph fs:30px
			.row-actions grid-column:2; min-width:0; grid-auto-flow:column; justify-content:start; justify-items:start
			.security-side gtc:1fr

tag matreshka-security-modal
	store = null
	busy = null
	message = null

	get kind do store.selected.kind
	get items do store.selected.items

	get title
		return 'Passkeys владельца' if kind == 'passkeys'
		return 'Активные сеансы' if kind == 'sessions'
		'API и MCP токены'

	get hint
		return 'Оставьте минимум один способ входа в панель.' if kind == 'passkeys'
		return 'Сессии браузеров, в которых выполнен вход в панель.' if kind == 'sessions'
		'Создавайте отдельный токен для каждого приложения и отзывайте неиспользуемые.'

	def label item
		return item.label if item.label
		return item.name if item.name
		if kind == 'sessions'
			const source = item.userAgent or ''
			const browser = source.includes('Safari') ? 'Safari' : source.includes('Firefox') ? 'Firefox' : source.includes('Chrome') ? 'Chrome' : 'Браузер'
			const device = source.includes('iPhone') ? 'iPhone' : source.includes('Android') ? 'Android' : source.includes('Windows') ? 'Windows' : source.includes('Mac') ? 'macOS' : 'устройство'
			return "{browser} · {device}"
		'Passkey'

	def detail item
		return item.current ? 'Текущий сеанс' : 'Активный сеанс' if kind == 'sessions'
		item.demo ? 'Демонстрационные данные' : 'Активен'

	def revoke item
		return if busy or item.demo or kind == 'sessions'
		busy = item.id
		try
			const url = kind == 'passkeys' ? "/api/v1/passkeys/{item.id}" : "/api/v1/tokens/{item.id}"
			await store.api('DELETE', url)
			await store.secure!
			store.selected.items = kind == 'passkeys' ? store.security.passkeys : store.security.tokens
		finally
			busy = null
			imba.commit!

	def add
		return if busy
		if kind == 'tokens'
			store.open('token')
			return
		return unless kind == 'passkeys'
		busy = 'add'
		message = null
		try
			if store.data.auth.demo
				message = 'В рабочей панели откроется системное окно создания passkey'
				return
			const owner = store.data.auth.owner
			const start = await store.api('POST', '/api/v1/auth/register/options', {name: owner.name, timezone: owner.timezone})
			const credential = await window.navigator.credentials.create({publicKey: authn.decode(start.options)})
			throw new Error('Создание passkey отменено') unless credential
			await store.api('POST', '/api/v1/auth/register/verify', {challengeId: start.challengeId, response: authn.json(credential)})
			await store.secure!
			store.selected.items = store.security.passkeys
			message = 'Новый passkey добавлен'
		catch issue
			message = issue.message
		finally
			busy = null
			imba.commit!

	def finish
		return if busy or kind != 'sessions'
		busy = 'finish'
		message = null
		try
			if store.data.auth.demo
				store.selected.items = items.filter do(item) item.current
			else
				await store.api('DELETE', '/api/v1/sessions')
				await store.secure!
				store.selected.items = store.security.sessions
			message = 'Другие сеансы завершены'
		catch issue
			message = issue.message
		finally
			busy = null
			imba.commit!

	<self.matreshka-modal-backdrop role="dialog" aria-modal="true" aria-label="Безопасность и доступ" tabindex="-1" @click.self=store.close>
		<div.matreshka-modal.security-modal>
			<h2> title
			<p> hint
			<div.security-list>
				if items.length
					for item in items
						<div>
							<span.item-icon><matreshka-icon name=(kind == 'passkeys' ? 'key' : kind == 'sessions' ? 'devices' : 'brackets-curly')>
							<span>
								<strong> label(item)
								<small> detail(item)
							if kind != 'sessions'
								<button type="button" disabled=(busy or item.demo or (kind == 'passkeys' and items.length < 2)) @click=(do revoke(item))> busy == item.id ? 'Отзываем…' : 'Отозвать'
				else
					<p.empty> 'Активных записей нет'
			if message
				<p.modal-message> message
			<div.modal-actions>
				<button.matreshka-button.quiet type="button" @click=store.close> 'Готово'
				if kind == 'sessions'
					<button.matreshka-button type="button" disabled=(busy or items.length < 2) @click=finish> busy == 'finish' ? 'Завершаем…' : 'Завершить другие'
				else
					<button.matreshka-button type="button" disabled=busy @click=add> kind == 'passkeys' ? (busy == 'add' ? 'Добавляем…' : 'Добавить passkey') : 'Создать токен'

	css self
		.security-modal w:min(620px, 100%)
		.security-list mt:24px; border-top:1px solid var(--matreshka-line)
		.security-list > div mih:72px d:grid gtc:40px minmax(0, 1fr) auto; ai:center; g:14px; border-bottom:1px solid var(--matreshka-line)
		.item-icon s:36px d:grid ja:center rd:9px bgc:#EBF7ED c:#159447
		.security-list strong, .security-list small d:block
		.security-list small mt:4px c:#69748D fs:12px
		.security-list button p:0 bd:0 bg:transparent c:#C1453C fs:13px
		.security-list button c@disabled:#9AA4B6
		.empty p:24px 0 c:#69748D
		.modal-message mt:16px c:#5D6C8D fs:13px

def decode value
	const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
	const padded = base64 + '='.repeat((4 - base64.length % 4) % 4)
	Uint8Array.from(atob(padded), do(char) char.charCodeAt(0)).buffer

def encode buffer
	const bytes = new Uint8Array(buffer)
	let binary = ''
	for byte in bytes
		binary += String.fromCharCode(byte)
	btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(new RegExp('=+$'), '')
