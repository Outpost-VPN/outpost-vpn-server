import {engineViews} from './context.imba'
import {t} from './i18n.imba'

tag outpost-protocols
	store = null
	tab = 'methods'

	get engines do engineViews(store)

	def working engine
		const service = store.data.system.services.find do(item) item.name == engine.service
		service..status == 'active'

	def edit engine
		store.selected = {engine: engine.id, template: engine.config.template, activeVersion: engine.config.activeVersion, preset: engine.config.preset}
		store.open('engine')

	def update engine
		return unless engine.desired and engine.desired != engine.installed and engine.checksum
		const payload = {engine: engine.id, version: engine.desired, checksum: engine.checksum}
		store.selected = {payload: payload}
		store.confirmation = await store.api('POST', '/api/v1/operations/preview', {action: 'engine.update', payload: payload})
		store.open('confirm')

	def caption engine
		return "{t('settings.update.install')} {engine.name}" unless engine.installed
		working(engine) ? t('Остановить {engine}', {engine: engine.name}) : t('Запустить {engine}', {engine: engine.name})

	def toggle engine
		return update(engine) unless engine.installed
		const payload = {service: engine.service}
		store.selected = {payload: payload}
		store.confirmation = await store.api('POST', '/api/v1/operations/preview', {action: working(engine) ? 'service.stop' : 'service.start', payload: payload})
		store.open('confirm')

	def count engine
		store.data.methods.items.filter(do(method) method.engine == engine.id).length

	<self>
		<outpost-header title=t('engines.title') subtitle=t('methods.page_hint')>
		<nav.tabs aria-label=t('engines.title')>
			<button type="button" .selected=(tab == 'methods') aria-pressed=(tab == 'methods') @click=(do tab = 'methods')> t('methods.title')
			<button type="button" .selected=(tab == 'engines') aria-pressed=(tab == 'engines') @click=(do tab = 'engines')> t('methods.engines')
		if tab == 'methods'
			<outpost-method-list store=store>
		else
			<header.engine-heading>
				<h2> t('methods.engines')
				<p> t('methods.engines_hint')
			<section.engine-list>
				for engine in engines
					<article.engine-row key=engine.id>
						<div.engine-mark><outpost-engine-mark kind=engine.id>
						<div.identity>
							<h3> engine.name
							<p> engine.installed ? "{t('engines.version')}: {engine.installed}" : t('engines.not_installed')
							if engine.installed
								<span.state> working(engine) ? t('system.active') : t('methods.engine_stopped')
						<div.capabilities>
							<p> engine.transport
							<span> "{t('methods.count')}: {count(engine)}"
						<div.actions>
							if engine.desired and engine.desired != engine.installed
								<button.outpost-button.quiet type="button" @click=update(engine)> "{engine.installed ? t('settings.update.upgrade') : t('settings.update.install')} {engine.desired}"
							<button.icon-button type="button" @click=edit(engine) aria-label=t('Настроить {engine}', {engine: engine.name}) title=t('Настроить {engine}', {engine: engine.name})><outpost-icon name="gear-six">
							if engine.installed
								<button.icon-button type="button" @click=toggle(engine) aria-label=caption(engine) title=caption(engine)><outpost-icon name=(working(engine) ? 'pause' : 'play')>
		<outpost-telemetry-note store=store>

	css self
		d:block maw:1110px
		.tabs d:flex g:6px p:5px mt:25px mb:28px rd:10px bgc:var(--outpost-soft) w:fit-content
		.tabs button p:9px 18px bd:0 rd:7px bgc:transparent c:var(--outpost-muted) fs:13px fw:650 cursor:pointer
		.tabs button.selected bgc:white c:var(--outpost-navy) bxs:0 1px 4px #10234A12
		.engine-heading h2 fs:19px c:var(--outpost-navy)
		.engine-heading p mt:6px mb:18px fs:13px c:var(--outpost-muted)
		.engine-list bd:1px solid var(--outpost-line) rd:12px bgc:white of:hidden
		.engine-row d:grid gtc:44px minmax(145px,.8fr) minmax(150px,1fr) auto ai:center g:18px p:22px
		.engine-row + .engine-row border-top:1px solid var(--outpost-line)
		.engine-mark s:44px d:grid ja:center rd:9px bgc:var(--outpost-soft) c:var(--outpost-brand)
		h3 fs:16px c:var(--outpost-navy)
		.identity p, .state, .capabilities p, .capabilities span fs:12px c:var(--outpost-muted) mt:5px lh:1.5
		.capabilities p c:var(--outpost-text)
		.actions d:flex ai:center g:8px
		@media(max-width: 800px)
			.engine-row gtc:44px minmax(0,1fr) auto g:12px
			.capabilities gc:2 / -1 gr:2
		@media(max-width: 480px)
			.tabs button p:9px 12px
			.engine-row p:16px
			.actions gc:2 / -1 gr:3
