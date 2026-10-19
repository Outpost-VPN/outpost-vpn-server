import {engines, engineRunning} from '../shared/engines.ts'
import {protocols} from '../shared/protocols.ts'
import {managedEdge, singletonEngine, methodFields, methodUsage} from '../shared/connection-methods.ts'
import {reorder} from '../shared/reorder.ts'
import {Reorder} from './reorder.imba'
import {t} from './i18n.imba'

tag outpost-method-list
	store = null
	busy = false
	error = null
	draft = null
	ordering = new Reorder(self)

	get methods do store.data.methods.items
	get busy? do busy
	get ordered
		return methods unless draft
		const items = new Map(methods.map(do(method) [method.id, method]))
		[...draft.map(do(id) items.get(id)).filter(Boolean), ...methods.filter(do(method) !draft.includes(method.id))]

	def edit method = null
		store.selected = method
		store.open('method')

	def working method
		method.enabled and engineRunning(store.data.system.services, method.engine)

	def movable id do !busy and methods.some(do(method) method.id == id)

	def move source, target, after = false
		return unless movable(source)
		draft = reorder(ordered, source, target, after).map do(method) method.id

	def restore ids do draft = null
	def unmount do ordering.end!

	def persist
		return if busy or !draft
		const ids = ordered.map do(method) method.id
		if ids.join('|') == methods.map(do(method) method.id).join('|')
			draft = null
			return
		busy = true
		error = null
		try
			await store.api('POST', '/api/v1/methods/reorder', {ids: ids})
			await store.load!
		catch issue
			error = issue.message
		finally
			draft = null
			busy = false
			imba.commit!

	<self>
		<global @keydown.esc=ordering.cancel @blur=ordering.cancel>
		<header.list-head>
			<div>
				<h2> t('methods.title')
				<p> t('methods.order_hint')
			<button.outpost-button type="button" @click=(do edit!)>
				<outpost-icon name="plus">
				<span> t('methods.add')
		if error
			<p.outpost-error role="alert"> error
		<section.method-list aria-busy=busy>
			for method in ordered
				<article.method-row key=method.id data-reorder-id=method.id .dragging=(ordering.drag == method.id) .over=(ordering.over == method.id and ordering.drag != method.id)>
					<outpost-reorder-handle order=ordering item=method disabled=busy>
					<div.identity>
						<div.heading>
							<h3> method.name
							<span.state .working=working(method) title=(method.enabled ? t('methods.network_hint') : t('methods.disabled'))> t(working(method) ? 'system.active' : 'methods.not_working')
						<p> "{protocols[method.protocol].name} · {engines[method.engine].name}"
					<div.endpoint>
						<strong> "{protocols[method.protocol].networks.join('/').toUpperCase!} {method.settings.port}"
						if method.settings.path
							<code> method.settings.path
					<outpost-method-usage method=method>
					<button.icon-button.configure type="button" @click=(do edit(method)) aria-label="{t('methods.edit')}: {method.name}" title=t('methods.edit')><outpost-icon name="gear-six">
			unless methods.length
				<p.empty> t('methods.empty')
		<p.note>
			<outpost-icon name="info">
			<span> t('methods.subscription_hint')

	css self
		d:block
		.list-head d:flex ai:center jc:space-between g:20px mb:18px
		.list-head h2 fs:19px c:var(--outpost-navy)
		.list-head p mt:5px fs:13px c:var(--outpost-muted)
		.method-list bd:1px solid var(--outpost-line) rd:12px bgc:white of:hidden
		.method-row d:grid gtc:28px minmax(190px,1fr) minmax(100px,.55fr) minmax(220px,1.2fr) 36px g:18px ai:center p:20px
		.method-row + .method-row border-top:1px solid var(--outpost-line)
		.method-row.dragging bgc:var(--outpost-soft) bxs:inset 3px 0 0 var(--outpost-brand) o:.8
		.method-row.over bxs:inset 0 2px 0 var(--outpost-brand)
		.heading d:flex ai:center flex-wrap:wrap g:5px 10px
		h3 c:var(--outpost-navy) fs:15px fw:700
		.identity p mt:5px fs:12px c:var(--outpost-muted)
		.endpoint strong, .endpoint code d:block fs:12px
		.endpoint code mt:5px c:var(--outpost-muted) overflow-wrap:anywhere
		.state fs:11px fw:600 c:var(--outpost-danger) white-space:nowrap
		.state.working c:var(--outpost-success)
		.note d:flex ai:flex-start g:8px mt:14px fs:12px lh:1.5 c:var(--outpost-muted)
		.empty p:30px c:var(--outpost-muted)
		@media(max-width: 1100px)
			.method-row gtc:28px minmax(0,1fr) minmax(100px,.5fr) 36px g:12px
			outpost-method-usage gc:2 / -1 gr:2
			.configure gc:4 gr:1
		@media(max-width: 760px)
			.method-row gtc:28px minmax(0,1fr) 36px
			.endpoint gc:2 gr:2
			outpost-method-usage gc:2 / -1 gr:3
			.configure gc:3 gr:1
			.list-head ai:flex-start fld:column


tag outpost-method-editor
	store = null
	draft = null
	busy = false
	error = null

	def mount
		const method = store.selected
		if method
			draft = window.structuredClone(method)
		else
			const available = installed.find do(engine)
				!singletonEngine(engine.id) and (engine.id != 'xray' or store.data.methods.items.filter(do(method) method.engine == engine.id).length < 2)
			const engine = available..id or installed[0]..id or 'hysteria'
			draft = {engine: engine, protocol: '', name: '', enabled: true, settings: {port: 1443}}
			choose!
		imba.commit!

	get installed
		store.data.system.versions.filter(do(version) version.installed_version).map do(version) {id: version.engine, name: engines[version.engine].name}

	get editing? do !!store.selected
	get edge? do draft and managedEdge(draft)
	get path? do draft and methodFields(draft.protocol).path
	get fingerprint? do draft and methodFields(draft.protocol).fingerprint

	get choices
		return [] unless draft
		const items = store.data.methods.items
		(store.data.methods.capabilities[draft.engine] or []).filter do(protocol)
			return true if editing?
			!items.some do(method) method.engine == draft.engine and (singletonEngine(draft.engine) or (draft.engine == 'xray' and method.protocol == protocol))

	def choose
		draft.protocol = choices[0] or '' unless choices.includes(draft.protocol)
		defaults!

	def defaults
		return unless draft.protocol
		draft.settings = window.structuredClone(store.data.methods.defaults[draft.engine][draft.protocol])
		draft.name = "{protocols[draft.protocol].name} · {engines[draft.engine].name}"

	def save
		return if busy or !draft.protocol
		busy = true
		error = null
		try
			const payload = {engine: draft.engine, protocol: draft.protocol, name: draft.name, enabled: draft.enabled, settings: {...draft.settings, port: Number(draft.settings.port)}}
			const path = editing? ? "/api/v1/methods/{draft.id}" : '/api/v1/methods'
			await store.api(editing? ? 'PATCH' : 'POST', path, payload)
			await store.load!
			store.close!
		catch issue
			error = issue.message
		finally
			busy = false
			imba.commit!

	def remove
		return if busy or !editing?
		busy = true
		error = null
		try
			await store.api('DELETE', "/api/v1/methods/{draft.id}")
			await store.load!
			store.close!
		catch issue
			error = issue.message
		finally
			busy = false
			imba.commit!

	<self.outpost-modal-backdrop role="dialog" aria-modal="true" aria-label=t('methods.edit') @click.self=store.close>
		<section.outpost-modal.method-modal>
			<header.outpost-modal-header>
				<h2> editing? ? t('methods.edit') : t('methods.add')
				<button.icon-button type="button" @click=store.close aria-label=t('action.close')><outpost-icon name="x">
			if draft
				<div.outpost-modal-body>
					if error
						<p.outpost-error role="alert"> error
					<div.fields>
						<label>
							<span> t('methods.engine')
							<select bind=draft.engine disabled=editing? @change=choose>
								for engine in installed
									<option value=engine.id> engine.name
						<label>
							<span> t('methods.protocol')
							<select bind=draft.protocol disabled=editing? @change=defaults>
								for protocol in choices
									<option value=protocol> protocols[protocol].name
						unless draft.protocol
							<p> t('methods.no_choices')
						if draft.protocol
							<label>
								<span> t('methods.name')
								<input bind=draft.name maxlength="80" required>
							<label>
								<span> t('methods.port')
								<input type="number" bind=draft.settings.port min="1" max="65535" disabled=edge?>
							if path?
								<label>
									<span> draft.protocol == 'grpc' ? t('methods.grpc_service') : t('methods.http_path')
									<input bind=draft.settings.path disabled=edge?>
							if edge?
								<p> t('methods.edge_hint')
							if fingerprint?
								<label>
									<span> t('methods.fingerprint')
									<select bind=draft.settings.fingerprint>
										for value in ['chrome', 'firefox', 'safari', 'none']
											<option value=value> value
							<label.checkbox>
								<input type="checkbox" bind=draft.enabled>
								<span> t('methods.enabled_label')
							<outpost-method-usage method=draft>
					<p.hint> t('methods.credentials_hint')
					<p.hint> draft.engine == 'amneziawg' ? t('methods.peer_hint') : t('methods.apply_hint')
				<footer.outpost-modal-footer>
					if editing?
						<button.outpost-button.quiet.danger type="button" disabled=busy @click=remove> t('methods.delete')
					<div.modal-actions>
						<button.outpost-button.quiet type="button" disabled=busy @click=store.close> t('action.cancel')
						<button.outpost-button type="button" disabled=(busy or !draft.protocol) @click=save> t('action.save')

	css self
		.method-modal w:min(520px,100%)
		.fields d:grid g:16px
		.fields label d:grid g:7px fs:13px c:var(--outpost-text)
		.fields input, .fields select p:10px 12px bd:1px solid var(--outpost-line) rd:8px bgc:white c:var(--outpost-text) w:100%
		.fields input@disabled o:.65 cursor:default
		.fields select@disabled o:.65 cursor:default
		.fields .checkbox d:flex ai:center g:9px
		.fields .checkbox input w:16px
		.fields p, .hint fs:12px c:var(--outpost-muted) lh:1.5
		.hint mt:20px
		.danger c:var(--outpost-danger)

tag outpost-method-usage
	method = null

	get usage do methodUsage(method)
	get details
		usage.profiles.map(do(profile) "{profile.name}: {t('methods.routing_' + profile.routing)}").join('\n')
	get alternatives
		const labels = usage.standalone.map do(profile) t('methods.routes_without', {client: profile.client})
		labels.unshift(t('methods.routes_client')) if usage.profiles.some(do(profile) profile.routing == 'client')
		labels.join(' · ')

	<self>
		<div.clients title=usage.profiles.map(do(profile) profile.minimumCore or profile.name).join('\n')>
			<outpost-icon name="devices">
			<span> usage.clients.join(' · ')
		<div.routing title=details>
			<outpost-icon name="path">
			<span> t('methods.routes_in_profile')
		if alternatives
			<small> alternatives

	css self
		d:grid g:5px fs:12px lh:1.5 c:var(--outpost-muted)
		.clients, .routing d:flex ai:baseline g:6px
		.clients c:var(--outpost-text)
		outpost-icon fs:13px fl:0 0 auto
		small fs:11px
