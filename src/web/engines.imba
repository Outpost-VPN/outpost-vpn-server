import {engineViews} from './context.imba'
import {t, intl} from './i18n.imba'

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

	get count do store.data.methods.items.filter(do(method) method.engine == engine.id).length
	get caption do working? ? t('Остановить {engine}', {engine: engine.name}) : t('Запустить {engine}', {engine: engine.name})
	get upgrade do "{engine.installed ? t('settings.update.upgrade') : t('settings.update.install')} {engine.name} {engine.desired}"
	get checked
		new Intl.DateTimeFormat(intl!, {dateStyle: 'short', timeStyle: 'short'}).format(new Date(engine.release.checkedAt))

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
		<div.engine-mark .hysteria=(engine.id == 'hysteria')><outpost-engine-mark kind=engine.id>
		<div.identity>
			<h2> engine.name
			<div.version>
				<span> engine.installed or t('engines.not_installed')
				if engine.available
					<strong> "→ {engine.desired}"
				<button.icon-button.small type="button" disabled=!!busy @click=check title=t('engines.check_one', {engine: engine.name}) aria-label=t('engines.check_one', {engine: engine.name})>
					<outpost-icon name=(busy == 'check' ? 'spinner-gap' : 'arrows-clockwise') .spinning=(busy == 'check')>
				if engine.available
					<button.icon-button.small.update type="button" disabled=!!busy @click=update title=upgrade aria-label=upgrade><outpost-icon name="download-simple">
			if engine.installed
				<span.state> working? ? t('system.active') : t('methods.engine_stopped')
		<div.capabilities>
			<p> engine.transport
			<span> "{t('methods.count')}: {count}"
		<div.actions>
			<button.icon-button type="button" disabled=!!busy @click=edit aria-label=t('Настроить {engine}', {engine: engine.name}) title=t('Настроить {engine}', {engine: engine.name})><outpost-icon name="gear-six">
			if engine.installed
				<button.icon-button type="button" disabled=!!busy @click=toggle aria-label=caption title=caption><outpost-icon name=(working? ? 'pause' : 'play')>
		<div.release>
			if engine.release
				if engine.release.error
					<span> t('engines.check_failed')
				else
					<a href=engine.release.url target="_blank" rel="noopener noreferrer"> "{t('engines.upstream')}: {engine.release.latest}"
					if engine.release.pending
						<span> t(engine.release.pending == 'bundle' ? 'engines.bundle_pending' : 'engines.artifact_pending')
				<small> "{t('engines.checked')}: {checked}"
			else
				<span> t('engines.not_checked')
		if error
			<p.outpost-error role="alert"> error

	css self
		d:grid gtc:52px minmax(210px,.9fr) minmax(150px,1fr) auto ai:center g:10px 20px p:22px
		.engine-mark s:52px d:grid ja:center rd:12px bgc:var(--outpost-soft)
		.engine-mark.hysteria bgc:var(--outpost-navy)
		h2 fs:16px c:var(--outpost-navy)
		.version d:flex ai:center g:5px mt:5px fs:12px c:var(--outpost-muted)
		.version strong c:var(--outpost-brand) fw:600
		.state, .capabilities p, .capabilities span fs:12px c:var(--outpost-muted) mt:5px lh:1.5
		.capabilities p c:var(--outpost-text)
		.actions d:flex ai:center g:8px
		.spinning animation:spin 1s linear infinite
		.release gc:2 / -1 d:flex ai:center flex-wrap:wrap g:6px 14px fs:12px c:var(--outpost-muted)
		.release small fs:11px
		.release a c:var(--outpost-brand)
		.outpost-error gc:2 / -1
		@media(max-width: 1000px)
			gtc:52px minmax(0,1fr) auto
			.capabilities gc:2 / -1 gr:2
			.release gc:2 / -1 gr:3
		@media(max-width: 520px)
			p:16px g:10px 12px
			.actions gc:2 / -1 gr:3
			.release gr:4
