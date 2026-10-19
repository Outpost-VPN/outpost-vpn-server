import {engines, engineTrafficApproximate} from '../shared/engines.ts'
import {protocols} from '../shared/protocols.ts'
import {managedEdge, singletonEngine, methodFields, methodClientProfiles} from '../shared/connection-methods.ts'
import {t} from './i18n.imba'

tag outpost-method-list
	store = null
	busy = false
	error = null

	get methods do store.data.methods.items

	def edit method = null
		store.selected = method
		store.open('method')

	def status method
		return t('methods.disabled') unless method.enabled
		const engine = engines[method.engine]
		const service = store.data.system.services.find do(item) item.name == engine.service
		service..status == 'active' ? t('methods.enabled') : t('methods.engine_stopped')

	def move index, delta
		return if busy
		const ids = methods.map do(method) method.id
		const next = index + delta
		return if next < 0 or next >= ids.length
		const id = ids.splice(index, 1)[0]
		ids.splice(next, 0, id)
		busy = true
		error = null
		try
			await store.api('POST', '/api/v1/methods/reorder', {ids: ids})
			await store.load!
		catch issue
			error = issue.message
		finally
			busy = false
			imba.commit!

	<self>
		<header.list-head>
			<div>
				<h2> t('methods.title')
				<p> t('methods.order_hint')
			<button.outpost-button type="button" @click=(do edit!)>
				<outpost-icon name="plus">
				<span> t('methods.add')
		if error
			<p.outpost-error role="alert"> error
		<section.method-list>
			for method, index in methods
				<article.method-row key=method.id>
					<div.priority>
						<span> index + 1
						<button type="button" disabled=(busy or index == 0) @click=(do move(index, -1)) aria-label=t('methods.up') title=t('methods.up')><outpost-icon name="arrow-up">
						<button type="button" disabled=(busy or index == methods.length - 1) @click=(do move(index, 1)) aria-label=t('methods.down') title=t('methods.down')><outpost-icon name="arrow-down">
					<div.identity>
						<h3> method.name
						<p> "{protocols[method.protocol].name} · {engines[method.engine].name}"
					<div.endpoint>
						<strong> "{protocols[method.protocol].networks.join('/').toUpperCase!} {method.settings.port}"
						if method.settings.path
							<code> method.settings.path
					<div.state .enabled=method.enabled> status(method)
					<button.configure type="button" @click=(do edit(method)) aria-label="{t('methods.edit')}: {method.name}" title=t('methods.edit')><outpost-icon name="gear-six">
					<outpost-method-support method=method>
			unless methods.length
				<p.empty> t('methods.empty')
		<p.note>
			<outpost-icon name="info">
			<span> t('methods.subscription_hint')
		<p.note> t('methods.network_hint')
		<p.note> t('methods.profile_hint')

	css self
		d:block
		.list-head d:flex ai:center jc:space-between g:20px mb:18px
		.list-head h2 fs:19px c:var(--outpost-navy)
		.list-head p mt:5px fs:13px c:var(--outpost-muted)
		.method-list bd:1px solid var(--outpost-line) rd:12px bgc:white of:hidden
		.method-row d:grid gtc:72px minmax(160px,1fr) minmax(140px,.8fr) minmax(130px,.7fr) 36px g:18px ai:center p:20px
		.method-row + .method-row border-top:1px solid var(--outpost-line)
		.priority d:flex ai:center g:3px c:var(--outpost-muted)
		.priority span w:20px fs:13px
		.priority button, .configure s:25px d:grid ja:center p:0 bd:0 rd:6px bgc:transparent c:var(--outpost-brand) cursor:pointer
		.priority button@disabled c:var(--outpost-muted) o:.35 cursor:default
		.configure s:34px bd:1px solid var(--outpost-line)
		outpost-method-support gc:2 / -1
		h3 c:var(--outpost-navy) fs:15px fw:700
		.identity p mt:5px fs:12px c:var(--outpost-muted)
		.endpoint strong, .endpoint code d:block fs:12px
		.endpoint code mt:5px c:var(--outpost-muted) overflow-wrap:anywhere
		.state fs:12px c:var(--outpost-muted)
		.state.enabled c:var(--outpost-navy)
		.note d:flex ai:flex-start g:8px mt:14px fs:12px lh:1.5 c:var(--outpost-muted)
		.empty p:30px c:var(--outpost-muted)
		@media(max-width: 760px)
			.method-row gtc:72px minmax(0,1fr) 34px g:12px
			.endpoint gc:2 gr:2
			.state gc:2 gr:3
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
							<outpost-method-support method=draft>
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

tag outpost-method-support
	method = null

	get profiles do methodClientProfiles(method)
	get basic? do profiles.some do(profile) !profile.minimumCore
	get approximate? do engineTrafficApproximate(method.engine)
	get detail do t(approximate? ? 'methods.approximate_traffic_details' : 'methods.traffic_details')

	<self>
		<span.traffic title=detail>
			<outpost-icon name="chart-line">
			<span> t(approximate? ? 'methods.approximate_traffic' : 'methods.traffic')
		<details>
			<summary> t(basic? ? 'methods.basic_profile' : 'methods.special_profile')
			<p> detail
			<ul>
				for profile in profiles
					<li>
						<strong> profile.name
						<span> profile.minimumCore or t('methods.compatible_client')
						if ['naive', 'amneziawg'].includes(profile.id)
							<small> t('methods.native_profile')

	css self
		d:flex ai:baseline flex-wrap:wrap g:8px 20px fs:12px lh:1.5 c:var(--outpost-muted)
		.traffic d:inline-flex ai:center g:5px
		.traffic .ph fs:14px
		details fl:1 1 220px
		summary c:var(--outpost-brand) cursor:pointer w:fit-content
		p mt:8px
		ul list-style:none p:0 mt:8px d:grid g:7px
		li d:flex flex-wrap:wrap g:3px 8px
		strong c:var(--outpost-text) fw:600
		small fl:1 1 100% fs:11px
