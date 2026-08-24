import {intl, t} from './i18n.imba'
import {fmt, localNetworkValues, routeActions, routeIcons, routeMatchers} from './context.imba'

tag outpost-action-picker
	value = 'DIRECT'
	change = null
	plain = false
	open = false

	def toggle
		open = !open

	def close
		open = false

	def choose next
		open = false
		change(next) if change and next != value

	<self .open=open .plain=plain>
		if open
			<global @click.outside=close @keydown.esc=close>
		<button.trigger type="button" .direct=(value == 'DIRECT') .proxy=(value == 'PROXY') .block=(value == 'BLOCK') @click.stop=toggle aria-haspopup="menu" aria-expanded=open>
			<span.dot>
			<span> fmt.action(value)
			<outpost-icon name="caret-down">
		if open
			<div.menu role="menu" ease>
				for item in routeActions
					<button.option type="button" role="menuitem" .active=(item.id == value) .direct=(item.id == 'DIRECT') .proxy=(item.id == 'PROXY') .block=(item.id == 'BLOCK') @click.stop=choose(item.id)>
						<span.dot>
						<span> t(item.label)
						if item.id == value
							<outpost-icon name="check">

	css self
		d:block pos:relative miw:0
		.trigger w:100% mih:34px d:grid gtc:8px minmax(0, 1fr) 13px ai:center g:7px p:0 9px bd:0 rd:8px ta:left fs:12px fw:750 cur:pointer tween:background-color 150ms ease, color 150ms ease
		.trigger > span:nth-child(2) of:hidden text-overflow:ellipsis white-space:nowrap
		.trigger > outpost-icon fs:13px tween:transform 150ms ease
		&.open .trigger > outpost-icon transform:rotate(180deg)
		.trigger.direct bgc:var(--outpost-success-soft) c:var(--outpost-success)
		.trigger.proxy bgc:var(--outpost-auth-start) c:var(--outpost-brand)
		.trigger.block bgc:red1 c:red6
		.dot s:7px rd:50% bgc:currentColor
		.menu pos:absolute t:calc(100% + 7px) r:0 zi:30 w:190px p:6px bd:1px solid var(--outpost-line) rd:11px bgc:white bxs:0 14px 34px black/14 ease:180ms cubic-bezier(.22,1,.36,1) o@off:0 y@off:-6px scale@off:.98 transform-origin:top right
		.option w:100% mih:42px d:grid gtc:8px 1fr 18px ai:center g:10px p:0 10px bd:0 rd:8px bgc:white c:var(--outpost-text) ta:left fs:13px fw:650
		.option bgc@hover:var(--outpost-soft)
		.option.active bgc:var(--outpost-soft)
		.option > outpost-icon c:var(--outpost-brand) fs:15px
		.option.direct .dot c:var(--outpost-success)
		.option.proxy .dot c:var(--outpost-brand)
		.option.block .dot c:red6
		&.plain .trigger h:42px bd:1px solid var(--outpost-line) bgc:white c:var(--outpost-text)
		&.plain .trigger bgc@hover:var(--outpost-soft)
		&.plain .trigger.direct .dot c:var(--outpost-success)
		&.plain .trigger.proxy .dot c:var(--outpost-brand)
		&.plain .trigger.block .dot c:red6

tag outpost-matcher-picker
	value = 'DOMAIN'
	change = null
	open = false

	get selected
		routeMatchers.find(do(item) item.id == value) or routeMatchers[0]

	def toggle
		open = !open

	def close
		open = false

	def choose next
		open = false
		change(next) if change and next != value

	<self .open=open>
		if open
			<global @click.outside=close @keydown.esc=close>
		<button.trigger type="button" @click.stop=toggle aria-haspopup="listbox" aria-expanded=open>
			<span> t(selected.label)
			<outpost-icon name="caret-down">
		if open
			<div.menu role="listbox" ease>
				for item in routeMatchers
					<button.option type="button" role="option" aria-selected=(item.id == value) .active=(item.id == value) @click.stop=choose(item.id)>
						<div>
							<strong> t(item.label)
							<small> t(item.hint)
						if item.id == value
							<outpost-icon name="check">

	css self
		d:block pos:relative miw:0
		.trigger w:100% h:42px d:grid gtc:minmax(0, 1fr) 14px ai:center g:8px p:0 12px bd:1px solid var(--outpost-line) rd:9px bgc:white c:var(--outpost-text) ta:left fs:13px fw:700 cur:pointer tween:border-color 150ms ease, box-shadow 150ms ease, background-color 150ms ease
		.trigger bd-c@hover:var(--outpost-brand) bgc@hover:var(--outpost-soft)
		.trigger > span of:hidden text-overflow:ellipsis white-space:nowrap
		.trigger > outpost-icon fs:14px c:var(--outpost-muted) tween:transform 150ms ease
		&.open .trigger bd-c:var(--outpost-brand) bxs:0 0 0 2px var(--outpost-auth-start)
		&.open .trigger > outpost-icon transform:rotate(180deg)
		.menu pos:absolute t:calc(100% + 7px) l:0 zi:40 w:230px p:6px bd:1px solid var(--outpost-line) rd:11px bgc:white bxs:0 16px 36px black/15 ease:180ms cubic-bezier(.22,1,.36,1) o@off:0 y@off:-6px scale@off:.98 transform-origin:top left
		.option w:100% mih:48px d:grid gtc:minmax(0, 1fr) 18px ai:center g:10px p:7px 10px bd:0 rd:8px bgc:white c:var(--outpost-text) ta:left cur:pointer
		.option bgc@hover:var(--outpost-soft)
		.option.active bgc:var(--outpost-auth-start)
		.option strong, .option small d:block
		.option strong fs:13px fw:700
		.option small mt:3px c:var(--outpost-muted) fs:10px
		.option > outpost-icon c:var(--outpost-brand) fs:15px

tag outpost-route-create
	store = null
	routes = null
	index = 1
	matcher = 'DOMAIN'
	value = ''
	action = 'DIRECT'
	saving = false
	error = null

	get selected
		routeMatchers.find(do(item) item.id == matcher) or routeMatchers[0]

	get valid?
		value.trim!.length > 0

	def reset
		matcher = 'DOMAIN'
		value = ''
		action = 'DIRECT'
		error = null

	def close
		return if saving
		reset!
		routes.cancel!

	def submit
		return unless valid?
		return if saving
		saving = true
		error = null
		try
			await store.mutate('POST', '/api/v1/routes', {action: action, matcher: matcher, value: value, enabled: true})
			reset!
			routes.created!
		catch issue
			error = issue.message
		finally
			saving = false

	<self ease>
		<form @submit.prevent=submit>
			<button.save type="submit" disabled=(saving or !valid?) aria-label=(saving ? t('Сохраняем правило') : t('Сохранить правило'))>
				<outpost-icon name=(saving ? 'spinner-gap' : 'floppy-disk')>
			<span.number>
				index
				<span.mark title=t('Новое правило')>
			<div.field>
				<outpost-icon name=routeIcons[matcher]>
				<input bind=value placeholder=t(selected.placeholder) aria-label=t(selected.label) autofocus>
			<outpost-matcher-picker value=matcher change=(do(next) matcher = next)>
			<outpost-action-picker value=action change=(do(next) action = next)>
			<button.remove type="button" disabled=saving @click=close aria-label=t('Удалить новое правило')>
				<outpost-icon name="trash">
			if error
				<div.error role="alert">
					<outpost-icon name="warning-circle">
					<span> error

	css self
		position:relative
		z-index:24
		min-height:76px
		display:grid
		grid-template-columns:24px 34px minmax(135px, 1fr) 152px 152px 34px
		align-items:center
		gap:12px
		padding:10px 14px
		border-top:1px solid var(--outpost-line)
		background:var(--outpost-soft)
		box-shadow:inset 3px 0 0 var(--outpost-brand)
		ease:240ms cubic-bezier(.22,1,.36,1)
		o@off:0
		y@off:-8px
		scale@off:.99
		transform-origin:top center
		.remove, .save s:32px d:grid ja:center p:0 bd:0 rd:8px bgc:transparent cur:pointer tween:background-color 150ms ease, color 150ms ease
		.save w:24px
		.remove c:var(--outpost-muted) fs:16px
		.remove@hover bgc:red1 c:red6
		.number s:32px pos:relative d:grid ja:center bd:1px solid var(--outpost-brand) rd:8px bgc:var(--outpost-auth-start) c:var(--outpost-brand) fs:13px fw:750
		.mark pos:absolute t:-4px r:-4px s:10px bd:2px solid white rd:50% bgc:var(--outpost-brand) bxs:0 2px 6px black/18
		form d:contents
		.field d:grid gtc:24px minmax(0, 1fr) ai:center g:9px miw:0
		.field > outpost-icon c:var(--outpost-navy) fs:21px
		input
			w:100% h:42px p:0 12px bd:1px solid var(--outpost-line) rd:9px bgc:white c:var(--outpost-text) fs:13px ol:none tween:border-color 150ms ease, box-shadow 150ms ease
			@focus border-color:var(--outpost-brand); bxs:0 0 0 2px var(--outpost-auth-start)
		.save
			c:var(--outpost-brand) fs:17px
			@hover bgc:var(--outpost-auth-start)
			@disabled o:.45 cur:not-allowed
		.save outpost-icon.ph-spinner-gap animation:spin 1s linear infinite
		.error gc:3/-1 d:flex ai:flex-start g:7px p:8px 10px bd:1px solid red2 rd:8px bgc:red1 c:red7 fs:12px lh:1.4
		.error outpost-icon fl:0 0 auto mt:1px fs:15px
		.error span miw:0
		@media(max-width: 760px)
			grid-template-columns:22px 32px minmax(0, 1fr) 34px
			g:7px
			p:12px
			.save grid-column:1; grid-row:1 / 4
			.number grid-column:2; grid-row:1 / 4
			.field grid-column:3; grid-row:1
			outpost-matcher-picker grid-column:3; grid-row:2; mt:7px
			outpost-action-picker grid-column:3; grid-row:3; w:152px; mt:7px
			.remove grid-column:4; grid-row:1 / 4
			.error gc:3/-1
		@media(prefers-reduced-motion: reduce)
			ease:1ms linear

tag outpost-route-system
	routes = null
	rules = []
	changed = false

	get action
		rules[0] and rules[0].action or 'DIRECT'

	def change value
		routes.update(rules[0].id, {action: value}) if routes and rules[0]

	<self.system-route .changed=changed>
		<span.pin title=t('Системное правило закреплено')><outpost-icon name="lock-key">
		<span.number>
			'1'
			if changed
				<span.mark title=t('Неопубликованное изменение')>
		<div.rule>
			<outpost-icon name="network">
			<div>
				<strong> t('Локальная сеть')
				<small> t('Системное правило · 3 частных диапазона')
		<span.kind> 'IP / CIDR × 3'
		<outpost-action-picker value=action change=change>

	css self
		min-height:74px
		position:relative
		z-index:2
		display:grid
		grid-template-columns:24px 34px minmax(135px, 1fr) 152px 152px 34px
		align-items:center
		gap:12px
		padding:0 14px
		border-top:1px solid var(--outpost-line)
		background:var(--outpost-section)
		box-shadow:inset 3px 0 0 var(--outpost-line)
		&:focus-within z-index:4
		.pin s:24px d:grid ja:center c:var(--outpost-brand) fs:15px
		.number s:32px pos:relative d:grid ja:center bd:1px solid var(--outpost-line) rd:8px bgc:white c:var(--outpost-text) fs:13px fw:700
		&.changed .number bd-c:var(--outpost-brand) bgc:var(--outpost-auth-start) c:var(--outpost-brand)
		.mark pos:absolute t:-4px r:-4px s:10px bd:2px solid white rd:50% bgc:var(--outpost-brand) bxs:0 2px 6px black/18
		.rule miw:0 d:grid gtc:24px minmax(0, 1fr) ai:center g:9px
		.rule > outpost-icon c:var(--outpost-navy) fs:21px
		.rule strong, .rule small d:block
		.rule strong of:hidden c:var(--outpost-navy) fs:14px fw:700 text-overflow:ellipsis white-space:nowrap
		.rule small mt:3px c:var(--outpost-muted) fs:10px
		.kind c:var(--outpost-muted) fs:12px ta:center white-space:nowrap
		@media(max-width: 680px)
			grid-template-columns:22px 32px minmax(0, 1fr) 34px
			g:7px
			p:10px 12px
			.pin grid-column:1; grid-row:1 / 3
			.number grid-column:2; grid-row:1 / 3
			.rule grid-column:3; grid-row:1
			outpost-action-picker grid-column:3; grid-row:2; w:152px; mt:7px
			.kind d:none

tag outpost-route-row
	routes = null
	rule = null
	index = 0
	changed = false
	hinting = false
	exception = null
	drag = null
	over = null
	busy = false

	def icon
		return 'infinity' if rule.matcher == 'SUFFIX' and rule.value == '*'
		routeIcons[rule.matcher] or 'globe-hemisphere-west'

	def label
		return t('Всё остальное') if rule.matcher == 'SUFFIX' and rule.value == '*'
		fmt.matcher(rule.matcher)

	def note
		return t('Последнее правило · действие можно изменить') if fixed?
		return t('Системное правило · действие можно изменить') if rule.source == 'system'
		t('Пользовательское правило')

	get fixed?
		rule.matcher == 'SUFFIX' and rule.value == '*'

	def key e
		if e.key == 'ArrowUp'
			e.preventDefault!
			routes.step(rule, -1)
		elif e.key == 'ArrowDown'
			e.preventDefault!
			routes.step(rule, 1)

	<self.route-row .system=rule.locked .changed=changed .hinting=hinting .busy=busy .dragging=(drag == rule.id) .over=(over == rule.id and drag != rule.id) data-id=rule.id aria-busy=busy>
		<button.handle type="button" disabled=rule.locked @touch.moved(5px,'y')=routes.touch(rule,e) @keydown=key aria-label=(rule.locked ? t('Системное правило закреплено') : t('Перетащить правило. Стрелки вверх и вниз меняют порядок'))>
			<outpost-icon name=(rule.locked ? 'lock-key' : 'dots-six-vertical')>
		<span.number>
			index + 1
			if changed
				<span.mark title=t('Неопубликованное изменение')>
		<div.rule>
			<outpost-icon name=icon!>
			<div>
				if fixed?
					<strong> t('Всё остальное')
				else
					<strong.technical> rule.value
				<small> note!
			if exception
				<span.marker tabindex="0" aria-describedby="hint-{rule.id}" @mouseenter=(hinting = true) @mouseleave=(hinting = false) @focus=(hinting = true) @blur=(hinting = false)>
					<outpost-icon name="info">
					<span.hint id="hint-{rule.id}" role="tooltip">
						<strong> t('Исключение для {value} · правило {index}', {value: exception.rule.value, index: exception.index + 1})
						<span> t('Проверяется раньше, поэтому применяется действие «{action}».', {action: fmt.action(rule.action).toLowerCase!})
		<span.kind> fixed? ? '' : label!
		<outpost-action-picker value=rule.action change=(do(value) routes.update(rule.id, {action: value}))>
		if !rule.locked
			<button.remove type="button" disabled=busy @click.stop=routes.drop(rule.id) aria-label=t('Удалить правило')>
				<outpost-icon name=(busy ? 'spinner-gap' : 'trash')>

	css self
		min-height: 74px
		position: relative
		display: grid
		grid-template-columns: 24px 34px minmax(135px, 1fr) 152px 152px 34px
		align-items: center
		gap: 12px
		padding: 0 14px
		border-top: 1px solid var(--outpost-line)
		background: #fff
		transition: background .16s ease, box-shadow .16s ease, opacity .16s ease
		&.system background:var(--outpost-section); box-shadow:inset 3px 0 0 var(--outpost-line)
		&:hover z-index: 4
		&:focus-within z-index: 4
		&.hinting z-index: 20
		&.dragging z-index:5; background:#F8FBFF; box-shadow:inset 3px 0 0 #0B56D9; opacity:.78
		&.over box-shadow: inset 0 2px 0 #0B56D9
		&.busy opacity:.62
		.handle, .remove
			width: 32px
			height: 32px
			display: grid
			place-items: center
			padding: 0
			border: 0
			border-radius: 8px
			background: transparent
			color: #8A9AB7
		.handle
			width: 24px
			cursor: grab
			font-size: 18px
			touch-action: none
			user-select: none
			@hover background: #F2F6FC
			@active cursor: grabbing
			@disabled
				cursor: default
				background: transparent
				color: #B6BFCE
		.remove@disabled cur:wait
		.remove outpost-icon.ph-spinner-gap animation:spin 1s linear infinite
		.number
			width: 32px
			height: 32px
			position: relative
			display: grid
			place-items: center
			border: 1px solid var(--outpost-line)
			border-radius: 8px
			color: #273452
			font-size: 13px
			font-weight: 700
		&.changed .number border-color:var(--outpost-brand); background:var(--outpost-auth-start); color:var(--outpost-brand)
		.mark pos:absolute t:-4px r:-4px s:10px bd:2px solid white rd:50% bgc:var(--outpost-brand) bxs:0 2px 6px black/18
		.rule
			min-width: 0
			display: grid
			grid-template-columns: 24px minmax(0, 1fr) auto
			align-items: center
			gap: 9px
			> outpost-icon color: #17213D; font-size: 21px
			strong, small display: block
			strong
				overflow: hidden
				color: #17213D
				font-size: 14px
				font-weight: 700
				text-overflow: ellipsis
				white-space: nowrap
			small margin-top: 3px; color: #8A94A8; font-size: 10px
		.marker
			width: 20px
			height: 20px
			position: relative
			display: grid
			place-items: center
			border-radius: 50%
			color: #0B56D9
			font-size: 16px
			outline: none
			cursor: help
			.hint
				width: 244px
				position: absolute
				left: -46px
				top: 27px
				z-index: 10
				display: block
				padding: 12px 14px
				border: 1px solid var(--outpost-line)
				border-radius: 9px
				background: #fff
				box-shadow: 0 10px 28px #14213D24
				color: #42506D
				font-size: 12px
				line-height: 1.45
				opacity: 0
				pointer-events: none
				transform: translateY(-4px)
				transition: .15s ease
				strong display: block; color: #273452; font-size: 12px
				span display: block; margin-top: 5px
			&:hover .hint, &:focus-visible .hint
				opacity: 1
				transform: translateY(0)
		.kind color:#71809D; font-size:12px; text-align:center; white-space:nowrap
		.remove
			font-size: 16px
			@hover background: #FFF0EF; color: #D92D20
		@media(max-width: 680px)
			grid-template-columns: 22px 32px minmax(0, 1fr) 34px
			gap: 7px
			padding: 10px 12px
			.handle grid-column: 1; grid-row: 1 / 3
			.number grid-column: 2; grid-row: 1 / 3
			.rule grid-column: 3; grid-row: 1
			outpost-action-picker grid-column: 3; grid-row: 2; width: 152px; margin-top: 7px
			.remove grid-column: 4; grid-row: 1 / 3
			.kind display: none
			.rule small display: none

tag outpost-route-modes
	basics = false
	clients = false

	def toggle section
		if section == 'basics'
			basics = !basics
		else
			clients = !clients

	<self>
		<section.guide .expanded=basics>
			<button.guide-head type="button" @click=toggle('basics') aria-expanded=basics>
				<span.guide-icon><outpost-icon name="info">
				<span.guide-label>
					<strong> t('Как работают правила')
					<small> t('Что выбирает правило, почему важен порядок и откуда берутся GeoSite и GeoIP')
				<outpost-icon.chevron name="caret-down">
			<div.guide-body .open=basics>
				<div.guide-content>
					<div.guide-inner>
						<div.basics>
							<section.concept>
								<span.step> '1'
								<div>
									<h3> t('Условие и действие')
									<p> t('Правило находит трафик по домену, IP-адресу, сети или геонабору. Затем оно выбирает действие: отправить соединение напрямую, через прокси или полностью заблокировать.')
									<small> t('Пример: example.com → Прокси')
							<section.concept>
								<span.step> '2'
								<div>
									<h3> t('Проверка сверху вниз')
									<p> t('Применяется первое подходящее правило. Поэтому точное исключение ставят выше широкого: например, apple.com — напрямую, а всё остальное отправляют через прокси.')
									<small> t('Приоритет правил: сверху вниз')
							<section.concept>
								<span.step> '3'
								<div>
									<h3> t('GeoSite и GeoIP')
									<p> t('GeoSite — готовый набор доменов сервиса или категории, GeoIP — набор диапазонов IP страны. Указывайте только код набора, без префиксов domain: или geosite:.')
									<small> t('Пример: GeoSite google · GeoIP ru · весь .ru: суффикс ru')
						<p.delivery> t('routes.rulesets.delivery')
		<section.guide .expanded=clients>
			<button.guide-head type="button" @click=toggle('clients') aria-expanded=clients>
				<span.guide-icon><outpost-icon name="devices">
				<span.guide-label>
					<strong> t('Правила в клиентских приложениях')
					<small> t('Почему один опубликованный список может выглядеть по-разному')
				<outpost-icon.chevron name="caret-down">
			<div.guide-body .open=clients>
				<div.guide-content>
					<div.guide-inner>
						<div.modes>
							<section.mode.exact>
								<div.mode-head>
									<strong> t('Последовательные правила')
									<span> t('Основной формат')
								<p.clients> t('Один список · условие и действие')
								<p.summary> t('Приложение читает один общий список сверху вниз. Каждое правило сразу содержит действие, поэтому порядок, приоритет и точные исключения сохраняются полностью.')
								<small.example> t('Например: Mihomo в Everywhere')
							<section.mode.grouped>
								<div.mode-head>
									<strong> t('Правила по группам')
									<span> t('Адаптация')
								<p.clients> t('Три группы · по типу действия')
								<p.summary> t('Приложение ожидает не общий список, а три отдельные группы: «Напрямую», «Прокси» и «Блокировать». Outpost раскладывает каждое правило в группу его действия.')
								<small.example> t('Например: INCY')
						<p.delivery> t('После публикации Outpost выбирает подходящий формат при выдаче подписки. Настраивать отдельные наборы правил для разных приложений не нужно.')

	css self
		d:grid g:12px
		.guide d:block bd:1px solid var(--outpost-line) rd:13px bgc:white of:hidden
		.guide-head w:100% d:grid gtc:42px 1fr 18px ai:center g:12px p:14px 18px bd:0 bgc:var(--outpost-soft) c:var(--outpost-text) ta:left cur:pointer
		.guide-icon s:42px d:grid ja:center rd:11px bgc:var(--outpost-auth-start) c:var(--outpost-brand) fs:20px
		.guide-label strong, .guide-label small d:block
		.guide-label strong c:var(--outpost-navy) fs:15px fw:750
		.guide-label small mt:4px c:var(--outpost-muted) fs:12px
		.chevron c:var(--outpost-muted) fs:15px tween:transform 160ms ease
		.guide.expanded .chevron transform:rotate(180deg)
		.guide-body d:grid gtr:0fr o:0 tween:grid-template-rows 260ms cubic-bezier(.22,1,.36,1), opacity 180ms ease
		.guide-body.open gtr:1fr o:1
		.guide-content mih:0 of:hidden
		.guide-inner p:0 18px 18px
		.basics d:grid gtc:repeat(3, minmax(0, 1fr)) g:12px
		.concept d:grid gtc:28px minmax(0, 1fr) ai:start g:11px p:16px bd:1px solid var(--outpost-line) rd:10px bgc:var(--outpost-soft)
		.step s:28px d:grid ja:center rd:8px bgc:var(--outpost-auth-start) c:var(--outpost-brand) fs:11px fw:800
		.concept h3 c:var(--outpost-text) fs:14px fw:750 lh:1.4
		.concept p mt:8px c:var(--outpost-muted) fs:12px lh:1.55
		.concept small d:block mt:12px c:var(--outpost-brand) fs:11px fw:650 lh:1.45
		.modes d:grid gtc:repeat(2, 1fr) gar:1fr ai:stretch g:12px
		.mode
			h:100% mih:172px d:flex fld:column p:18px bd:1px solid var(--outpost-line) rd:10px bgc:var(--outpost-soft) c:var(--outpost-muted)
			.mode-head
				d:flex ai:flex-start jc:space-between g:12px
				strong c:var(--outpost-text) fs:14px fw:750 lh:1.4
				span fl:0 0 auto p:5px 8px rd:7px bgc:white c:var(--outpost-muted) fs:10px fw:750
			.clients mt:20px c:var(--outpost-muted) fs:12px fw:650 lh:1.45
			.summary mt:12px c:var(--outpost-text) fs:13px lh:1.6
			.example d:block mt:auto pt:14px c:var(--outpost-brand) fs:11px fw:650
			&.exact
				.mode-head span bgc:var(--outpost-success-soft) c:var(--outpost-success)
			&.grouped
				.mode-head span bgc:var(--outpost-auth-start) c:var(--outpost-brand)
		.delivery mt:16px pt:14px border-top:1px solid var(--outpost-line) c:var(--outpost-muted) fs:12px lh:1.55
		@media(max-width: 1080px)
			.basics gtc:1fr
			.modes gtc:1fr
		@media(max-width: 520px)
			.guide-head gtc:36px 1fr 16px p:12px
			.guide-icon s:36px fs:18px
			.guide-inner p:0 12px 12px
			.concept padding:14px
			.mode h:auto mih:0 p:16px
			.mode-head fld:column g:10px

tag outpost-ruleset-banner
	store = null
	busy = false
	error = null

	get rulesets do store.data.system.rulesets or {status: 'idle', activeVersion: null, checkedAt: null, lastError: null}
	get failed? do !!error or !!rulesets.lastError
	get catalog
		return t('routes.rulesets.version', {version: rulesets.activeVersion}) if rulesets.activeVersion
		t('routes.rulesets.missing')
	get detail
		return error or rulesets.lastError if failed?
		return t('routes.rulesets.never') unless rulesets.checkedAt
		t('routes.rulesets.checked', {date: new Intl.DateTimeFormat(intl!, {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(rulesets.checkedAt))})

	def sync
		return if busy
		busy = true
		error = null
		try
			store.data.system.rulesets = await store.api('POST', '/api/v1/rulesets/refresh')
		catch issue
			error = issue.message
		finally
			busy = false
			imba.commit!

	<self .failed=failed?>
		<span.geo-mark><outpost-icon name="database">
		<div.geo-copy>
			<strong> t('routes.rulesets.title')
			<p> t('routes.rulesets.hint')
		<div.geo-control>
			<div.geo-status>
				<strong> catalog
				<small .error=failed?> detail
			<button.outpost-button.secondary.small type="button" disabled=busy @click=sync aria-label=t('routes.rulesets.refresh')>
				<outpost-icon name="arrows-clockwise" .checking=busy>
				<span> busy ? t('routes.rulesets.updating') : t('routes.rulesets.refresh')

	css self
		mt:24px d:grid gtc:46px minmax(0,1fr) minmax(310px,auto) ai:center g:16px p:18px bd:1px solid var(--outpost-auth-start) rd:13px bgc:var(--outpost-brand-soft)
		.geo-mark s:46px d:grid ja:center rd:12px bgc:var(--outpost-auth-start) c:var(--outpost-brand) fs:22px
		.geo-copy miw:0
		.geo-copy strong d:block c:var(--outpost-navy) fs:16px fw:750
		.geo-copy p mt:6px c:var(--outpost-muted) fs:12px lh:1.55
		.geo-control miw:310px d:grid gtc:minmax(130px,1fr) auto ai:center g:14px
		.geo-status miw:0
		.geo-status strong, .geo-status small d:block
		.geo-status strong c:var(--outpost-navy) fs:12px fw:750 of:hidden text-overflow:ellipsis white-space:nowrap
		.geo-status small mt:4px c:var(--outpost-muted) fs:10px lh:1.35 of:hidden text-overflow:ellipsis white-space:nowrap
		.geo-status small.error c:var(--outpost-danger)
		.outpost-button h:38px px:13px white-space:nowrap
		.outpost-button outpost-icon.checking animation:spin 1s linear infinite
		&.failed border-color:red2 bgc:red1
		&.failed .geo-mark bgc:red1 c:var(--outpost-danger)
		@media(max-width: 980px)
			gtc:46px minmax(0,1fr)
			.geo-control grid-column:2 miw:0
		@media(max-width: 600px)
			gtc:40px minmax(0,1fr) p:15px g:12px
			.geo-mark s:40px fs:19px
			.geo-control grid-column:1/-1 gtc:1fr
			.outpost-button w:100%

tag outpost-routes
	store = null
	drag = null
	over = null
	origin = []
	motions = {}
	creating = false
	saving = false
	publishing = false
	discarding = false
	error = null
	removing = new Set

	get baseline
		store.data.routes.published and store.data.routes.published.rules or []

	def local rule
		rule.source == 'system' and rule.matcher == 'IP_CIDR' and localNetworkValues.includes(rule.value)

	get locals
		store.data.routes.draft.filter do(rule) local(rule)

	get shown
		store.data.routes.draft.filter do(rule) !local(rule)

	get grouped?
		locals.some do(rule) changed(rule)

	get dirty?
		store.data.routes.dirty

	get busy?
		saving or publishing or discarding or removing.size > 0

	get publishable?
		dirty? and !busy?

	get undoable?
		store.data.routes.published and publishable?

	get changes
		let total = 0
		let group = false
		for rule in store.data.routes.draft
			if local(rule)
				group = true if changed(rule)
			else
				total++ if changed(rule)
		total++ if group
		for rule in baseline
			total++ if !local(rule) and !store.data.routes.draft.some(do(item) item.id == rule.id)
		total

	def publish
		return unless publishable?
		publishing = true
		error = null
		try
			await store.mutate('POST', '/api/v1/routes/publish', {note: ''})
		catch issue
			error = issue.message
		finally
			publishing = false

	def discard
		return unless undoable?
		discarding = true
		error = null
		try
			await store.mutate('POST', '/api/v1/routes/discard')
		catch issue
			error = issue.message
		finally
			discarding = false

	def drop id
		return if removing.has(id)
		removing.add(id)
		error = null
		imba.commit!
		try
			await store.mutate('DELETE', "/api/v1/routes/{id}")
		catch issue
			error = issue.message
		finally
			removing.delete(id)
			imba.commit!

	def update id, patch
		error = null
		try
			await store.mutate('PATCH', "/api/v1/routes/{id}", patch)
		catch issue
			error = issue.message

	def add
		creating = true
		error = null
		store.error = null
		imba.commit!

	def cancel
		creating = false
		store.error = null
		imba.commit!

	def created
		creating = false
		error = null
		imba.commit!

	def fixed rule
		rule.matcher == 'SUFFIX' and rule.value == '*'

	def slot rule
		shown.findIndex(do(item) item.id == rule.id) + 1 + (creating ? 1 : 0)

	def position rule
		store.data.routes.draft.findIndex do(item) item.id == rule.id

	def changed rule
		return true unless store.data.routes.published
		const before = baseline.find do(item) item.id == rule.id
		return true unless before
		return true if before.action != rule.action or before.matcher != rule.matcher or before.value != rule.value or Boolean(before.enabled) != Boolean(rule.enabled)
		const current = store.data.routes.draft.filter do(item) baseline.some(do(entry) entry.id == item.id)
		const previous = baseline.filter do(item) store.data.routes.draft.some(do(entry) entry.id == item.id)
		current.findIndex(do(item) item.id == rule.id) != previous.findIndex(do(item) item.id == rule.id)

	def covers rule, parent
		return true if parent.matcher == 'SUFFIX' and parent.value == '*'
		return false if parent.matcher != 'SUFFIX'
		return false unless rule.matcher == 'DOMAIN' or rule.matcher == 'SUFFIX'
		const child = rule.value.replace(/^\./, '').toLowerCase!
		const value = parent.value.replace(/^\./, '').toLowerCase!
		child == value or child.endsWith(".{value}")

	def exception rule, index
		return null if rule.locked
		const rules = store.data.routes.draft
		for parent in rules.slice(index + 1)
			return {rule: parent, index: slot(parent)} if !fixed(parent) and parent.action != rule.action and covers(rule, parent)
		null

	def touch rule, e
		return if rule.locked
		if !drag
			drag = rule.id
			over = rule.id
			origin = store.data.routes.draft.map do(item) item.id
		const target = hit(e.clientY)
		if target
			over = target.id
			move(drag, target.id, target.after) if target.id != drag
		if e.ended?
			origin = []
			persist!
			end!

	def places
		const value = {}
		for row in self.querySelectorAll('.route-row')
			value[row.getAttribute('data-id')] = row.getBoundingClientRect!.top
		value

	def animate positions, source
		window.requestAnimationFrame do
			for row in self.querySelectorAll('.route-row')
				const id = row.getAttribute('data-id')
				if id != source and positions[id] != undefined
					const offset = positions[id] - row.getBoundingClientRect!.top
					if Math.abs(offset) > .5
						motions[id].cancel! if motions[id]
						motions[id] = row.animate([{transform: "translateY({offset}px)"}, {transform: 'translateY(0)'}], {duration: 180, easing: 'cubic-bezier(.22,1,.36,1)'})

	def move source, target, after = false
		return if !source or !target or source == target
		const rules = store.data.routes.draft
		const positions = places!
		const from = rules.findIndex do(rule) rule.id == source
		return if from < 0 or rules[from].locked
		const next = rules.slice!
		const moved = next.splice(from, 1)[0]
		let to = next.findIndex do(rule) rule.id == target
		return if to < 0
		after = false if fixed(next[to])
		to++ if after
		const last = next.findIndex do(rule) fixed(rule)
		to = Math.min(to, last) if last >= 0
		next.splice(to, 0, moved)
		return if next.map(do(rule) rule.id).join('|') == rules.map(do(rule) rule.id).join('|')
		store.data.routes.draft = next
		imba.commit!
		animate(positions, source)

	def hit y
		for row in self.querySelectorAll('.route-row')
			const rect = row.getBoundingClientRect!
			if y >= rect.top and y <= rect.bottom
				return {id: row.getAttribute('data-id'), after: y > rect.top + rect.height / 2}
		null

	def persist
		return if saving
		saving = true
		error = null
		try
			const ids = store.data.routes.draft.map do(rule) rule.id
			await store.mutate('POST', '/api/v1/routes/reorder', {ids: ids})
		catch issue
			error = issue.message
			await store.load!
		finally
			saving = false

	def step rule, delta
		const rules = store.data.routes.draft
		const from = rules.findIndex do(item) item.id == rule.id
		const to = from + delta
		return if from < 0 or to < 0 or to >= rules.length or rule.locked
		return if rules[to].locked
		return if delta > 0 and fixed(rules[to])
		move(rule.id, rules[to].id, delta > 0)
		persist!

	def end
		if drag and origin.length
			const current = store.data.routes.draft
			const rules = new Map(current.map(do(rule) [rule.id, rule]))
			const restored = origin.map(do(id) rules.get(id)).filter(Boolean)
			store.data.routes.draft = restored if restored.length == current.length
			imba.commit!
		drag = null
		over = null
		origin = []

	<self>
		<div.route-top>
			<span.eyebrow> t('УПРАВЛЕНИЕ ТРАФИКОМ')
			<outpost-header title=t('routes.title') subtitle=t('Один порядок правил — сервер подберёт формат при запросе подписки')>
		<outpost-ruleset-banner store=store>
		<section.rule-card.outpost-card>
			<header.card-head>
				<div>
					<h2> t('Порядок правил')
					<p> t('Правила применяются сверху вниз. Перетаскивайте их, чтобы изменить приоритет.')
				<button.outpost-button.secondary.small type="button" disabled=creating @click=add>
					<outpost-icon name="plus">
					<span> t('routes.add')
			if locals.length
				<outpost-route-system routes=self rules=locals changed=grouped?>
			if creating
				<outpost-route-create key="new-route" store=store routes=self index=2>
			for rule in shown
				<outpost-route-row key=rule.id routes=self rule=rule index=slot(rule) changed=changed(rule) exception=exception(rule,position(rule)) drag=drag over=over busy=removing.has(rule.id)>
			if error
				<div.route-error role="alert">
					<outpost-icon name="warning-circle">
					<div>
						<strong> t('Проверьте правила')
						<span> error
					<button type="button" @click=(do error = null) aria-label=t('Закрыть сообщение')><outpost-icon name="x">
			<div.rule-footer .dirty=dirty?>
				<div.change-state>
					<span.state-icon><outpost-icon name=(dirty? ? 'pencil-simple' : 'check-circle')>
					<div>
						<strong> dirty? ? t('Изменено правил: {count}', {count: changes}) : t('Изменений нет')
						<small> dirty? ? t('Синие точки показывают, что изменится после публикации.') : t('Все текущие правила уже опубликованы.')
				<div.footer-actions>
					<button.outpost-button.quiet type="button" disabled=!undoable? @click=discard>
						<outpost-icon name=(discarding ? 'spinner-gap' : 'arrow-counter-clockwise')>
						<span> discarding ? t('Отменяем…') : t('Отменить изменения')
					<button.outpost-button type="button" disabled=!publishable? @click=publish>
						<outpost-icon name=(publishing ? 'spinner-gap' : 'upload-simple')>
						<span> publishing ? t('Публикуем…') : t('action.publish')
		<outpost-route-modes>

	css self
		display: block
		.route-top d:block
		.eyebrow display: block; margin-bottom: 14px; color: #0B56D9; font-size: 12px; font-weight: 750; letter-spacing: .1em
		outpost-route-modes margin-top: 18px
		.rule-card
			margin-top: 18px
			overflow: visible
			.card-head display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 20px 18px
			h2 color: #17213D; font-size: 18px
			.card-head p margin-top: 10px; color: #71809D; font-size: 13px
		.rule-footer d:flex ai:center jc:space-between g:18px p:16px 18px border-top:1px solid var(--outpost-line)
		.route-error d:grid gtc:20px minmax(0, 1fr) 30px ai:center g:10px p:12px 18px border-top:1px solid red2 bgc:red1 c:red7 fs:12px
		.route-error > outpost-icon fs:18px
		.route-error strong, .route-error span d:block
		.route-error strong fw:750
		.route-error span mt:3px lh:1.4
		.route-error button s:30px d:grid ja:center p:0 bd:0 rd:8px bgc:transparent c:red7 cur:pointer
		.route-error button bgc@hover:red2
		.change-state d:grid gtc:38px minmax(0, 1fr) ai:center g:11px
		.state-icon s:38px d:grid ja:center rd:10px bgc:var(--outpost-success-soft) c:var(--outpost-success) fs:19px
		.rule-footer.dirty .state-icon bgc:var(--outpost-auth-start) c:var(--outpost-brand)
		.change-state strong, .change-state small d:block
		.change-state strong c:var(--outpost-text) fs:13px fw:750
		.change-state small mt:4px c:var(--outpost-muted) fs:11px lh:1.35
		.footer-actions d:flex fl:0 0 auto g:9px
		.footer-actions .outpost-button outpost-icon.ph-spinner-gap animation:spin 1s linear infinite
		@media(min-width: 1361px)
			width: calc(100% + 48px)
			margin-left: -24px
		@media(max-width: 760px)
			outpost-route-modes margin-top: 18px
			.rule-card margin-top:24px
			.rule-card .card-head align-items: stretch; flex-direction: column
			.rule-card .card-head .outpost-button width: 100%
			.rule-footer ai:stretch fld:column
			.footer-actions d:grid gtc:1fr 1fr
			.footer-actions .outpost-button p:0 10px
