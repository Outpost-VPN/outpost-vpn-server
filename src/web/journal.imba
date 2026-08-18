import {t} from './i18n.imba'

const scopes = [
	{id: 'all', label: 'Все события', hint: 'Без фильтра', icon: 'list-bullets'}
	{id: 'important', label: 'Важные', hint: 'Важное и предупреждения', icon: 'star'}
	{id: 'errors', label: 'Ошибки', hint: 'Ошибки и критические', icon: 'x-circle'}
	{id: 'changes', label: 'Изменения', hint: 'Изменения настроек', icon: 'pencil-simple'}
]

const categories = [
	{id: 'all', label: 'Все', icon: 'squares-four', values: []}
	{id: 'people', label: 'Люди', icon: 'users', values: ['people']}
	{id: 'routes', label: 'Маршруты', icon: 'path', values: ['routes']}
	{id: 'engines', label: 'Подключения', icon: 'share-network', values: ['engines']}
	{id: 'security', label: 'Безопасность', icon: 'shield-check', values: ['security']}
	{id: 'system', label: 'Система', icon: 'gear-six', values: ['system', 'maintenance']}
]

const labels = {
	size: 'Размер'
	encrypted: 'Шифрование'
	version: 'Версия'
	previousVersion: 'Предыдущая версия'
	fromVersion: 'Исходная версия'
	toVersion: 'Новая версия'
	newVersion: 'Новая версия'
	targetVersion: 'Целевая версия'
	rules: 'Правила'
	rulesCount: 'Количество правил'
	note: 'Комментарий'
	order: 'Порядок подключения'
	engine: 'Движок'
	service: 'Служба'
	personName: 'Человек'
	deviceName: 'Устройство'
	kind: 'Тип устройства'
	platform: 'Платформа'
	client: 'Клиент'
	browser: 'Браузер'
	os: 'Система'
	revoked: 'Завершено сеансов'
	percent: 'Использовано диска'
	days: 'Осталось дней'
	lastSeenAt: 'Последняя активность'
	absentSince: 'Отсутствовало с'
	error: 'Ошибка'
	scopes: 'Права доступа'
}

const journal = {
	icon: do(event)
		const option = categories.find(do(item) item.values.includes(event.category))
		option ? option.icon : 'info'
	category: do(value)
		const option = categories.find(do(item) item.id == value or item.values.includes(value))
		option ? option.label : value
	component: do(value)
		const labels = {xray: 'Xray', hysteria: 'Hysteria 2', engine: 'Движки', engines: 'Движки', routes: 'Маршруты', person: 'Люди', people: 'Люди', device: 'Устройства', auth: 'Авторизация', passkey: 'Ключи доступа', session: 'Сеансы', token: 'API-токены', backup: 'Резервные копии', service: 'Службы', nginx: 'Nginx', app: 'Matreshka', security: 'Безопасность', maintenance: 'Обслуживание', system: 'Система', monitor: 'Мониторинг'}
		labels[value] or value
	key: do(value)
		const date = new Date(value)
		"{date.getFullYear!}-{date.getMonth!}-{date.getDate!}"
	date: do(value)
		const date = new Date(value)
		const today = new Date
		const yesterday = new Date
		yesterday.setDate(today.getDate! - 1)
		const suffix = new Intl.DateTimeFormat('ru-RU', {day: 'numeric', month: 'long'}).format(date)
		return "Сегодня, {suffix}" if journal.key(date) == journal.key(today)
		return "Вчера, {suffix}" if journal.key(date) == journal.key(yesterday)
		new Intl.DateTimeFormat('ru-RU', {day: 'numeric', month: 'long'}).format(date)
	time: do(value)
		new Intl.DateTimeFormat('ru-RU', {hour: '2-digit', minute: '2-digit'}).format(new Date(value))
	full: do(value)
		new Intl.DateTimeFormat('ru-RU', {dateStyle: 'long', timeStyle: 'medium'}).format(new Date(value))
	json: do(value)
		JSON.stringify(value, null, 2)
	bytes: do(value)
		return "{Math.round(value / 1024 / 1024 * 10) / 10} МБ" if value >= 1024 * 1024
		"{Math.max(1, Math.round(value / 1024))} КБ"
	value: do(key, value)
		return journal.bytes(value) if key == 'size' and typeof value == 'number'
		return value ? 'Включено' : 'Выключено' if key == 'encrypted' and typeof value == 'boolean'
		return value ? 'Да' : 'Нет' if typeof value == 'boolean'
		return value.map(do(item) journal.component(item)).join(' → ') if key == 'order' and Array.isArray(value)
		return value.join(', ') if Array.isArray(value)
		return journal.component(value) if ['engine', 'service'].includes(key)
		return "{value}%" if key == 'percent'
		return journal.full(value) if ['lastSeenAt', 'absentSince'].includes(key) and typeof value == 'string'
		String(value)
	facts: do(payload)
		const items = []
		for own key, value of payload
			continue if value == null or typeof value == 'object' and !Array.isArray(value)
			items.push({key: key, label: labels[key] or key, value: journal.value(key, value), raw: value})
		items
}

tag matreshka-journal-scope
	value = 'all'
	change = null
	open = false

	get current
		scopes.find(do(option) option.id == value) or scopes[0]

	def close
		open = false

	def toggle
		open = !open

	def select option
		value = option.id
		close!
		change(option.id) if change

	<self .open=open>
		if open
			<global @click.outside=close @keydown.esc=close>
		<button.trigger type="button" @click.stop=toggle aria-label="Тип событий" aria-haspopup="listbox" aria-expanded=open>
			<span.tone .all=(current.id == 'all') .important=(current.id == 'important') .errors=(current.id == 'errors') .changes=(current.id == 'changes')>
				<matreshka-icon name=current.icon>
			<span.label> current.label
			<matreshka-icon.chevron name="caret-down">
		if open
			<div.options role="listbox" aria-label="Тип событий">
				for option in scopes
					<button type="button" role="option" aria-selected=(value == option.id) .active=(value == option.id) @click.stop=(do select(option))>
						<span.tone .all=(option.id == 'all') .important=(option.id == 'important') .errors=(option.id == 'errors') .changes=(option.id == 'changes')>
							<matreshka-icon name=option.icon>
						<span.copy>
							<strong> option.label
							<small> option.hint
						if value == option.id
							<matreshka-icon.check name="check">

	css self
		d:block h:54px pos:relative
		.trigger w:100% h:100% d:grid gtc:32px minmax(0,1fr) 18px ai:center g:10px px:13px bd:1px solid var(--matreshka-line) rd:10px bgc:var(--matreshka-white) c:var(--matreshka-text) fs:15px ta:left cursor:pointer tween:border-color .16s ease, box-shadow .16s ease
		.trigger@hover bc:blue3
		&.open .trigger bc:var(--matreshka-brand) bxs:0 0 0 3px blue6/8
		.tone s:30px d:grid ja:center rd:8px fs:17px
		.tone.all bgc:blue1 c:var(--matreshka-brand)
		.tone.important bgc:red1 c:red6
		.tone.errors bgc:red2 c:red8
		.tone.changes bgc:indigo1 c:indigo6
		.label miw:0 of:hidden tof:ellipsis ws:nowrap fw:600
		.chevron c:var(--matreshka-muted) fs:16px tween:transform .16s ease
		&.open .chevron rotate:180deg
		.options pos:absolute zi:30 t:calc(100% + 8px) l:0 w:260px maw:calc(100vw - 32px) d:grid g:3px p:6px bd:1px solid var(--matreshka-line) rd:12px bgc:var(--matreshka-white) bxs:0 16px 40px black/12 box-sizing:border-box
		.options button w:100% mih:52px d:grid gtc:32px minmax(0,1fr) 18px ai:center g:10px p:5px 8px bd:0 rd:9px bgc:transparent c:var(--matreshka-text) ta:left cursor:pointer of:hidden box-sizing:border-box tween:background .14s ease
		.options button bgc@hover:var(--matreshka-soft)
		.options button.active bgc:blue1
		.copy miw:0 of:hidden
		.copy strong, .copy small d:block of:hidden tof:ellipsis ws:nowrap
		.copy strong fs:13px fw:680
		.copy small mt:2px c:var(--matreshka-muted) fs:10px
		.check c:var(--matreshka-brand) fs:16px
		@media(max-width: 720px)
			.options w:100%

tag matreshka-journal-row
	event = null
	open = false

	def toggle
		open = !open

	get changes
		event.details..changes

	get facts
		event.details..data or {}

	get items
		journal.facts(facts)

	get area
		journal.category(event.category)

	get component
		journal.component(event.details..component or event.source)

	get subject
		const label = event.subject..label
		return '' unless label
		label == component ? '' : label

	<self .open=open>
		<button.entry type="button" @click=toggle aria-expanded=(open ? 'true' : 'false')>
			<time datetime=event.occurred_at> journal.time(event.occurred_at)
			<span.status .success=(['succeeded', 'recovered'].includes(event.outcome)) .warning=(['warning', 'critical'].includes(event.severity)) .error=(event.severity == 'error')>
				<matreshka-icon name=journal.icon(event)>
			<span.copy>
				<strong> event.title
				<small> event.description or journal.category(event.category)
			<span.source> journal.category(event.category)
			<matreshka-icon.caret name=(open ? 'caret-up' : 'caret-down')>
		if open
			<div.inspect ease>
				<div.body>
					<div.context>
						<time datetime=event.occurred_at> journal.full(event.occurred_at)
						<i> '·'
						<span.area> area
						if component != area
							<i> '·'
							<span> component
						if subject
							<i> '·'
							<span> "Объект: {subject}"
						<i> '·'
						<span> "Автор: {event.actor..label or 'Система'}"
					if items.length
						<dl.facts>
							for item in items
								<div>
									<dt> item.label
									<dd .positive=(item.key == 'encrypted' and item.raw)> item.value
					if Object.keys(facts).length or changes
						<details.technical>
							<summary>
								<matreshka-icon name="caret-down">
								<span> 'Технические данные'
							<div.payload>
								if Object.keys(facts).length
									<div>
										<strong> 'Данные события'
										<pre> journal.json(facts)
								if changes
									<div>
										<strong> 'До'
										<pre> journal.json(changes.before)
									<div>
										<strong> 'После'
										<pre> journal.json(changes.after)

	css self
		d:block of:hidden bd:1px solid var(--matreshka-line) rd:12px bgc:var(--matreshka-white) tween:border-color .16s ease, background .16s ease, box-shadow .16s ease
		&:hover bc:blue3
		&.open bc:color-mix(in srgb, var(--matreshka-success) 25%, var(--matreshka-line)) bgc:color-mix(in srgb, var(--matreshka-success-soft) 36%, var(--matreshka-white))
		.entry w:100% mih:74px d:grid gtc:62px 34px minmax(0,1fr) 170px 34px ai:center g:18px px:16px bd:0 ol:none bgc:transparent c:var(--matreshka-text) ta:left cursor:pointer tween:background .16s ease, box-shadow .16s ease
		.entry bgc@hover:color-mix(in srgb, var(--matreshka-auth-start) 46%, var(--matreshka-white))
		.entry bxs@focus-visible:inset 0 0 0 2px blue6/22
		&.open .entry bdb:1px solid var(--matreshka-line) bgc@hover:transparent
		time c:var(--matreshka-muted) fs:16px
		.status s:34px d:grid ja:center rd:full bgc:blue1 c:var(--matreshka-brand) fs:21px
		.status.success bgc:var(--matreshka-success-soft) c:var(--matreshka-success)
		.status.warning bgc:orange1 c:var(--matreshka-warning)
		.status.error bgc:red1 c:red6
		.copy miw:0 d:block
		.copy strong, .copy small d:block of:hidden tof:ellipsis ws:nowrap
		.copy strong c:var(--matreshka-navy) fs:16px fw:680
		.copy small mt:6px c:var(--matreshka-muted) fs:15px
		.source c:var(--matreshka-muted) fs:15px
		.caret s:34px d:grid ja:center fl:0 0 34px bd:1px solid var(--matreshka-line) rd:8px bgc:var(--matreshka-white) c:#66738C fs:16px tween:border-color .16s ease, background .16s ease, color .16s ease
		.entry@hover .caret bc:#B8D0F9 bgc:#F3F7FE c:var(--matreshka-brand)
		.inspect d:grid gtc:62px 34px minmax(0,1fr) g:18px px:16px c:var(--matreshka-muted) fs:13px lh:1.5 ease:180ms cubic-bezier(.22,1,.36,1) o@off:0 y@off:-4px
		.body gc:3 miw:0 py:15px pr:76px
		.context d:flex ai:center flw:wrap g:6px pb:11px border-bottom:1px solid var(--matreshka-line) c:var(--matreshka-muted) fs:13px
		.context .area c:var(--matreshka-text) fw:620
		.context i fs:11px font-style:normal
		.context time fs:13px
		.facts m:0
		.facts > div d:grid gtc:minmax(150px,240px) minmax(0,1fr) g:28px py:9px
		.facts > div border-bottom:1px solid var(--matreshka-line)
		.facts dt c:var(--matreshka-muted) fs:15px
		.facts dd m:0 c:var(--matreshka-navy) fs:15px fw:540
		.facts dd.positive c:var(--matreshka-success) fw:650
		.technical mt:8px
		.technical summary w:max-content d:flex ai:center g:9px py:4px list-style:none c:var(--matreshka-muted) fs:13px fw:560 cursor:pointer
		.technical summary::-webkit-details-marker d:none
		.technical summary matreshka-icon fs:16px tween:transform .16s ease
		.technical[open] summary matreshka-icon rotate:180deg
		.payload d:grid g:14px mt:8px
		.payload strong d:block mb:5px c:var(--matreshka-text) fs:11px tt:uppercase ls:.05em
		pre m:0 p:12px of:auto bd:1px solid var(--matreshka-line) rd:8px bgc:var(--matreshka-soft) c:var(--matreshka-text) fs:12px lh:1.45 white-space:pre-wrap
		@media(max-width: 820px)
			.entry gtc:52px 32px minmax(0,1fr) 34px g:12px mih:74px px:12px
			.source d:none
			.copy strong fs:14px
			.copy small fs:13px
			.inspect gtc:52px 32px minmax(0,1fr) g:12px px:12px
			.body py:15px pr:18px
			.facts > div gtc:minmax(120px,180px) minmax(0,1fr) g:18px
		@media(max-width: 520px)
			.entry gtc:40px 28px minmax(0,1fr) 34px g:9px px:10px
			time fs:13px
			.status s:28px fs:18px
			.inspect gtc:40px 28px minmax(0,1fr) g:9px px:10px
			.body py:14px pr:12px
			.facts > div gtc:1fr g:4px py:12px

tag matreshka-journal
	store = null
	scope = 'all'
	category = 'all'
	query = ''
	events = []
	total = 0
	next = null
	busy = false
	message = ''
	stamp = 0

	def setup
		events = store.data.system.events or []
		total = events.length

	def mount
		load!

	get groups
		const items = []
		for event in events
			const key = journal.key(event.occurred_at)
			let group = items.find(do(item) item.key == key)
			unless group
				group = {key: key, label: journal.date(event.occurred_at), events: []}
				items.push(group)
			group.events.push(event)
		items

	def load reset = true
		const current = ++stamp
		busy = true
		message = ''
		try
			const params = new window.URLSearchParams
			const selected = categories.find(do(option) option.id == category)
			params.set('scope', scope)
			params.set('limit', '7')
			params.set('category', selected.values.join(',')) if selected and selected.values.length
			params.set('q', query.trim!) if query.trim!
			params.set('before', String(next)) if !reset and next
			const payload = await store.api('GET', "/api/v1/system/events?{params.toString!}")
			if current == stamp
				events = reset ? payload.events : events.concat(payload.events)
				total = payload.total
				next = payload.next
		catch issue
			message = issue.message if current == stamp
		finally
			if current == stamp
				busy = false
				imba.commit!

	def choose value
		category = value
		load!

	def narrow value
		scope = value
		load!

	def search
		load!

	def refresh
		load!

	def more
		load(false)

	<self>
		<header.head>
			<div>
				<small> t('journal.eyebrow')
				<h1> t('journal.title')
				<p> t('journal.subtitle')
			<button.matreshka-button.secondary.small.header-action type="button" disabled=busy @click=refresh>
				<matreshka-icon name="arrows-clockwise">
				<span> busy ? 'Обновляем' : 'Обновить'
		<div.toolbar>
			<div.categories role="tablist" aria-label="Категория событий">
				for option in categories
					<button type="button" role="tab" aria-label=option.label title=option.label aria-selected=(category == option.id) .active=(category == option.id) @click=(do choose(option.id))>
						<matreshka-icon name=option.icon>
						<span> option.label
			<div.filters>
				<matreshka-journal-scope value=scope change=(do(value) narrow(value))>
				<label.search>
					<matreshka-icon.search-icon name="magnifying-glass">
					<input type="search" bind=query @input=search placeholder=t('journal.search') aria-label=t('journal.search')>
		if message
			<div.matreshka-error> message
		if groups.length
			for group in groups
				<section.group key=group.key>
					<h2> group.label
					<div.list>
						for event in group.events
							<matreshka-journal-row key=event.id event=event>
		else
			<div.empty>
				<matreshka-icon name="magnifying-glass">
				<strong> busy ? 'Загружаем события' : 'События не найдены'
				<p> 'Измените фильтры или поисковый запрос.' unless busy
		if events.length
			<footer>
				<span> "Показано {events.length} из {total} событий"
				if next
					<button type="button" disabled=busy @click=more>
						<span> busy ? 'Загружаем' : 'Показать ещё'
						<matreshka-icon name="caret-down">

	css self
		d:block maw:1120px mx:auto
		.head d:flex ai:flex-start jc:space-between g:28px
		.head small d:block mb:14px c:var(--matreshka-brand) fs:12px fw:750 ls:.1em tt:uppercase
		.head h1 c:var(--matreshka-navy) fs:36px lh:1.2 ls:-.02em
		.head p mt:12px c:var(--matreshka-muted) fs:18px
		.toolbar d:grid g:16px mt:39px
		.categories h:54px d:flex ai:center p:4px bd:1px solid var(--matreshka-line) rd:10px bgc:var(--matreshka-white)
		.categories button h:44px fl:1 d:flex ja:center g:8px p:0 12px bd:0 rd:8px bgc:transparent c:var(--matreshka-muted) fs:15px white-space:nowrap tween:all .16s ease
		.categories button matreshka-icon fl:0 0 auto fs:18px
		.categories button bgc@hover:var(--matreshka-soft) c@hover:var(--matreshka-brand)
		.categories button.active bgc:blue1 c:var(--matreshka-brand) fw:680 bxs:0 4px 14px blue6/8
		.filters d:grid gtc:260px minmax(260px,1fr) g:16px
		.search pos:relative h:54px d:flex ai:center
		.search-icon pos:absolute l:16px c:var(--matreshka-muted) fs:20px
		.search input w:100% h:100% p:0 16px 0 46px bd:1px solid var(--matreshka-line) rd:10px ol:none bgc:var(--matreshka-white) c:var(--matreshka-text) fs:15px c@placeholder:gray5
		.search input bc@focus:var(--matreshka-brand)
		> .matreshka-error mt:16px
		.group mt:40px
		.group + .group mt:20px
		.group h2 c:var(--matreshka-navy) fs:18px fw:720
		.list d:grid g:12px mt:11px
		.empty d:grid ja:center g:8px mih:360px mt:28px ta:center c:var(--matreshka-muted)
		.empty matreshka-icon fs:34px
		.empty strong c:var(--matreshka-text) fs:17px
		.empty p fs:14px
		footer mih:64px d:flex ai:center jc:space-between g:20px c:var(--matreshka-muted) fs:14px
		footer button h:42px d:inline-flex ai:center g:9px p:0 10px bd:0 bgc:transparent c:var(--matreshka-brand) fs:15px fw:600
		footer button matreshka-icon fs:18px
		@media(max-width: 1160px)
			.categories button px:10px
			.categories button span d:none
		@media(max-width: 720px)
			.head h1 fs:31px
			.head p fs:16px
			.toolbar mt:24px
			.filters gtc:1fr
			.categories button fs:13px
			.group mt:28px
		@media(max-width: 460px)
			.head d:block
			footer ai:flex-start fld:column py:14px
