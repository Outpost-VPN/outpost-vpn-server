import {t} from './i18n.imba'

const choices = {
	ipv6: [{id: false, label: 'network.ipv4'}, {id: true, label: 'network.dual'}]
	quic: [{id: true, label: 'network.quic.block'}, {id: false, label: 'network.quic.allow'}]
	sniffing: [{id: true, label: 'network.on'}, {id: false, label: 'network.off'}]
	dns: [{id: 'fake-ip', label: 'Fake IP'}, {id: 'redir-host', label: 'Redir host'}]
}

tag outpost-network-settings
	store = null
	draft = null
	baseline = null
	ports = {httpPorts: '', tlsPorts: '', quicPorts: ''}
	busy = false
	error = null
	saved = false

	def mount
		reset!

	def reset
		baseline = window.structuredClone(store.data.settings.network)
		draft = window.structuredClone(baseline)
		for own key of ports
			ports[key] = draft.mihomo[key].join(', ')
		error = null
		saved = false

	get dirty?
		return false unless draft
		return true if JSON.stringify(draft) != JSON.stringify(baseline)
		Object.keys(ports).some do(key) ports[key] != baseline.mihomo[key].join(', ')

	get disabled? do busy or !dirty?

	def parse value
		const parts = value.split(',').map do(item) item.trim!
		throw new Error(t('network.ports.error')) unless parts.length and parts.length <= 64
		parts.map do(item)
			throw new Error(t('network.ports.error')) unless /^\d{1,5}(-\d{1,5})?$/.test(item)
			const bounds = item.split('-').map(Number)
			throw new Error(t('network.ports.error')) if bounds.some(do(port) port < 1 or port > 65535)
			throw new Error(t('network.ports.error')) if bounds.length == 2 and bounds[0] > bounds[1]
			bounds.length == 1 ? bounds[0] : bounds.join('-')

	def save
		return if disabled?
		busy = true
		error = null
		saved = false
		try
			const next = window.structuredClone(draft)
			for own key, value of ports
				next.mihomo[key] = parse(value)
			const patch = {mihomo: {}}
			for key in ['ipv6', 'blockQuic']
				patch[key] = next[key] if next[key] != baseline[key]
			for own key, value of next.mihomo
				patch.mihomo[key] = value if JSON.stringify(value) != JSON.stringify(baseline.mihomo[key])
			await store.mutate('PATCH', '/api/v1/settings', {network: patch})
			reset!
			saved = true
		catch issue
			error = issue.message
		finally
			busy = false
			imba.commit!

	<self>
		if draft
			<header>
				<div.mark><outpost-icon name="globe-simple">
				<div>
					<h2> t('network.title')
					<p> t('network.subtitle')
			<div.row>
				<div.copy>
					<strong> t('network.ipv6')
					<small> t('network.ipv6.hint')
				<outpost-settings-select label=t('network.ipv6') value=draft.ipv6 items=choices.ipv6 disabled=busy change=(do(value) draft.ipv6 = value)>
			<div.row>
				<div.copy>
					<strong> 'QUIC / HTTP/3'
					<small> t('network.quic.hint')
				<outpost-settings-select label="QUIC / HTTP/3" value=draft.blockQuic items=choices.quic disabled=busy change=(do(value) draft.blockQuic = value)>
			<details>
				<summary>
					<span> t('network.advanced')
					<outpost-icon name="caret-down">
				<p.scope> t('network.mihomo.hint')
				<div.row>
					<div.copy>
						<strong> t('network.dns')
						<small> t('network.dns.hint')
					<outpost-settings-select label=t('network.dns') value=draft.mihomo.dnsMode items=choices.dns disabled=busy change=(do(value) draft.mihomo.dnsMode = value)>
				<div.row>
					<div.copy>
						<strong> t('network.sniffing')
						<small> t('network.sniffing.hint')
					<outpost-settings-select label=t('network.sniffing') value=draft.mihomo.sniffing items=choices.sniffing disabled=busy change=(do(value) draft.mihomo.sniffing = value)>
				<div.ports>
					<label>
						<span> t('network.http')
						<input type="text" bind=ports.httpPorts disabled=busy dir="ltr" spellcheck="false">
					<label>
						<span> t('network.tls')
						<input type="text" bind=ports.tlsPorts disabled=busy dir="ltr" spellcheck="false">
					<label>
						<span> t('network.quic')
						<input type="text" bind=ports.quicPorts disabled=busy dir="ltr" spellcheck="false">
				<p.scope> t('network.ports.hint')
			<footer>
				<div.delivery role="status">
					<outpost-icon name=(saved ? 'check-circle' : 'arrows-clockwise')>
					<p> saved ? t('network.saved') : t('network.delivery')
				<div.actions>
					if dirty?
						<button.outpost-button.small type="button" disabled=busy @click=reset> t('network.cancel')
					<button.outpost-button.primary.small type="button" disabled=disabled? @click=save> busy ? t('network.saving') : t('network.save')
			if error
				<p.error role="alert"> error

	css self
		d:block p:24px miw:0
		header d:flex ai:center g:13px mb:18px
		.mark s:42px fl:0 0 auto d:grid ja:center rd:11px bgc:var(--outpost-auth-start) c:var(--outpost-brand) fs:22px
		h2 fs:18px fw:750 c:var(--outpost-navy)
		header p mt:5px fs:12px lh:1.5 c:var(--outpost-muted)
		.row d:grid gtc:minmax(0,1fr) minmax(230px,300px) g:24px ai:center py:18px border-top:1px solid var(--outpost-line)
		.copy strong d:block fs:14px fw:700
		.copy small d:block mt:5px maw:640px fs:12px lh:1.5 c:var(--outpost-muted)
		details border-top:1px solid var(--outpost-line)
		summary d:flex ai:center jc:space-between py:17px list-style:none cursor:pointer fs:13px fw:700 c:var(--outpost-brand)
		summary::-webkit-details-marker d:none
		summary outpost-icon tween:transform 150ms
		details[open] summary outpost-icon transform:rotate(180deg)
		.scope fs:12px lh:1.6 c:var(--outpost-muted) mb:16px
		.ports d:grid gtc:repeat(3,minmax(0,1fr)) g:16px py:14px border-top:1px solid var(--outpost-line)
		.ports label d:grid g:8px fs:12px fw:650
		.ports input w:100% miw:0 h:42px box-sizing:border-box px:12px bd:1px solid var(--outpost-line) rd:9px bgc:var(--outpost-white) c:var(--outpost-text) ff:monospace fs:13px
		.ports input@focus outline:2px solid var(--outpost-auth-start) border-color:var(--outpost-brand)
		.ports input@disabled cursor:default
		footer d:flex ai:center jc:space-between g:24px mt:4px pt:18px border-top:1px solid var(--outpost-line)
		.delivery d:flex ai:center g:9px c:var(--outpost-muted) fs:12px lh:1.5 maw:650px
		.delivery outpost-icon fl:0 0 auto fs:18px c:var(--outpost-brand)
		.actions d:flex g:8px fl:0 0 auto
		.actions button@disabled cursor:default o:.5 transform:none bxs:none
		.actions button@disabled@hover bgc:var(--outpost-white) c:var(--outpost-text) bc:var(--outpost-line) transform:none bxs:none
		.actions button.primary@disabled@hover bgc:var(--outpost-brand) c:white
		.error mt:12px fs:12px c:var(--outpost-danger)
		@media(max-width: 680px)
			p:18px
			.row gtc:1fr g:12px
			.ports gtc:1fr
			footer fld:column ai:stretch g:14px
			.actions jc:flex-end
