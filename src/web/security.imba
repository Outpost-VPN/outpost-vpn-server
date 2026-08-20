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

tag outpost-access
	store = null
	busy = null
	notice = null
	dismissed = []

	def mount
		store.secure!

	get owner do store.data.auth.owner
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
			{id: 'demo-codex-8K2F', name: 'Codex MCP', scopes: ['status:read', 'connections:read', 'routes:write'], created_at: new Date(Date.now! - 10 * 86400000).toISOString!, last_used_at: new Date(Date.now! - 2 * 3600000).toISOString!, demo: true}
			{id: 'demo-monitor-3M7A', name: 'Мониторинг', scopes: ['status:read', 'traffic:read'], created_at: new Date(Date.now! - 18 * 86400000).toISOString!, last_used_at: new Date(Date.now! - 26 * 3600000).toISOString!, demo: true}
		]
		items.filter do(item) !dismissed.includes(item.id)

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

	def passkey
		return if busy
		busy = 'passkey'
		notice = null
		try
			const start = await store.api('POST', '/api/v1/auth/register/options', {timezone: owner.timezone})
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
		<header.access-header>
			<div>
				<small> 'Безопасность'
				<h1> 'Доступ'
				<p> 'Вход, активные сеансы и интеграции'
			<button.outpost-button.secondary.small.header-action type="button" @click=logout>
				<outpost-icon name="sign-out">
				<span> 'Выйти'
		<div.access-layout>
			<section.access-group>
				<div.subhead>
					<div>
						<h3> 'Passkeys'
						<p> 'Вход без пароля с доверенных устройств'
					<button.outpost-button.secondary.small type="button" disabled=busy @click=passkey>
						<outpost-icon name="plus">
						<span> busy == 'passkey' ? 'Добавляем…' : 'Добавить passkey'
				<div.rows>
					for item in passkeys
						<div.access-row key=item.id>
							<outpost-device-glyph kind=device(item)>
							<div>
								<strong> credential(item).name
								<small> credential(item).detail
							<span.used> "Использован {stamp(item.lastUsedAt)}"
							<button.icon-button type="button" disabled=(busy or passkeys.length < 2) @click=(do revoke('passkeys', item)) aria-label="Отозвать passkey"><outpost-icon name="trash">
				if notice and notice.kind == 'passkeys'
					<p.notice aria-live="polite"> notice.text
			<section.access-group>
				<div.subhead>
					<div>
						<h3> 'Активные сеансы'
						<p> 'Браузеры, в которых выполнен вход'
					if sessions.length > 1
						<button.outpost-button.secondary.small type="button" disabled=busy @click=finish> busy == 'sessions' ? 'Завершаем…' : 'Завершить остальные'
				<div.rows>
					for item in sessions
						<div.access-row.session key=item.id>
							<outpost-device-glyph kind=device(item)>
							<div>
								<strong> client(item).name
								<small> client(item).detail
							if item.current
								<span.current> 'Текущий'
							else
								<span.used> "Активен {stamp(item.lastSeenAt)}"
							<button.icon-button type="button" disabled=(busy or item.current) @click=(do revoke('sessions', item)) aria-label="Завершить сеанс"><outpost-icon name="sign-out">
			<section.access-group.tokens>
				<div.subhead>
					<div>
						<h3> 'API / MCP'
						<p> 'Токены для интеграций и автоматизации'
					<button.outpost-button.secondary.small type="button" @click=(do store.open('token'))>
						<outpost-icon name="plus">
						<span> 'Создать токен'
				if tokens.length
					<div.token-rows>
						for item in tokens
							<div.token-row key=item.id>
								<span.token-icon><outpost-icon name="brackets-curly">
								<div.token-copy>
									<strong> item.name
									<small> scope(item)
								<span.used> "Активен {stamp(item.last_used_at or item.lastUsedAt)}"
								<button.icon-button type="button" disabled=busy @click=(do revoke('tokens', item)) aria-label="Отозвать токен"><outpost-icon name="trash">
						<p.token-note>
							<outpost-icon name="lock-key">
							<span> 'Полное значение токена показывается только один раз'

	css self
		maw:1110px mx:auto c:var(--outpost-text)
		.access-header d:flex ai:start jc:space-between g:24px
		.access-header small d:block mb:14px c:var(--outpost-brand) fs:12px fw:750 ls:.1em tt:uppercase
		.access-header h1 c:var(--outpost-navy) fs:36px lh:1.2 ls:-.02em
		.access-header p mt:12px c:var(--outpost-muted) fs:18px
		.access-layout d:grid g:14px mt:24px
		.access-group p:12px rd:12px bgc:var(--outpost-soft)
		.subhead d:flex ai:center jc:space-between g:18px px:2px
		.subhead h3 fs:15px
		.subhead p mt:4px c:var(--outpost-muted) fs:12px
		.rows d:grid g:6px mt:10px
		.access-row mih:64px d:grid gtc:42px minmax(0, 1fr) 180px 34px ai:center g:12px px:10px rd:9px bgc:var(--outpost-white)
		.access-row > outpost-device-glyph s:38px
		.access-row strong, .access-row small d:block
		.access-row strong fs:13px
		.access-row small mt:3px c:var(--outpost-muted) fs:11px
		.used c:var(--outpost-muted) fs:11px ta:right
		.current justify-self:end px:8px py:3px rd:999px bgc:var(--outpost-success-soft) c:var(--outpost-success) fs:10px
		.icon-button s:32px d:grid ja:center p:0 bd:1px solid transparent rd:8px bgc:transparent c:var(--outpost-muted)
		.icon-button .ph fs:16px
		.icon-button bgc@hover:var(--outpost-soft) c@hover:var(--outpost-brand)
		.notice mt:12px c:var(--outpost-muted) fs:12px ta:center
		.token-row w:100% d:grid gtc:42px minmax(0, 1fr) 180px 32px ai:center g:12px box-sizing:border-box
		.token-rows d:grid g:6px mt:10px
		.token-row mih:64px px:10px rd:9px bgc:var(--outpost-white) fs:11px
		.token-icon s:38px d:grid ja:center rd:10px bgc:var(--outpost-auth-start) c:var(--outpost-brand) fs:19px
		.token-copy strong, .token-copy small d:block
		.token-copy strong fs:13px
		.token-copy small mt:3px c:var(--outpost-muted) fs:11px
		.token-row span c:var(--outpost-muted)
		.token-row .token-icon c:var(--outpost-brand)
		.token-copy, .token-row strong of:hidden text-overflow:ellipsis white-space:nowrap
		.token-note d:flex ai:center g:7px mt:8px px:2px c:var(--outpost-muted) fs:11px
		.token-note outpost-icon fs:15px
		@media(max-width: 620px)
			.access-header h1 fs:31px
			.access-header p fs:16px
			.access-layout mt:20px
			.subhead ai:start fld:column
			.access-row gtc:42px minmax(0, 1fr) 32px
			.used d:none
			.current grid-column:2; justify-self:start
			.token-row gtc:42px minmax(0, 1fr) 32px; py:10px

tag outpost-security
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
			{id: 'demo-codex', name: 'Codex на MacBook', scopes: ['status:read', 'connections:read', 'routes:read'], demo: true}
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
			const start = await store.api('POST', '/api/v1/auth/register/options', {timezone: owner.timezone})
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
		<outpost-header large=true eyebrow="Система" title="Безопасность" subtitle="Вход, сертификат и доступ к управлению сервером">
		<div.security-grid>
			<div.security-main>
				<section.health aria-live="polite">
					<span.health-icon><outpost-icon name=(healthy? ? 'shield-check' : 'shield-warning')>
					<div>
						<strong> healthy? ? 'Сервер защищён' : 'Требуется внимание'
						<p> healthy? ? 'Критических проблем не обнаружено' : 'Проверьте службы и TLS-сертификат'
					<button.action type="button" disabled=busy @click=check> busy == 'check' ? 'Проверяем…' : 'Проверить снова'
				<section.outpost-card.access-card>
					<div.security-row.owner-row>
						<span.row-icon><outpost-icon name="key">
						<div.row-copy>
							<h2> 'Вход владельца'
							<p.state>
								<outpost-icon name="dot">
								<span> "{passkeys.length} passkey"
							<p.detail> keydetail
						<div.row-actions>
							<button.action type="button" disabled=busy @click=passkey> busy == 'passkey' ? 'Добавляем…' : 'Добавить passkey'
							<button.quiet type="button" @click=(do manage('passkeys'))> 'Управлять'
					<div.security-row.session-row>
						<span.row-icon><outpost-icon name="monitor">
						<div.row-copy>
							<h2> 'Активные сеансы'
							<p.state>
								<outpost-icon name="dot">
								<span> "{sessions.length} {sessions.length == 1 ? 'устройство' : 'устройства'}"
							for item in sessions.slice(0, 2)
								<p.detail> session(item)
						<div.row-actions>
							<button.action type="button" disabled=(busy or sessions.length < 2) @click=finish> busy == 'sessions' ? 'Завершаем…' : 'Завершить другие'
					<div.security-row.token-row>
						<span.row-icon><outpost-icon name="brackets-curly">
						<div.row-copy>
							<h2> 'API и MCP'
							<p.state>
								<outpost-icon name="dot">
								<span> "{tokens.length} {tokens.length == 1 ? 'активный токен' : 'активных токена'}"
							<p.detail> tokens[0] ? tokens[0].name : 'Токены ещё не созданы'
							if tokens.length
								<p.detail> 'Чтение · Подключения · Маршруты'
						<div.row-actions>
							<button.action type="button" @click=(do store.open('token'))> 'Создать токен'
							<button.quiet type="button" @click=(do manage('tokens'))> 'Управлять'
				if notice
					<p.notice> notice
			<aside.security-side>
				<section.outpost-card.side-card.tls-card>
					<h2> 'Домен и TLS'
					<div.side-row.first>
						<outpost-icon name="globe">
						<span> store.data.system.domain
					<div.side-row>
						<outpost-icon name="check-circle">
						<div>
							<strong> 'Сертификат действителен'
							<small> 'Обновится автоматически'
					<div.side-row>
						<outpost-icon name="calendar-blank">
						<span> expiry
				<section.outpost-card.side-card.protection-card>
					<h2> 'Защита сервера'
					<div.side-row.first>
						<outpost-icon name="shield-check">
						<div>
							<strong> 'Межсетевой экран'
							<small.success> 'Включён'
					<div.side-row>
						<outpost-icon name="tree-structure">
						<div>
							<strong> 'Публичные порты'
							<small> '22, 80, 443 TCP · 443 UDP'
					<div.side-row>
						<outpost-icon name="user">
						<div>
							<strong> 'Доступ root-агента'
							<small.success> 'Ограничен'

	css self
		margin-top:-14px; margin-left:-4px; width:calc(100% + 20px)
		outpost-header h1
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
		.security-row d:grid gtc:70px minmax(0, 1fr) auto; align-items:start; g:32px; pt:35px; pb:38px; border-top:1px solid var(--outpost-line)
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
		.side-row d:grid gtc:28px minmax(0, 1fr); ai:center; g:16px; border-top:1px solid var(--outpost-line); c:#43557A fs:15px
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
			outpost-header h1
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

tag outpost-security-modal
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
			const start = await store.api('POST', '/api/v1/auth/register/options', {timezone: owner.timezone})
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

	<self.outpost-modal-backdrop role="dialog" aria-modal="true" aria-label="Безопасность и доступ" tabindex="-1" @click.self=store.close>
		<div.outpost-modal.security-modal>
			<header.outpost-modal-header>
				<span.outpost-modal-mark><outpost-icon name=(kind == 'passkeys' ? 'key' : kind == 'sessions' ? 'devices' : 'brackets-curly')>
				<div>
					<h2> title
					<p> hint
				<button.outpost-modal-close type="button" @click=store.close aria-label="Закрыть"><outpost-icon name="x">
			<div.outpost-modal-body>
				<div.security-list>
					if items.length
						for item in items
							<div>
								<span.item-icon><outpost-icon name=(kind == 'passkeys' ? 'key' : kind == 'sessions' ? 'devices' : 'brackets-curly')>
								<span>
									<strong> label(item)
									<small> detail(item)
								if kind != 'sessions'
									<button type="button" disabled=(busy or item.demo or (kind == 'passkeys' and items.length < 2)) @click=(do revoke(item))> busy == item.id ? 'Отзываем…' : 'Отозвать'
					else
						<p.empty> 'Активных записей нет'
				if message
					<p.modal-message> message
			<footer.outpost-modal-footer>
				<div.modal-actions>
					<button.outpost-button.quiet type="button" @click=store.close> 'Готово'
					if kind == 'sessions'
						<button.outpost-button type="button" disabled=(busy or items.length < 2) @click=finish> busy == 'finish' ? 'Завершаем…' : 'Завершить другие'
					else
						<button.outpost-button type="button" disabled=busy @click=add> kind == 'passkeys' ? (busy == 'add' ? 'Добавляем…' : 'Добавить passkey') : 'Создать токен'

	css self
		.security-modal w:min(620px, 100%)
		.security-list border-top:1px solid var(--outpost-line)
		.security-list > div mih:72px d:grid gtc:40px minmax(0, 1fr) auto; ai:center; g:14px; border-bottom:1px solid var(--outpost-line)
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
