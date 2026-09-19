import {t} from './i18n.imba'

tag outpost-mcp-connection
	copied = false
	error = null
	get address do "{window.location.origin}/api/v1/mcp"

	def copy
		error = null
		try
			await window.navigator.clipboard.writeText(address)
			copied = true
		catch issue
			error = issue.message

	<self>
		<strong> t('mcp.title')
		<p> t('mcp.hint')
		<div.address>
			<input type="text" readonly value=address dir="ltr" aria-label=t('mcp.address')>
			<button type="button" @click=copy aria-label=t('mcp.copy') title=t('mcp.copy')><outpost-icon name=(copied ? 'check' : 'copy')>
		<p> t('mcp.token')
		<code dir="ltr"> 'Authorization: Bearer <token>'
		if copied
			<p role="status"> t('mcp.copied')
		if error
			<p.error role="alert"> error

	css self
		d:block my:14px p:14px rd:10px bgc:var(--outpost-white) bd:1px solid var(--outpost-line) miw:0
		strong fs:13px c:var(--outpost-navy)
		p mt:7px fs:12px lh:1.5 c:var(--outpost-muted)
		.address d:flex g:8px my:10px
		input fl:1 miw:0 w:100% box-sizing:border-box h:38px px:10px rd:8px bd:1px solid var(--outpost-line) bgc:var(--outpost-soft) c:var(--outpost-text) ff:monospace fs:12px
		button s:38px fl:0 0 auto d:grid ja:center rd:8px bd:1px solid var(--outpost-line) bgc:var(--outpost-white) c:var(--outpost-brand) cursor:pointer
		button@hover bgc:var(--outpost-soft)
		code d:block mt:6px fs:12px overflow-wrap:anywhere c:var(--outpost-text)
		.error c:var(--outpost-danger)
