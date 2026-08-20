import {t} from './i18n.imba'

tag outpost-protocols-overview
	store = null
	checking = false
	checked = false

	get engines
		const versions = store.data.system.versions
		const hysteria = versions.find do(item) item.engine == 'hysteria'
		const xray = versions.find do(item) item.engine == 'xray'
		[
			{id: 'hysteria', name: 'Hysteria 2', icon: 'wave-sine', service: 'hysteria-server', connection: 'UDP 443 · основной', version: hysteria..installed_version or hysteria..desired_version or '—', config: store.data.engineConfigs.hysteria}
			{id: 'xray', name: 'Xray', icon: 'shield', service: 'xray', connection: 'VLESS · XHTTP · TCP 443', version: xray..installed_version or xray..desired_version or '—', config: store.data.engineConfigs.xray}
		]

	get healthy?
		engines.every do(engine) working(engine)

	get current?
		store.data.system.versions.every do(version) version.installed_version == version.desired_version

	get revisions
		let rows = []
		for engine in engines
			for revision in engine.config.revisions
				rows.push({...revision, engine: engine})
		rows.sort do(a, b) new Date(b.created_at).getTime! - new Date(a.created_at).getTime!

	get recent
		return revisions.slice(0, 2) if revisions.length
		engines.map do(engine) {engine: engine, version: engine.config.activeVersion, created_at: null, baseline: true}

	def working engine
		const service = store.data.system.services.find do(item) item.name == engine.service
		service and service.status == 'active'

	def revision engine
		engine.config.activeVersion ? "Ревизия №{engine.config.activeVersion}" : 'Базовая ревизия'

	def clock value
		return '—' unless value
		new Intl.DateTimeFormat('ru-RU', {hour: '2-digit', minute: '2-digit'}).format(new Date(value))

	def edit engine
		store.selected = {engine: engine.id, template: engine.config.template, activeVersion: engine.config.activeVersion}
		store.open('engine')
		imba.commit!

	def restart engine
		const service = store.data.system.services.find do(item) item.name == engine.service
		store.selected = service
		store.confirmation = await store.api('POST', '/api/v1/operations/preview', {action: 'service.restart', payload: {service: service.name}})
		store.open('confirm')
		imba.commit!

	def check
		return if checking
		checking = true
		try
			store.data.system = await store.api('GET', '/api/v1/system')
			checked = true
		finally
			checking = false
			imba.commit!

	def history
		store.selected = {revisions: revisions}
		store.open('history')

	<self>
		<span.engines-eyebrow> 'ПРОТОКОЛЫ'
		<outpost-header large=true title=t('engines.title') subtitle=t('engines.subtitle')>
		<div.health .pending=!healthy?>
			<outpost-icon name=(healthy? ? 'check-circle' : 'warning-circle')>
			<span> healthy? ? t('engines.healthy') : t('engines.attention')
		<section.engine-table>
			<header.engine-head>
				<span> t('engines.engine')
				<span> t('engines.state')
				<span> t('engines.version')
				<span> t('engines.connection')
				<span> t('engines.configuration')
				<span.actions> t('engines.actions')
			for engine in engines
				<div.engine-row>
					<div.engine-name>
						<span.engine-icon><outpost-icon name=engine.icon>
						<strong> engine.name
					<span.engine-status .pending=!working(engine)>
						<outpost-icon name="circle-fill">
						<span> working(engine) ? t('system.active') : t('system.unknown')
					<span.engine-version> engine.version
					<span.engine-connection> engine.connection
					<span.engine-revision> revision(engine)
					<button.configure type="button" @click=edit(engine)> t('engines.configure')
					<button.restart type="button" @click=(do restart(engine)) aria-label="Перезапустить {engine.name}" title="Перезапустить {engine.name}">
						<outpost-icon name="arrows-clockwise">
		<div.engine-lower>
			<section.outpost-card.update-card>
				<h2> t('engines.updates')
				<div.update-facts>
					<div><span><outpost-icon name="push-pin-simple">; <span> t('engines.pinned')
					<div><span><outpost-icon name="shield-check">; <span> t('engines.integrity')
				<div.update-state .available=!current?>
					<outpost-icon name=(current? ? 'check-circle' : 'arrow-circle-up')>
					<div>
						<strong> current? ? t('engines.no_updates') : t('engines.updates_available')
						<span> checked ? t('engines.checked') : t('engines.current_versions')
				<button.check type="button" disabled=checking @click=check>
					<outpost-icon name=(checking ? 'spinner-gap' : 'arrows-clockwise')>
					<span> checking ? t('engines.checking') : t('engines.check')
			<section.outpost-card.recent-card>
				<h2> t('engines.recent')
				<div.timeline>
					for item in recent
						<div.timeline-row>
							<outpost-icon name="circle-fill">
							<p>
								<strong> item.engine.name
								<span> " · {item.baseline ? t('engines.baseline') : "ревизия №{item.version} {t('engines.published')}"}"
							<time> clock(item.created_at)
				<button.history type="button" @click=history> t('engines.history')
		<p.engine-note>
			<outpost-icon name="info">
			<span> t('engines.note')

	css self
		display:block
		.engines-eyebrow d:block mb:16px c:var(--outpost-muted) fs:12px fw:750 ls:.1em
		.health d:flex ai:center g:11px mt:38px c:var(--outpost-success) fs:16px fw:600
		.health outpost-icon s:22px d:grid ja:center fs:22px
		.health.pending c:var(--outpost-warning)
		.engine-table mt:46px bd:1px solid var(--outpost-line) rd:13px bgc:var(--outpost-white) of:hidden
		.engine-head, .engine-row d:grid gtc:198px 140px 112px minmax(190px,1fr) 178px 100px 42px ai:center
		.engine-head min-height:68px p:0 26px c:var(--outpost-muted) fs:11px fw:750 ls:.05em tt:uppercase
		.engine-head .actions grid-column:6 / 8
		.engine-row min-height:118px p:0 26px border-top:1px solid var(--outpost-line) c:var(--outpost-muted) fs:14px
		.engine-name d:flex ai:center g:15px c:var(--outpost-text)
		.engine-name strong fs:15px fw:750
		.engine-icon s:52px d:grid ja:center fl:0 0 52px rd:11px bgc:var(--outpost-success-soft) c:var(--outpost-success)
		.engine-icon outpost-icon fs:26px
		.engine-status d:flex ai:center g:9px c:var(--outpost-success)
		.engine-status.pending c:var(--outpost-warning)
		.engine-status outpost-icon fs:7px
		.engine-version, .engine-connection, .engine-revision white-space:nowrap
		.configure p:0 bd:0 bgc:transparent c:var(--outpost-brand) fs:14px fw:600
		.configure@hover c:var(--outpost-brand-dark)
		.restart s:38px d:grid ja:center p:0 bd:0 rd:9px bgc:transparent c:var(--outpost-muted)
		.restart outpost-icon fs:20px
		.restart@hover bgc:var(--outpost-soft) c:var(--outpost-brand)
		.engine-lower d:grid gtc:.87fr 1fr g:16px mt:30px
		.engine-lower > section mih:300px p:28px 30px
		.engine-lower h2 c:var(--outpost-text) fs:20px
		.update-facts d:grid g:13px mt:26px pb:22px border-bottom:1px solid var(--outpost-line) c:var(--outpost-muted) fs:14px
		.update-facts > div > span d:flex ai:center g:12px
		.update-facts outpost-icon s:31px d:grid ja:center rd:8px bgc:var(--outpost-success-soft) c:var(--outpost-text) fs:15px
		.update-state d:grid gtc:42px 1fr ai:center g:14px mt:23px
		.update-state > outpost-icon s:42px d:grid ja:center c:var(--outpost-success) fs:40px
		.update-state.available > outpost-icon c:var(--outpost-warning)
		.update-state strong, .update-state span d:block
		.update-state strong c:var(--outpost-text) fs:15px
		.update-state span mt:5px c:var(--outpost-muted) fs:13px
		.check d:flex ai:center g:8px mt:22px p:0 bd:0 bgc:transparent c:var(--outpost-brand) fs:14px fw:650
		.check outpost-icon d:none
		.check outpost-icon.ph-spinner-gap d:inline-block animation:spin 1s linear infinite
		.check@hover c:var(--outpost-brand-dark)
		.timeline d:grid mt:27px ml:6px border-left:1px solid var(--outpost-line)
		.timeline-row pos:relative d:grid gtc:14px minmax(0,1fr) auto ai:center g:14px mih:64px
		.timeline-row > outpost-icon ml:-7px bgc:var(--outpost-white) c:var(--outpost-success) fs:13px
		.timeline-row p c:var(--outpost-muted) fs:14px
		.timeline-row strong c:var(--outpost-text)
		.timeline-row time c:var(--outpost-muted) fs:13px
		.history mt:16px p:20px 0 0 border-top:1px solid var(--outpost-line) border-right:0 border-bottom:0 border-left:0 bgc:transparent c:var(--outpost-brand) fs:14px fw:650
		.history@hover c:var(--outpost-brand-dark)
		.engine-note d:flex ai:center g:11px mt:28px c:var(--outpost-muted) fs:13px lh:1.45
		.engine-note outpost-icon fl:0 0 auto fs:18px
		@media(min-width:1361px)
			width:calc(100% + 18px)
			margin-left:-5px
		@media(max-width:1200px)
			.engine-head d:none
			.engine-row gtc:minmax(190px,1.2fr) 130px 100px minmax(175px,1fr) 98px 38px; g:12px; p:18px 20px
			.engine-row .engine-revision d:none
			.engine-row .configure grid-column:5
			.engine-row .restart grid-column:6
		@media(max-width:900px)
			width:100%
			.engine-row gtc:minmax(0,1fr) auto; min-height:0; g:11px; p:20px
			.engine-name grid-column:1
			.engine-status grid-column:2
			.engine-version, .engine-connection, .engine-revision grid-column:1 / -1
			.engine-revision d:block
			.configure grid-column:1
			.restart grid-column:2; grid-row:5
			.engine-lower gtc:1fr
			.engine-lower > section mih:auto
		@media(max-width:620px)
			.health mt:28px
			.engine-table mt:32px
			.engine-name strong fs:14px
			.engine-version, .engine-connection, .engine-revision white-space:normal
			.engine-status > span d:none
			.engine-lower > section p:22px 20px
			.timeline-row gtc:14px minmax(0,1fr)
			.timeline-row time grid-column:2

tag outpost-engine-history
	store = null

	get revisions
		(store.selected and store.selected.revisions) or []

	def clock value
		new Intl.DateTimeFormat('ru-RU', {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(value))

	<self.outpost-modal-backdrop role="dialog" aria-modal="true" aria-label=t('engines.history_title') tabindex="-1" @click.self=store.close>
		<div.outpost-modal.history-modal>
			<header.outpost-modal-header>
				<span.outpost-modal-mark><outpost-icon name="clock">
				<div>
					<h2> t('engines.history_title')
					<p> t('engines.history_hint')
				<button.outpost-modal-close type="button" @click=store.close aria-label="Закрыть"><outpost-icon name="x">
			<div.outpost-modal-body>
				if revisions.length
					<div.history-list>
						for item in revisions
							<div>
								<span.history-engine><outpost-icon name=item.engine.icon>
								<p><strong> item.engine.name; <span> "Ревизия №{item.version}"
								<time> clock(item.created_at)
				else
					<p.history-empty> t('engines.history_empty')
			<footer.outpost-modal-footer>
				<div.modal-actions><button.outpost-button type="button" @click=store.close> 'Закрыть'

	css self
		.history-modal w:min(680px,100%)
		.history-list bd:1px solid var(--outpost-line) rd:12px of:hidden
		.history-list > div d:grid gtc:38px minmax(0,1fr) auto ai:center g:13px mih:66px p:0 16px border-top:1px solid var(--outpost-line)
		.history-list > div@first-child border-top:0
		.history-engine s:38px d:grid ja:center rd:9px bgc:var(--outpost-success-soft) c:var(--outpost-success)
		.history-list p strong, .history-list p span d:block
		.history-list p span mt:4px c:var(--outpost-muted) fs:12px
		.history-list time c:var(--outpost-muted) fs:12px
		.history-empty p:18px rd:11px bgc:var(--outpost-soft) c:var(--outpost-muted) fs:14px lh:1.5

tag outpost-status-node
	title = ''
	detail = ''
	icon = 'circle'
	working = true
	compact = false

	<self .compact=compact>
		<div.node-icon><outpost-icon name=icon>
		<div.node-copy>
			<strong> title
			<small> detail
		<span.outpost-status .pending=!working> working ? t('system.active') : t('system.unknown')

	css self
		min-height: 112px
		display: grid
		grid-template-columns: 68px minmax(0, 1fr) auto
		align-items: center
		gap: 20px
		.node-icon width: 68px; height: 68px; display: grid; place-items: center; border-radius: 16px; background: #E9F8ED; color: #159447; font-size: 32px
		.node-icon outpost-icon font-size: 32px
		.node-copy min-width: 0
		.node-copy strong, .node-copy small display: block
		.node-copy strong color: #0A1430; font-size: 18px; font-weight: 720
		.node-copy small margin-top: 8px; color: #69748D; font-size: 14px; line-height: 1.35
		.outpost-status white-space: nowrap
		&.compact
			min-height: 122px
			padding: 20px
			grid-template-columns: 52px minmax(0, 1fr) auto
			gap: 14px
			border: 1px solid var(--outpost-line)
			border-radius: 12px
			background: #fff
			.node-icon width: 52px; height: 52px; border-radius: 12px; font-size: 26px
			.node-icon outpost-icon font-size: 26px
			.node-copy strong font-size: 16px
			.node-copy small font-size: 12px
			.outpost-status font-size: 13px
		@media(max-width: 720px)
			grid-template-columns: 54px minmax(0, 1fr)
			gap: 14px
			.node-icon width: 54px; height: 54px; border-radius: 13px
			.node-icon outpost-icon font-size: 26px
			.outpost-status grid-column: 2
			&.compact grid-template-columns: 48px minmax(0, 1fr)

tag outpost-system-map
	store = null

	get services do store.data.system.services
	get nginx do service('nginx')
	get hysteria do service('hysteria-server')
	get xray do service('xray')
	get proxy do service('outpost')
	get online? do nginx.status == 'active' and store.data.system.tls.status == 'valid'
	get healthy? do online? and services.every(do(item) item.status == 'active')
	get tlsdetail
		const tls = store.data.system.tls
		return 'TLS действителен' if tls.status == 'valid'
		tls.error or 'TLS требует внимания'

	def service name
		services.find(do(item) item.name == name) or {name: name, status: 'unknown'}

	<self.outpost-card>
		<outpost-status-node.domain title="Интернет и домен" detail="{store.data.system.domain} · {tlsdetail}" icon="globe" working=online?>
		<div.flow-line aria-hidden="true">
		<outpost-status-node title="Nginx" detail="HTTPS · TCP 443" icon="hard-drives" working=(nginx.status == 'active')>
		<div.connector.split aria-hidden="true">
			<i.stem>
			<i.bar>
			<i.left>
			<i.right>
		<div.branches>
			<outpost-status-node compact=true title="Hysteria 2" detail="UDP 443 · основной" icon="wave-sine" working=(hysteria.status == 'active')>
			<outpost-status-node compact=true title="Xray" detail="VLESS · XHTTP · резервный" icon="shield" working=(xray.status == 'active')>
		<div.connector.merge aria-hidden="true">
			<i.left>
			<i.right>
			<i.bar>
			<i.stem>
		<outpost-status-node.proxy title="Outpost" detail="Панель, подписки и маршруты" icon="circles-four" working=(proxy.status == 'active')>
		<div.map-footer>
			<outpost-icon name=(healthy? ? 'check-circle' : 'warning-circle') [c:{healthy? ? 'var(--outpost-success)' : 'orange'} fs:20px]>
			<span> healthy? ? 'Все протоколы доступны' : 'Некоторые протоколы требуют внимания'

	css self
		min-height: 768px
		display: flex
		flex-direction: column
		padding: 24px 28px 0
		.domain border-bottom: 1px solid var(--outpost-line)
		.proxy border-top: 1px solid var(--outpost-line)
		.flow-line height: 40px; width: 0; margin: 0 0 0 34px; border-left: 1px solid #BFC9D8
		.connector position: relative
		.connector i position: absolute; display: block
		.split height: 66px
		.split i.stem top: 0; left: 34px; height: 26px; border-left: 1px solid #BFC9D8
		.split i.bar top: 26px; left: 34px; right: 25%; border-top: 1px solid #BFC9D8
		.split i.left top: 26px; left: 25%; height: 40px; border-left: 1px solid #BFC9D8
		.split i.right top: 26px; left: 75%; height: 40px; border-left: 1px solid #BFC9D8
		.merge
			height: 73px
			i.left top: 0; left: 25%; height: 36px; border-left: 1px solid #BFC9D8
			i.right top: 0; left: 75%; height: 36px; border-left: 1px solid #BFC9D8
			i.bar top: 36px; left: 25%; right: 25%; border-top: 1px solid #BFC9D8
			i.stem top: 36px; left: 50%; height: 37px; border-left: 1px solid #BFC9D8
		.branches display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px
		.map-footer
			min-height: 80px
			display: flex
			align-items: center
			gap: 12px
			margin-top: auto
			border-top: 1px solid var(--outpost-line)
			color: #69748D
			font-size: 14px
			outpost-icon color: #159447; font-size: 20px
		@media(max-width: 720px)
			min-height: 0
			padding: 20px 20px 0
			.flow-line height: 22px
			.branches grid-template-columns: 1fr; gap: 14px; margin-top: 18px
			.connector display: none
			.map-footer margin-top: 22px

tag outpost-connection-guide
	expanded = false

	def toggle
		expanded = !expanded

	<self .expanded=expanded>
		<button.guide-head type="button" @click=toggle aria-expanded=expanded>
			<span.guide-icon><outpost-icon name="info">
			<span.guide-label>
				<strong> 'Как это работает'
				<small> 'Подписка объединяет маршруты и способы подключения в одном профиле'
			<outpost-icon.chevron name="caret-down">
		<div.guide-body .open=expanded>
			<div.guide-content>
				<div.guide-inner>
					<div.guide-flow>
						<article>
							<span.step> '1'
							<div>
								<h3> 'Подписка'
								<p> 'Постоянная ссылка подписки. По ней клиент получает доступные протоколы, их порядок и актуальные маршруты — всё вместе. Когда настройки меняются, клиент забирает новую версию профиля при следующем обновлении.'
						<article>
							<span.step> '2'
							<div>
								<h3> 'Маршруты'
								<p> 'Для разных доменов и сетей можно выбрать способ доступа: напрямую, через сервер или заблокировать. Маршруты не привязаны к Hysteria 2 или Xray и тоже приходят в подписке. Клиент проверяет правила по порядку и применяет первое подходящее.'
						<article>
							<span.step> '3'
							<div>
								<h3> 'Протоколы'
								<p> 'Это способы связи клиента с вашим сервером. Hysteria 2 и Xray по-разному маскируют соединение, чтобы сетевому фильтру было сложнее его распознать и заблокировать. Если первый способ недоступен, клиент пробует следующий.'
					<div.guide-note>
						<outpost-icon name="arrows-clockwise">
						<p>
							<strong> 'После изменений '
							<span> 'клиент должен обновить подписку. Обычно это происходит автоматически, но обновление можно запустить и вручную.'

	css self
		d:block bd:1px solid var(--outpost-line) rd:13px bgc:white of:hidden
		.guide-head w:100% d:grid gtc:42px 1fr 18px ai:center g:12px p:14px 18px bd:0 bgc:var(--outpost-soft) c:var(--outpost-text) ta:left cur:pointer
		.guide-icon s:42px d:grid ja:center rd:11px bgc:var(--outpost-auth-start) c:var(--outpost-brand) fs:20px
		.guide-label strong, .guide-label small d:block
		.guide-label strong c:var(--outpost-navy) fs:15px fw:750
		.guide-label small mt:4px c:var(--outpost-muted) fs:12px
		.chevron c:var(--outpost-muted) fs:15px tween:transform 160ms ease
		&.expanded .chevron transform:rotate(180deg)
		.guide-body d:grid gtr:0fr o:0 tween:grid-template-rows 260ms cubic-bezier(.22,1,.36,1), opacity 180ms ease
		.guide-body.open gtr:1fr o:1
		.guide-content mih:0 of:hidden
		.guide-inner p:0 18px 18px
		.guide-flow d:grid gtc:repeat(3,minmax(0,1fr)) g:10px
		article d:grid gtc:26px minmax(0,1fr) ai:start g:10px p:13px bd:1px solid var(--outpost-line) rd:10px bgc:var(--outpost-soft)
		.step s:26px d:grid ja:center rd:8px bgc:var(--outpost-auth-start) c:var(--outpost-brand) fs:11px fw:800
		h3 c:var(--outpost-text) fs:13px fw:750
		article p mt:5px c:var(--outpost-muted) fs:12px lh:1.48
		.guide-note d:flex ai:center g:9px mt:14px c:var(--outpost-muted) fs:12px lh:1.45
		.guide-note outpost-icon fl:0 0 auto c:var(--outpost-brand) fs:17px
		.guide-note strong c:var(--outpost-text)
		@media(max-width: 760px)
			.guide-flow gtc:1fr
		@media(max-width: 520px)
			.guide-head gtc:36px 1fr 16px p:12px
			.guide-icon s:36px fs:18px
			.guide-inner p:0 12px 12px

tag outpost-protocols
	store = null
	drag = null
	over = null
	origin = []
	state = 'idle'
	token = 0
	notice = null

	get services do store.data.system.services
	get order do store.data.system.engineOrder or ['hysteria', 'xray']

	get engines
		const versions = store.data.system.versions
		const values = {
			hysteria: {
				id: 'hysteria'
				name: 'Hysteria 2'
				service: 'hysteria-server'
				transport: 'UDP 443'
				format: 'YAML'
				config: store.data.engineConfigs.hysteria
				facts: [
					{label: 'Протокол', value: 'Hysteria 2'}
					{label: 'Аутентификация', value: 'пароль'}
					{label: 'Obfs', value: 'Salamander'}
				]
			}
			xray: {
				id: 'xray'
				name: 'Xray'
				service: 'xray'
				transport: 'TCP 443'
				format: 'JSON'
				config: store.data.engineConfigs.xray
				facts: [
					{label: 'Протокол', value: 'VLESS'}
					{label: 'Транспорт', value: 'XHTTP'}
					{label: 'Защита', value: 'TLS'}
					{label: 'Фрагментация', value: 'ClientHello'}
				]
			}
		}
		order.map do(id, index)
			const version = versions.find do(item) item.engine == id
			{...values[id], rank: index + 1, installed: version..installed_version or version..desired_version or '—', desired: version..desired_version, checksum: version..checksum}

	def service name
		services.find(do(item) item.name == name) or {name: name, status: 'unknown'}

	def working engine
		service(engine.service).status == 'active'

	def edit engine
		store.selected = {engine: engine.id, template: engine.config.template, activeVersion: engine.config.activeVersion}
		store.open('engine')

	def update engine
		return unless engine.desired and engine.desired != engine.installed and engine.checksum
		const payload = {engine: engine.id, version: engine.desired, checksum: engine.checksum}
		store.selected = {payload: payload}
		store.confirmation = await store.api('POST', '/api/v1/operations/preview', {action: 'engine.update', payload: payload})
		store.open('confirm')

	def toggle engine
		const action = working(engine) ? 'service.stop' : 'service.start'
		const payload = {service: engine.service}
		store.selected = {payload: payload}
		store.confirmation = await store.api('POST', '/api/v1/operations/preview', {action: action, payload: payload})
		store.open('confirm')

	def touch engine, e
		if !drag
			drag = engine.id
			over = engine.id
			origin = order.slice!
		const target = hit(e.clientY)
		if target
			over = target.id
			move(drag, target.id, target.after) if target.id != drag
		if e.ended?
			persist!
			drag = null
			over = null
			origin = []

	def hit y
		for row in self.querySelectorAll('.engine-row')
			const rect = row.getBoundingClientRect!
			if y >= rect.top and y <= rect.bottom
				return {id: row.getAttribute('data-id'), after: y > rect.top + rect.height / 2}
		null

	def move source, target, after = false
		return if !source or !target or source == target
		const next = order.slice!
		const from = next.indexOf(source)
		return if from < 0
		const moved = next.splice(from, 1)[0]
		let to = next.indexOf(target)
		return if to < 0
		to++ if after
		next.splice(to, 0, moved)
		store.data.system.engineOrder = next
		imba.commit!

	def persist
		const ids = order.slice!
		const backup = origin.slice!
		return if ids.join('|') == backup.join('|')
		const stamp = ++token
		state = 'saving'
		imba.commit!
		try
			await store.api('POST', '/api/v1/engines/reorder', {ids: ids})
			state = 'saved'
			imba.commit!
			await new Promise do(resolve) window.setTimeout(resolve, 6000)
			state = 'idle' if token == stamp
		catch issue
			store.data.system.engineOrder = backup
			state = 'error'
			notice = issue.message
		finally
			imba.commit!

	def step engine, delta
		const from = order.indexOf(engine.id)
		const to = from + delta
		return if from < 0 or to < 0 or to >= order.length
		origin = order.slice!
		move(engine.id, order[to], delta > 0)
		persist!
		origin = []

	def key engine, e
		if e.key == 'ArrowUp'
			e.preventDefault!
			step(engine, -1)
		elif e.key == 'ArrowDown'
			e.preventDefault!
			step(engine, 1)

	<self>
		<header.proxy-head>
			<span.eyebrow> 'ПРОТОКОЛЫ'
			<outpost-header title=t('engines.title') subtitle=t('engines.subtitle')>
		if notice
			<div.proxy-notice role="status"> notice
		<section.order-panel>
			<header.order-head>
				<div>
					<h2> 'Порядок подключения'
					<p> 'Клиенты пробуют способы сверху вниз'
				if state != 'idle'
					<div.save-state .pending=(state == 'saving') .error=(state == 'error') [o@off:0 y@off:-6px ease:180ms] ease aria-live="polite">
						<outpost-icon name=(state == 'error' ? 'warning-circle' : state == 'saving' ? 'spinner-gap' : 'check-circle')>
						<span> state == 'error' ? 'Не удалось сохранить' : state == 'saving' ? 'Сохраняем порядок…' : 'Порядок сохранён'
			<div.engine-list>
				for engine in engines
					<article.engine-row key=engine.id .failed=!working(engine) .dragging=(drag == engine.id) .over=(over == engine.id and drag != engine.id) data-id=engine.id>
						<button.handle type="button" @touch.moved(5px,'y')=touch(engine,e) @keydown=(do(e) key(engine,e)) aria-label="Перетащить {engine.name}. Стрелки вверх и вниз меняют приоритет">
							<outpost-icon name="dots-six-vertical">
						<span.rank> engine.rank
						<div.engine-identity>
							<div.engine-mark><outpost-engine-mark kind=engine.id>
							<div.engine-copy>
								<div.engine-title>
									<h3> engine.name
								<p.engine-version>
									<span> "Версия {engine.installed}"
									if engine.desired and engine.desired != engine.installed
										<span.bullet> '·'
										<button type="button" @click=update(engine) title="Обновить до {engine.desired}">
											<outpost-icon name="download-simple">
											<span> engine.desired
						<div.engine-connection>
							<strong> engine.transport
							for fact in engine.facts
								<span.dot> '·'
								<span> fact.value
						<div.engine-actions>
							<button.configure type="button" @click=edit(engine) aria-label="Настроить {engine.name} — {engine.format}" title="Настроить {engine.name}">
								<outpost-icon name="gear-six">
								<span> engine.format
							<button.toggle type="button" .stop=working(engine) .start=!working(engine) @click=toggle(engine) aria-label=(working(engine) ? "Остановить {engine.name}" : "Запустить {engine.name}") title=(working(engine) ? "Остановить {engine.name}" : "Запустить {engine.name}")>
								<outpost-icon name=(working(engine) ? 'pause' : 'play')>
			<footer.order-note>
				<outpost-icon name="info">
				<span> 'Новый порядок появится при следующем обновлении подписки'
		<outpost-connection-guide>

	css self
		d:block maw:1110px m:0
		.proxy-head d:block
		.eyebrow d:block mb:14px c:var(--outpost-brand) fs:12px fw:750 ls:.1em
		.proxy-notice mt:18px p:11px 14px rd:9px bgc:#FFF7E8 c:#8A5300 fs:13px
		outpost-connection-guide mt:18px
		.order-panel mt:35px bd:1px solid var(--outpost-line) rd:12px bgc:white of:hidden
		.order-head d:flex ai:flex-start jc:space-between g:24px p:20px 24px 22px
		.order-head h2 c:var(--outpost-navy) fs:18px fw:750
		.order-head p mt:5px c:#526C9D fs:13px
		.save-state d:flex ai:center g:9px pt:12px c:var(--outpost-success) fs:14px white-space:nowrap
		.save-state outpost-icon fs:20px
		.save-state.pending c:#61729A
		.save-state.pending outpost-icon animation:spin 1s linear infinite
		.save-state.error c:#C43228
		.engine-list of:hidden border-top:1px solid var(--outpost-line)
		.engine-row d:grid gtc:28px 38px minmax(260px,.95fr) minmax(280px,1.35fr) 128px ai:center g:14px mih:88px p:10px 22px 10px 16px bgc:white tween:background 150ms ease, box-shadow 150ms ease
		.engine-row + .engine-row bdt:1px solid var(--outpost-line)
		.engine-row.dragging o:.72 bgc:#F5F9FF
		.engine-row.over bxs:inset 0 2px 0 var(--outpost-brand)
		.handle s:28px d:grid ja:center p:0 bd:0 rd:7px bgc:transparent c:#1A2238 fs:18px cursor:grab touch-action:none
		.handle@hover bgc:#F1F5FB c:var(--outpost-brand)
		.handle@active cursor:grabbing
		.rank s:34px d:grid ja:center bd:1px solid #C8D6EB rd:8px bgc:#FBFCFF c:#1D2945 fs:14px fw:700
		.engine-identity d:flex ai:center g:13px min-width:0
		.engine-mark s:48px d:grid ja:center fl:0 0 48px rd:10px bgc:#E8F5E7 c:#078923
		.engine-row.failed .engine-mark bgc:#F0F2F6 c:#657087
		.engine-mark outpost-engine-mark scale:.9
		.engine-copy min-width:0
		.engine-title d:flex ai:center g:9px flex-wrap:wrap
		.engine-title h3 c:var(--outpost-navy) fs:16px fw:750 lh:1.25
		.engine-version d:flex ai:center g:7px mt:4px c:#657491 fs:12px lh:1.3
		.engine-version button d:inline-flex ai:center g:5px p:0 bd:0 bg:transparent c:var(--outpost-brand) fs:12px fw:650
		.engine-version button@hover text-decoration:underline
		.engine-version button outpost-icon fs:15px
		.engine-version .bullet c:#8A99B3
		.engine-connection d:flex ai:center g:7px min-width:0 c:#47618D fs:13px lh:1.4 flex-wrap:wrap
		.engine-connection strong c:#263C6A fw:650
		.engine-connection .dot c:#9AA7BB
		.engine-actions d:flex ai:center jc:flex-end g:8px
		.configure h:38px d:flex ai:center jc:center g:7px p:0 10px bd:1px solid #CCD8EB rd:9px bgc:white c:#52627C fs:11px fw:750 ls:.04em
		.configure outpost-icon fs:17px
		.configure@hover bc:#AFC4E5 bgc:#F5F9FF c:var(--outpost-brand)
		.toggle s:38px d:grid ja:center p:0 bd:1px solid transparent rd:9px
		.toggle outpost-icon fs:17px
		.toggle.stop bc:#E9AAA5 bgc:#FFF2F0 c:#C43228
		.toggle.stop@hover bc:#D97972 bgc:#FFE7E3 c:#A9251D
		.toggle.start bc:#A8D8B3 bgc:var(--outpost-success-soft) c:#078923
		.toggle.start@hover bc:#79C28A bgc:#DDF2E1 c:#056E1B
		.order-note mih:60px d:flex ai:center g:10px p:0 24px bdt:1px solid var(--outpost-line) bgc:var(--outpost-soft) c:#4D6390 fs:12px
		.order-note outpost-icon c:#4164A7 fs:21px
		@media(max-width: 1100px)
			.engine-row gtc:26px 34px minmax(220px,.9fr) minmax(220px,1.15fr) 124px g:10px px:14px
		@media(max-width: 760px)
			.order-head p:18px 16px 20px
			.engine-row gtc:24px 32px minmax(0,1fr) auto; g:8px 10px; mih:0; p:15px 12px
			.engine-identity gc:3
			.engine-mark s:56px
			.engine-connection gc:3 / -1
			.engine-actions gc:4; gr:2
			.order-note mt:14px p:16px 18px lh:1.45
		@media(max-width: 520px)
			.proxy-head d:grid g:22px
			.order-head d:grid
			.save-state pt:0
			.engine-row gtc:22px 30px minmax(0,1fr) auto
			.engine-mark s:48px rd:10px
			.engine-title g:8px
			.engine-title h3 fs:15px
			.engine-version, .engine-connection fs:11px
			.configure span d:none
			.configure s:36px p:0
			.toggle s:36px
