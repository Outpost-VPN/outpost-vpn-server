import {t} from './i18n.imba'
import {fmt} from './context.imba'

tag matreshka-system
	store = null
	checking = false
	drag = null
	over = null
	origin = []
	checkedAt = null
	notice = null

	def mount
		checkedAt = store.data.system.checkedAt or new Date!.toISOString!

	get services do store.data.system.services
	get engineOrder do store.data.system.engineOrder or ['hysteria', 'xray']

	get engines
		const versions = store.data.system.versions
		const values = {
			hysteria: {
				id: 'hysteria'
				name: 'Hysteria 2'
				icon: 'wave-sine'
				service: 'hysteria-server'
				connection: 'UDP 443 · напрямую'
				detail: 'QUIC-протокол'
				config: store.data.engineConfigs.hysteria
			}
			xray: {
				id: 'xray'
				name: 'Xray'
				icon: 'shield'
				service: 'xray'
				connection: 'VLESS · XHTTP · TCP 443'
				detail: 'через Nginx · фрагментация включена'
				config: store.data.engineConfigs.xray
			}
		}
		engineOrder.map do(id, index)
			const version = versions.find do(item) item.engine == id
			{...values[id], rank: index + 1, installed: version..installed_version or version..desired_version or '—', desired: version..desired_version, checksum: version..checksum}

	get proxyService do service('matreshka')
	get nginxService do service('nginx')
	get proxyVersion do store.data.system.version
	get proxyUpdate do store.data.system.updates
	get edgeHealthy? do nginxService.status == 'active' and store.data.system.tls.status == 'valid'
	get online? do !!store.data.system.address
	get address do store.data.system.address or 'не определён'

	get healthy?
		return false unless online?
		store.data.system.tls.status == 'valid' and services.every do(item) item.status == 'active'

	get issue
		return 'Публичный IP не определён' unless online?
		return 'Сертификат требует внимания' if store.data.system.tls.status != 'valid'
		const failed = services.find do(item) item.status != 'active'
		failed ? "{fmt.serviceName(failed.name)} не отвечает" : 'Всё работает штатно'

	def service name
		services.find(do(item) item.name == name) or {name: name, status: 'unknown'}

	def working engine
		service(engine.service).status == 'active'

	def checked value = checkedAt
		return 'только что' unless value
		const date = new Date(value)
		const time = new Intl.DateTimeFormat('ru-RU', {hour: '2-digit', minute: '2-digit'}).format(date)
		const today = date.toDateString! == new Date!.toDateString!
		today ? "сегодня, {time}" : new Intl.DateTimeFormat('ru-RU', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}).format(date)

	def expiry value
		return 'Срок проверяется' unless value
		"Действителен до {new Intl.DateTimeFormat('ru-RU', {day: 'numeric', month: 'long', year: 'numeric'}).format(new Date(value))}"

	def check
		return if checking
		checking = true
		notice = null
		try
			store.data.system = await store.api('GET', '/api/v1/system')
			checkedAt = store.data.system.checkedAt or new Date!.toISOString!
		catch issue
			notice = issue.message
		finally
			checking = false
			imba.commit!

	def edit engine
		store.selected = {engine: engine.id, template: engine.config.template, activeVersion: engine.config.activeVersion}
		store.open('engine')

	def updateEngine engine
		return unless engine.desired and engine.desired != engine.installed and engine.checksum
		const payload = {engine: engine.id, version: engine.desired, checksum: engine.checksum}
		store.selected = {payload: payload}
		store.confirmation = await store.api('POST', '/api/v1/operations/preview', {action: 'engine.update', payload: payload})
		store.open('confirm')

	def backup
		store.open('backup')

	def restore
		store.open('restore')

	def domain
		store.open('domain')

	def touch engine, e
		if !drag
			drag = engine.id
			over = engine.id
			origin = engineOrder.slice!
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
		const next = engineOrder.slice!
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
		const ids = engineOrder.slice!
		return if ids.join('|') == origin.join('|')
		try
			await store.api('POST', '/api/v1/engines/reorder', {ids: ids})
		catch issue
			store.data.system.engineOrder = origin.slice!
			notice = issue.message
			imba.commit!

	def step engine, delta
		const from = engineOrder.indexOf(engine.id)
		const to = from + delta
		return if from < 0 or to < 0 or to >= engineOrder.length
		origin = engineOrder.slice!
		move(engine.id, engineOrder[to], delta > 0)
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
		<header.system-head>
			<div>
				<span.eyebrow> 'АРХИТЕКТУРА И СОСТОЯНИЕ'
				<matreshka-header title="Система" subtitle="Путь трафика и всё, что его обслуживает">
			<div.head-actions>
				<div.health .pending=!healthy? aria-live="polite">
					<matreshka-icon name=(healthy? ? 'check-circle' : 'warning-circle')>
					<span.status-copy>
						<strong> issue
						<small> "Проверено {checked!}"
				<button.status-refresh type="button" disabled=checking @click=check aria-label="Обновить состояние" title="Обновить состояние">
					<matreshka-icon name=(checking ? 'spinner-gap' : 'arrows-clockwise')>
		if notice
			<div.system-notice role="status"> notice
		<section.architecture>
			<div.flow-node .failed=!edgeHealthy?>
				<span.node-dot>
				<div.node-icon><matreshka-icon name="git-fork">
				<div.node-copy>
					<h2> 'Nginx · точка входа'
					<p.link> store.data.system.domain
					<p> "TLS · {expiry(store.data.system.tls.expiresAt)}"
				<button.icon-button type="button" @click=domain aria-label="Настроить домен" title="Настроить домен"><matreshka-icon name="gear-six">
			<div.flow-node.matreshka .failed=(proxyService.status != 'active')>
				<span.node-dot>
				<div.node-icon.brand><matreshka-brand-mark>
				<div.node-copy>
					<h2> 'Панель «Matreshka»'
					<p.version>
						<span> "Версия {proxyVersion}"
						if proxyUpdate.available and proxyUpdate.latest
							<button type="button" title="Обновить до {proxyUpdate.latest}"><matreshka-icon name="download-simple">; <span> proxyUpdate.latest
					<p> 'Админка, API и подписки'
				<div.backup-actions>
					<button.icon-button type="button" @click=backup aria-label="Выгрузить резервную копию" title="Выгрузить резервную копию"><matreshka-icon name="download-simple">
					<button.icon-button type="button" @click=restore aria-label="Восстановить из резервной копии" title="Восстановить из резервной копии"><matreshka-icon name="upload-simple">
			<section.engine-group>
				<span.node-dot>
				<header>
					<h2> 'Прокси-движки'
					<p> 'Порядок подключения в подписках'
					<small> 'Клиент пробует подключения сверху вниз'
				<div.engine-list>
					for engine in engines
						<div.engine-row .failed=!working(engine) .dragging=(drag == engine.id) .over=(over == engine.id and drag != engine.id) data-id=engine.id>
							<span.engine-dot>
							<button.handle type="button" @touch.moved(5px,'y')=touch(engine,e) @keydown=(do(e) key(engine,e)) aria-label="Перетащить {engine.name}. Стрелки вверх и вниз меняют приоритет">
								<matreshka-icon name="dots-six-vertical">
							<span.rank> engine.rank
							<div.node-icon><matreshka-engine-mark kind=engine.id>
							<div.node-copy>
								<div.engine-title>
									<h3> engine.name
									<p.engine-state .pending=!working(engine)>
										<i>
										<span> working(engine) ? 'Работает' : 'Не отвечает'
										<em> engine.rank == 1 ? 'Основной' : 'Резервный'
								<p.version>
									<span> "Версия {engine.installed}"
									if engine.desired and engine.desired != engine.installed
										<button type="button" @click=(do updateEngine(engine)) title="Обновить до {engine.desired}"><matreshka-icon name="download-simple">; <span> engine.desired
								<p> "{engine.connection} · {engine.detail}"
							<button.icon-button type="button" @click=edit(engine) aria-label="Настроить {engine.name}" title="Настроить {engine.name}"><matreshka-icon name="gear-six">
			<div.flow-node.server>
				<span.node-dot>
				<div.node-icon><matreshka-icon name="hard-drives">
				<div.node-copy>
					<h2> 'Сервер'
					<p> "Ubuntu 24.04 · {fmt.uptime(store.data.system.uptime)}"
					<p> 'Обновлений нет · Диск · 38 ГБ свободно'
					<p> 'Firewall включён · 22, 80, 443 TCP · 443 UDP · root-agent ограничен'
			<div.flow-node.internet .failed=!online?>
				<span.node-dot>
				<div.node-icon><matreshka-icon name="globe">
				<div.node-copy>
					<h2> 'Внешний интернет'
					<p.link> "Публичный IPv4 · {address}"
					<p> 'Входящие подключения · TCP 443 и UDP 443'

	css self
		d:block maw:1180px m:0 auto
		.system-head d:flex ai:flex-start jc:space-between g:32px
		.eyebrow d:block mb:14px c:var(--matreshka-brand) fs:12px fw:750 ls:.1em
		.head-actions d:flex ai:center g:9px pt:9px
		.health d:flex ai:center g:9px c:var(--matreshka-success) white-space:nowrap
		.health > matreshka-icon fs:17px
		.status-copy d:grid g:2px
		.health strong fw:700
		.health small c:var(--matreshka-muted); fs:12px; fw:450
		.health.pending c:var(--matreshka-warning)
		.status-refresh s:34px d:grid ja:center p:0 bd:1px solid var(--matreshka-line) rd:9px bgc:var(--matreshka-white) c:#51627F fs:16px
		.status-refresh@hover bc:#AFC4E5 bgc:#F5F9FF c:var(--matreshka-brand)
		.status-refresh@disabled o:.55
		.status-refresh matreshka-icon.ph-spinner-gap animation:spin 1s linear infinite
		.system-notice mt:18px p:10px 14px rd:9px bgc:#FFF7E8 c:#8A5300 fs:13px
		.architecture
			pos:relative mt:28px pl:48px
			&:before content:'' pos:absolute l:12px t:0 b:26px bdl:2px solid #C8D2E2
		.flow-node pos:relative d:grid gtc:64px minmax(0,1fr) auto ai:start g:22px mih:112px p:18px 0 bdb:1px solid var(--matreshka-line)
		.node-dot pos:absolute l:-44px t:38px s:15px bd:3px solid white rd:50% bgc:var(--matreshka-success) bxs:0 0 0 1px var(--matreshka-line)
		.flow-node.failed .node-dot bgc:#F04438
		.node-icon s:58px d:grid ja:center rd:13px bgc:var(--matreshka-success-soft) c:#159447 fs:29px
		.flow-node.failed > .node-icon bgc:#FDE8E6 c:#F04438
		.node-icon.brand bgc:var(--matreshka-success-soft)
		.node-icon.brand matreshka-brand-mark scale:.66
		.node-copy h2, .node-copy h3 c:var(--matreshka-navy) fs:19px fw:750 lh:1.3
		.node-copy p mt:5px c:#65738F fs:14px lh:1.3
		.node-copy p.link c:#34568B
		.icon-button s:38px d:grid ja:center p:0 bd:1px solid var(--matreshka-line) rd:9px bgc:white c:#51627F fs:18px
		.icon-button@hover bc:#AFC4E5 bgc:#F5F9FF c:var(--matreshka-brand)
		.engine-group
			pos:relative ml:0 mb:10px bd:1px solid var(--matreshka-line) rd:12px bgc:white
			&:before content:'' pos:absolute l:-37px t:58px w:37px bdt:2px solid #C8D2E2
		.engine-group > .node-dot l:-45px t:50px zi:2
		.engine-group > header p:8px 18px 12px bdb:1px solid var(--matreshka-line)
		.engine-group > header h2 c:var(--matreshka-navy) fs:18px
		.engine-group > header p mt:4px c:#47618D fs:13px
		.engine-group > header small d:block mt:4px c:var(--matreshka-muted) fs:12px
		.engine-list
			pos:relative pl:26px
			&:before content:'' pos:absolute l:28px t:0 b:0 bdl:2px solid #C8D2E2
		.engine-row pos:relative d:grid gtc:24px 32px 54px minmax(0,1fr) 38px ai:center g:14px mih:112px p:14px 16px bdt:1px solid var(--matreshka-line) tween:background 150ms ease, box-shadow 150ms ease
		.engine-row@first-child bdt:0
		.engine-row.dragging o:.72 bgc:#F5F9FF
		.engine-row.over bxs:inset 0 2px 0 var(--matreshka-brand)
		.engine-dot pos:absolute l:-5px t:50% translate:0 -50% s:15px bd:3px solid white rd:50% bgc:var(--matreshka-success)
		.engine-row.failed .engine-dot bgc:#F04438
		.handle s:28px d:grid ja:center p:0 bd:0 rd:7px bgc:transparent c:#99A6BA fs:17px cursor:grab touch-action:none
		.handle@hover bgc:#F1F5FB c:var(--matreshka-brand)
		.handle@active cursor:grabbing
		.rank s:30px d:grid ja:center bd:1px solid var(--matreshka-line) rd:8px bgc:#F8FAFD c:#445474 fs:12px fw:750
		.engine-row .node-icon s:52px fs:25px
		.engine-row .node-copy p fs:13px
		.engine-title d:flex ai:center g:9px; flex-wrap:wrap
		.engine-title .engine-state mt:0
		.version d:flex ai:center g:7px
		.version button d:inline-flex ai:center g:5px p:0 bd:0 bg:transparent c:var(--matreshka-brand) fs:13px fw:700
		.version button matreshka-icon fs:15px
		.engine-state d:flex ai:center g:7px c:var(--matreshka-success)
		.engine-state.pending c:#F04438
		.engine-state i s:7px rd:50% bgc:currentColor
		.engine-state span c:currentColor
		.engine-state em ml:5px p:3px 7px bd:1px solid var(--matreshka-line) rd:6px c:#52627C fs:11px fw:650 font-style:normal
		.flow-node.matreshka gtc:64px minmax(0,1fr) auto; ai:start; row-gap:14px; mih:136px
		.flow-node.matreshka > .node-icon grid-column:1; grid-row:1
		.flow-node.matreshka > .node-copy grid-column:2; grid-row:1
		.flow-node.matreshka > .backup-actions grid-column:3; grid-row:1
		.backup-actions d:grid g:8px
		.flow-node.server mih:126px
		.flow-node.internet mih:112px; bdb:0
		.power c:#344B74
		@media(max-width: 1120px)
			.system-head d:grid
			.head-actions justify-self:start
			.flow-node.matreshka gtc:64px minmax(0,1fr) auto
		@media(max-width: 760px)
			.health white-space:normal
			.architecture pl:28px
			.architecture
				&:before l:5px
			.node-dot l:-30px
			.flow-node gtc:52px minmax(0,1fr) auto; g:14px
			.node-icon s:50px fs:24px
			.engine-group
				&:before l:-23px w:23px
			.engine-list pl:13px
			.engine-list
				&:before l:15px
			.engine-row gtc:22px 28px 46px minmax(0,1fr) 36px; g:8px; p:12px 10px
			.engine-row .node-icon s:46px
			.engine-state em d:none
			.flow-node.matreshka gtc:52px minmax(0,1fr) auto
			.backup-actions grid-column:3
		@media(max-width: 520px)
			.architecture pl:0
			.architecture
				&:before d:none
			.node-dot d:none
			.engine-group
				&:before d:none
			.flow-node gtc:46px minmax(0,1fr) auto
			.engine-group m:8px 0
			.engine-list pl:0
			.engine-list
				&:before d:none
			.engine-row gtc:20px 28px 42px minmax(0,1fr) 34px
			.engine-row .node-copy p@last-child d:none

tag matreshka-update-card
	store = null
	change = null
	checking = false
	checked = new Date(Date.now!)

	get update do store.data.system.updates
	get current? do !update.available
	get stages
		[
			{title: t('maintenance.snapshot'), hint: t('maintenance.snapshot_hint')}
			{title: t('maintenance.install'), hint: t('maintenance.install_hint')}
			{title: t('maintenance.rollback'), hint: t('maintenance.rollback_hint')}
		]

	def check
		return if checking
		checking = true
		try
			store.data.system = await store.api('GET', '/api/v1/system')
			checked = new Date(Date.now!)
			change! if change
		finally
			checking = false
			imba.commit!

	<self.matreshka-card>
		<header.update-head>
			<div.update-icon><matreshka-icon name="squares-four" [fs:40px]>
			<div.update-copy>
				<h2> "Matreshka {store.data.system.version}"
				<div.update-status .available=!current?>
					<matreshka-icon name=(current? ? 'check-circle' : 'arrow-circle-up') [fs:18px]>
					<span> current? ? t('maintenance.current') : t('maintenance.available')
				<p> "{t('maintenance.channel')}   ·   {t('maintenance.checked').replace('{time}', fmt.time(checked))}"
			<button.matreshka-button.check type="button" disabled=checking @click=check>
				<matreshka-icon name="spinner-gap"> if checking
				<span> checking ? t('maintenance.checking') : t('maintenance.check')
		<ol.steps>
			for stage in stages
				<li.step>
					<span.step-icon><matreshka-icon name="check-circle" [c:var(--matreshka-success) fs:22px]>
					<strong> stage.title
					<span> stage.hint
		<footer.notice>
			<matreshka-icon name="shield-check" [c:var(--matreshka-success) fs:21px]>
			<span> t('maintenance.tunnels')

	css self
		d:block p:25px 26px 0
		.update-head d:grid gtc:86px minmax(0,1fr) auto ai:center g:24px
		.update-icon s:86px d:grid ja:center rd:18px bgc:var(--matreshka-success-soft) c:var(--matreshka-success)
		.update-icon matreshka-icon fs:40px
		.update-copy h2 c:var(--matreshka-navy) fs:25px fw:750 lh:1.2
		.update-status d:flex ai:center g:8px mt:7px c:var(--matreshka-success) fs:15px
		.update-status.available c:var(--matreshka-warning)
		.update-status matreshka-icon fs:18px
		.update-copy p mt:11px c:var(--matreshka-muted) fs:15px
		.check as:start mih:48px mt:12px px:20px white-space:nowrap
		.check matreshka-icon animation:spin 1s linear infinite
		.steps d:grid gtc:repeat(3,minmax(0,1fr)) g:24px mt:38px p:0 list-style:none
		.step pos:relative pt:20px bdt:1px solid var(--matreshka-success)
		.step .step-icon pos:absolute t:-11px l:0 s:22px d:grid ja:center bgc:var(--matreshka-white)
		.step strong, .step span d:block
		.step strong c:var(--matreshka-navy) fs:14px fw:750
		.step span maw:230px mt:6px c:var(--matreshka-muted) fs:13px lh:1.35
		.notice mih:54px d:flex ai:center g:11px mt:20px bdt:1px solid var(--matreshka-line) c:var(--matreshka-muted) fs:14px
		.notice matreshka-icon c:var(--matreshka-success) fs:21px
		@media(max-width: 820px)
			.update-head gtc:72px minmax(0,1fr)
			.update-icon s:72px
			.check grid-column:1 / -1 w:fit-content
			.steps gtc:1fr g:18px
			.step pt:0 pl:34px bdt:0
			.step .step-icon t:0 l:0
		@media(max-width: 540px)
			p:20px 20px 0
			.update-head gtc:56px minmax(0,1fr) g:15px
			.update-icon s:56px rd:13px
			.update-icon matreshka-icon fs:29px
			.update-copy h2 fs:20px
			.update-copy p lh:1.45
			.check w:100%

tag matreshka-backups-card
	store = null

	get backups do store.data.system.backups or []
	get latest
		return backups[0] if backups.length
		return {name: null, size: 733184, created_at: new Date(Date.now! - 120000).toISOString!, demo: true} if store.data.auth.demo
		null

	def stamp value
		const date = new Date(value)
		const today = new Date(Date.now!)
		const day = date.toDateString! == today.toDateString! ? 'Сегодня' : fmt.day(date)
		"{day}, {fmt.time(value)}"

	def download
		return unless latest and latest.name
		window.location.assign("/api/v1/backups/{latest.name}")

	def create
		store.open('backup')

	<self.matreshka-card>
		<h2> t('maintenance.backups')
		if latest
			<div.backup-row>
				<matreshka-icon name="file-text" [c:var(--matreshka-success) fs:22px]>
				<span> "{stamp(latest.created_at)} · {fmt.bytes(latest.size)} · зашифрована"
		else
			<div.backup-empty> t('maintenance.empty')
		<div.backup-actions>
			<button.matreshka-button.small type="button" @click=create> t('maintenance.create')
			<button.download type="button" disabled=(!latest or latest.demo) @click=download aria-label="Скачать последнюю резервную копию">
				<matreshka-icon name="download-simple" [fs:17px]>
		<p.includes> t('maintenance.includes')
		<ul.contents>
			<li>
				<matreshka-icon name="check" [c:var(--matreshka-success) fs:15px]>
				<span> t('maintenance.people')
			<li>
				<matreshka-icon name="check" [c:var(--matreshka-success) fs:15px]>
				<span> t('maintenance.routes')
			<li>
				<matreshka-icon name="check" [c:var(--matreshka-success) fs:15px]>
				<span> t('maintenance.keys')
		<p.excludes>
			<matreshka-icon name="info" [fs:17px]>
			<span> t('maintenance.excludes')
		<details.guide>
			<summary>
				<span> t('maintenance.transfer')
				<matreshka-icon name="caret-right">
			<p> t('maintenance.transfer_hint')

	css self
		d:block p:17px 23px
		h2 c:var(--matreshka-navy) fs:20px
		.backup-row mih:46px d:grid gtc:28px minmax(0,1fr) ai:center g:10px mt:16px px:12px bd:1px solid var(--matreshka-line) rd:8px bgc:var(--matreshka-success-soft) c:var(--matreshka-text) fs:14px
		.backup-row matreshka-icon c:var(--matreshka-success) fs:22px
		.backup-empty mt:16px p:14px rd:8px bgc:var(--matreshka-soft) c:var(--matreshka-muted) fs:13px
		.backup-actions d:flex g:12px mt:12px
		.download s:38px d:grid ja:center p:0 bd:1px solid var(--matreshka-line) rd:8px bgc:var(--matreshka-white) c:var(--matreshka-brand)
		.download@hover bgc:var(--matreshka-soft)
		.includes mt:18px c:var(--matreshka-muted) fs:14px
		.contents d:grid g:7px mt:10px p:0 list-style:none c:var(--matreshka-muted) fs:14px
		.contents li d:flex ai:center g:10px
		.contents matreshka-icon c:var(--matreshka-success) fs:15px
		.excludes d:flex ai:center g:10px mt:13px p:12px rd:8px bgc:var(--matreshka-soft) c:var(--matreshka-muted) fs:12px
		.excludes matreshka-icon fl:0 0 auto fs:17px
		.guide mt:12px bdt:1px solid var(--matreshka-line)
		.guide summary d:flex ai:center jc:space-between py:15px c:var(--matreshka-brand) fs:14px fw:650 cur:pointer list-style:none
		.guide summary matreshka-icon fs:17px tween:transform 150ms ease
		.guide[open] summary matreshka-icon rotate:90deg
		.guide > p pb:15px c:var(--matreshka-muted) fs:12px lh:1.5

tag matreshka-server-card
	store = null
	service = ''

	get services do store.data.system.services

	def preview action, payload
		store.selected = {payload: payload}
		store.confirmation = await store.api('POST', '/api/v1/operations/preview', {action: action, payload: payload})
		store.open('confirm')

	def restart event
		const name = event.target.value
		return unless name
		await preview('service.restart', {service: name})
		service = ''

	<self.matreshka-card>
		<h2> t('maintenance.server')
		<p.server-meta> "{t('maintenance.ubuntu')} · {fmt.uptime(store.data.system.uptime).toLowerCase!}"
		<div.service-list>
			for item in services
				<div.service-row>
					<strong> fmt.serviceName(item.name)
					<span .pending=(item.status != 'active')>
						<matreshka-icon name="circle-fill" [c:var(--matreshka-success) fs:7px]>
						<span> item.status == 'active' ? t('system.active') : t('system.unknown')
		<label.restart>
			<select bind=service @change=restart aria-label=t('maintenance.restart')>
				<option value="" disabled> t('maintenance.restart')
				for item in services
					<option value=item.name> fmt.serviceName(item.name)
	css self
		d:block p:17px 23px
		h2 c:var(--matreshka-navy) fs:20px
		.server-meta mt:8px pb:12px bdb:1px solid var(--matreshka-line) c:var(--matreshka-muted) fs:14px
		.service-list d:grid
		.service-row mih:36px d:flex ai:center jc:space-between g:14px bdb:1px solid var(--matreshka-line) c:var(--matreshka-text) fs:14px
		.service-row > strong fw:650
		.service-row > span d:flex ai:center g:8px c:var(--matreshka-success)
		.service-row > span.pending c:var(--matreshka-warning)
		.service-row matreshka-icon fs:7px
		.restart d:block maw:228px mt:12px
		.restart select w:100% h:36px px:12px bd:1px solid var(--matreshka-line) rd:7px bgc:var(--matreshka-white) c:var(--matreshka-text) fs:13px ol:none
		.restart select@focus bc:var(--matreshka-brand)
tag matreshka-operation-list
	store = null
	checked = false

	get rows
		let rows = store.data.operations.filter do(item) ['backup.export','service.restart','service.start','service.stop','update.apply'].includes(item.kind)
		if checked
			rows = [{id: 'update-check', kind: 'update.check', status: 'completed', created_at: new Date(Date.now!).toISOString!}, ...rows]
		if store.data.auth.demo and !rows.length
			rows = [
				{id: 'demo-backup', kind: 'backup.export', status: 'completed', created_at: new Date(Date.now! - 120000).toISOString!}
				{id: 'demo-check', kind: 'update.check', status: 'completed', created_at: new Date(Date.now! - 240000).toISOString!}
			]
		rows.slice(0, 3)

	def label item
		return t('maintenance.backup_done') if item.kind == 'backup.export'
		return t('maintenance.service_done') if item.kind == 'service.restart'
		return t('maintenance.service_started') if item.kind == 'service.start'
		return t('maintenance.service_stopped') if item.kind == 'service.stop'
		return t('maintenance.update_done') if item.kind == 'update.apply'
		t('maintenance.updates_none')

	<self.matreshka-card>
		<header>
			<h2> t('maintenance.operations')
			<button type="button" @click=(do store.goto('/system'))>
				<span> t('maintenance.all')
				<matreshka-icon name="caret-right">
		if rows.length
			<div.operation-list>
				for item in rows
					<div.operation-row>
						<time> fmt.time(item.created_at)
						<matreshka-icon name=(item.status == 'failed' ? 'warning-circle' : item.status == 'completed' ? 'check-circle' : 'spinner-gap') [c:var(--matreshka-success) fs:19px]>
						<span> label(item)
		else
			<p.empty> t('maintenance.none')

	css self
		d:block p:18px 22px
		header d:flex ai:center jc:space-between g:20px
		header h2 c:var(--matreshka-navy) fs:14px
		header button d:flex ai:center g:9px p:0 bd:0 bgc:transparent c:var(--matreshka-brand) fs:14px fw:650
		header button matreshka-icon fs:16px
		.operation-list d:grid mt:10px ml:70px bdl:1px solid var(--matreshka-success)
		.operation-row pos:relative mih:38px d:grid gtc:44px 22px minmax(0,1fr) ai:center g:10px ml:-67px c:var(--matreshka-muted) fs:13px
		.operation-row time ta:right
		.operation-row matreshka-icon bgc:var(--matreshka-white) c:var(--matreshka-success) fs:19px
		.operation-row matreshka-icon.ph-spinner-gap animation:spin 1s linear infinite
		.operation-row matreshka-icon.ph-warning-circle c:var(--matreshka-warning)
		.empty mt:16px c:var(--matreshka-muted) fs:13px

tag matreshka-maintenance
	store = null
	checked = false

	<self>
		<matreshka-header large=true eyebrow="Система" title=t('maintenance.title') subtitle=t('maintenance.subtitle')>
		<matreshka-update-card store=store change=(do checked = true)>
		<div.maintenance-grid>
			<matreshka-backups-card store=store>
			<matreshka-server-card store=store>
		<matreshka-operation-list store=store checked=checked>

	css self
		d:block
		matreshka-update-card d:block mt:18px
		.maintenance-grid d:grid gtc:1.04fr 1fr g:16px mt:18px
		.maintenance-grid > * mih:360px
		matreshka-operation-list d:block mt:20px
		@media(max-width: 980px)
			.maintenance-grid gtc:1fr
			.maintenance-grid > * mih:0
		@media(max-width: 620px)
			matreshka-update-card mt:22px
			.maintenance-grid mt:14px
			matreshka-operation-list mt:14px
