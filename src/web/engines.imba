import {engineViews} from './context.imba'
import {t, intl} from './i18n.imba'

tag outpost-engines
	store = null
	checking = false
	error = null

	get engines do engineViews(store)

	def working engine
		const service = store.data.system.services.find do(item) item.name == engine.service
		service..status == 'active'

	def edit engine
		store.selected = {engine: engine.id, template: engine.config.template, activeVersion: engine.config.activeVersion, preset: engine.config.preset}
		store.open('engine')

	def check
		return if checking
		checking = true
		error = null
		try
			await store.api('POST', '/api/v1/engines/check')
			await store.load!
		catch issue
			error = issue.message
		finally
			checking = false
			imba.commit!

	def preview action, payload
		error = null
		try
			const confirmation = await store.api('POST', '/api/v1/operations/preview', {action: action, payload: payload})
			store.selected = {payload: payload}
			store.confirmation = confirmation
			store.open('confirm')
		catch issue
			error = issue.message
			imba.commit!

	def update engine
		return unless engine.desired and engine.desired != engine.installed and engine.checksum
		preview('engine.update', {engine: engine.id, version: engine.desired, checksum: engine.checksum})

	def toggle engine
		preview(working(engine) ? 'service.stop' : 'service.start', {service: engine.service})

	def caption engine
		working(engine) ? t('Остановить {engine}', {engine: engine.name}) : t('Запустить {engine}', {engine: engine.name})

	def count engine
		store.data.methods.items.filter(do(method) method.engine == engine.id).length

	def checked engine
		new Intl.DateTimeFormat(intl!, {dateStyle: 'short', timeStyle: 'short'}).format(new Date(engine.release.checkedAt))

	<self>
		<outpost-header title=t('nav.engines') subtitle=t('methods.engines_hint')>
		<div.toolbar>
			<p> t('engines.release_policy')
			<button.outpost-button.quiet type="button" disabled=checking @click=check>
				<outpost-icon name=(checking ? 'spinner-gap' : 'arrows-clockwise') .spinning=checking>
				<span> checking ? t('engines.checking') : t('engines.check')
		if error
			<p.outpost-error role="alert"> error
		<section.engine-list>
			for engine in engines
				<article.engine-row key=engine.id>
					<div.engine-mark><outpost-engine-mark kind=engine.id>
					<div.identity>
						<h2> engine.name
						<p> engine.installed ? "{t('engines.installed')}: {engine.installed}" : t('engines.not_installed')
						if engine.installed
							<span.state> working(engine) ? t('system.active') : t('methods.engine_stopped')
					<div.capabilities>
						<p> engine.transport
						<span> "{t('methods.count')}: {count(engine)}"
					<div.actions>
						<button.outpost-button.quiet.upgrade type="button" disabled=(engine.desired == engine.installed) @click=update(engine) title=(engine.desired == engine.installed ? t('engines.current_pin') : t('engines.update_hint'))>
							<span> "{engine.installed ? t('settings.update.upgrade') : t('settings.update.install')} {engine.desired}"
						<button.icon-button type="button" @click=edit(engine) aria-label=t('Настроить {engine}', {engine: engine.name}) title=t('Настроить {engine}', {engine: engine.name})><outpost-icon name="gear-six">
						if engine.installed
							<button.icon-button type="button" @click=toggle(engine) aria-label=caption(engine) title=caption(engine)><outpost-icon name=(working(engine) ? 'pause' : 'play')>
					<div.release>
						if engine.release
							if engine.release.error
								<span> t('engines.check_failed')
							else
								<a href=engine.release.url target="_blank" rel="noopener noreferrer"> "{t('engines.upstream')}: {engine.release.latest}"
								if engine.release.newerThanPin
									<span> t('engines.needs_outpost')
								else
									<span> t('engines.available_pin', {version: engine.desired})
							<small> "{t('engines.checked')}: {checked(engine)}"
						else
							<span> t('engines.not_checked')

	css self
		d:block maw:1110px
		.toolbar d:flex ai:center jc:space-between g:20px mt:28px mb:20px
		.toolbar p fs:12px lh:1.5 c:var(--outpost-muted) maw:650px
		.toolbar button fl:0 0 auto
		button.outpost-button@disabled cursor:default bgc:transparent tween:none bxs:none transform:none
		.spinning animation:spin 1s linear infinite
		.engine-list bd:1px solid var(--outpost-line) rd:12px bgc:white of:hidden
		.engine-row d:grid gtc:44px minmax(145px,.8fr) minmax(150px,1fr) auto ai:center g:12px 18px p:22px
		.engine-row + .engine-row border-top:1px solid var(--outpost-line)
		.engine-mark s:44px d:grid ja:center rd:9px bgc:var(--outpost-soft)
		h2 fs:16px c:var(--outpost-navy)
		.identity p, .state, .capabilities p, .capabilities span fs:12px c:var(--outpost-muted) mt:5px lh:1.5
		.capabilities p c:var(--outpost-text)
		.actions d:flex ai:center g:8px
		.release gc:2 / -1 d:flex ai:center flex-wrap:wrap g:6px 14px fs:12px c:var(--outpost-muted)
		.release small fs:11px
		.release a c:var(--outpost-brand)
		@media(max-width: 1000px)
			.engine-row gtc:44px minmax(0,1fr) auto
			.capabilities gc:2 / -1 gr:2
			.release gc:2 / -1 gr:3
		@media(max-width: 640px)
			.toolbar ai:flex-start fld:column
			.engine-row p:16px
			.actions gc:2 / -1 gr:3 flex-wrap:wrap
			.release gr:4
