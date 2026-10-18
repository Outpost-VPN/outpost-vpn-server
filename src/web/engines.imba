import {engineViews} from './context.imba'
import {t} from './i18n.imba'

tag outpost-engines
	store = null

	<self>
		<outpost-header title=t('nav.engines') subtitle=t('methods.engines_hint')>
		<section.engine-list>
			for engine in engineViews(store)
				<outpost-engine-row key=engine.id store=store engine=engine>

	css self
		d:block maw:1110px
		.engine-list mt:30px bd:1px solid var(--outpost-line) rd:12px bgc:var(--outpost-white) of:hidden
		outpost-engine-row + outpost-engine-row border-top:1px solid var(--outpost-line)


tag outpost-engine-row
	store = null
	engine = null
	busy = null
	error = null

	get working?
		const service = store.data.system.services.find do(item) item.name == engine.service
		service..status == 'active'

	get caption do working? ? t('Остановить {engine}', {engine: engine.name}) : t('Запустить {engine}', {engine: engine.name})
	get upgrade do "{engine.installed ? t('settings.update.upgrade') : t('settings.update.install')} {engine.name} {engine.desired}"
	get checktip
		const release = engine.release
		return t('engines.check_failed') if release and release.error
		return t(release.pending == 'bundle' ? 'engines.bundle_pending' : 'engines.artifact_pending') if release and release.pending
		t('engines.check_one', {engine: engine.name})

	def edit
		store.selected = {engine: engine.id, template: engine.config.template, activeVersion: engine.config.activeVersion, preset: engine.config.preset}
		store.open('engine')

	def check
		return if busy
		busy = 'check'
		error = null
		try
			await store.api('POST', "/api/v1/engines/{engine.id}/check")
			await store.load!
		catch issue
			error = issue.message
		finally
			busy = null
			imba.commit!

	def preview action, payload
		return if busy
		busy = 'preview'
		error = null
		try
			const confirmation = await store.api('POST', '/api/v1/operations/preview', {action: action, payload: payload})
			store.selected = {payload: payload}
			store.confirmation = confirmation
			store.open('confirm')
		catch issue
			error = issue.message
		finally
			busy = null
			imba.commit!

	def update
		return unless engine.available
		preview('engine.update', {engine: engine.id, version: engine.desired, checksum: engine.checksum})

	def toggle
		preview(working? ? 'service.stop' : 'service.start', {service: engine.service})

	<self>
		<div.engine-mark><outpost-engine-mark kind=engine.id>
		<div.identity>
			<div.name>
				<h2> engine.name
				if engine.installed
					<span.state .working=working?> working? ? t('system.active') : t('methods.engine_stopped')
				else
					<span.state> t('engines.not_installed')
			<div.version>
				<span> engine.installed or engine.desired
				if engine.installed and engine.available
					<strong> "→ {engine.desired}"
				<button.icon-button.small type="button" disabled=!!busy @click=check title=checktip aria-label=t('engines.check_one', {engine: engine.name})>
					<outpost-icon name=(busy == 'check' ? 'spinner-gap' : 'arrows-clockwise') .spinning=(busy == 'check')>
				if engine.available
					<button.icon-button.small.update type="button" disabled=!!busy @click=update title=upgrade aria-label=upgrade><outpost-icon name="download-simple">
		<div.capabilities>
			for protocol in engine.capabilities
				<span .configured=protocol.configured> protocol.name
		<div.actions>
			if engine.installed
				<button.icon-button type="button" disabled=!!busy @click=edit aria-label=t('Настроить {engine}', {engine: engine.name}) title=t('Настроить {engine}', {engine: engine.name})><outpost-icon name="gear-six">
				<button.icon-button type="button" disabled=!!busy @click=toggle aria-label=caption title=caption><outpost-icon name=(working? ? 'pause' : 'play')>
		if error
			<p.outpost-error role="alert"> error

	css self
		d:grid gtc:52px minmax(180px,.65fr) minmax(0,1.5fr) 80px ai:center g:10px 20px p:22px
		.engine-mark s:52px d:grid ja:center rd:12px bgc:color-mix(in srgb,var(--outpost-brand) 9%,var(--outpost-white)) bd:1px solid color-mix(in srgb,var(--outpost-brand) 18%,var(--outpost-white))
		.name d:flex ai:center flex-wrap:wrap g:5px 10px
		h2 fs:16px c:var(--outpost-navy)
		.version d:flex ai:center flex-wrap:wrap g:5px mt:5px fs:12px c:var(--outpost-muted)
		.version span, .version strong white-space:nowrap
		.version strong c:var(--outpost-brand) fw:600
		.state fs:11px c:var(--outpost-muted) lh:1.5
		.state.working c:var(--outpost-success) fw:600
		.capabilities d:flex ai:center flex-wrap:wrap g:5px 12px fs:12px lh:1.5 c:var(--outpost-muted)
		.capabilities .configured c:var(--outpost-brand) fw:650
		.actions d:flex ai:center g:8px
		.spinning animation:spin 1s linear infinite
		.outpost-error gc:2 / -1
		@media(max-width: 1000px)
			gtc:52px minmax(0,1fr) 80px
			.capabilities gc:2 / -1 gr:2
		@media(max-width: 520px)
			p:16px g:10px 12px
			.actions gc:2 / -1 gr:3
